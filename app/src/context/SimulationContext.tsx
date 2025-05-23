// src/context/SimulationContext.tsx
"use client"; // Add 'use client' directive

import type { PropsWithChildren } from "react";
import * as React from "react";

// Define the stage names (optional, but good for clarity)
const STAGE_NAMES = ["IF", "ID", "EX", "MEM", "WB"] as const;
type StageName = (typeof STAGE_NAMES)[number];

// Define instruction types and hazard types
type InstructionType = "R" | "I" | "J";
type HazardType = "RAW" | "WAW" | "NONE";

// Define register usage tracking
interface RegisterUsage {
  rs: number; // Source register 1
  rt: number; // Source register 2
  rd: number; // Destination register
  opcode: number; // Operation code
  funct: number; // Function code for R-type
  type: InstructionType;
}

// Define hazard information
interface HazardInfo {
  type: HazardType;
  description: string;
  canForward: boolean;
  stallCycles: number;
}

// Define forwarding information
interface ForwardingInfo {
  from: number; // Source instruction index
  to: number; // Target instruction index
  fromStage: StageName; // Stage providing the data
  toStage: StageName; // Stage receiving the data
  register: string; // Register being forwarded
}

// Define the shape of the context state
interface SimulationState {
  instructions: string[];
  currentCycle: number;
  maxCycles: number;
  isRunning: boolean;
  stageCount: number;
  // Map instruction index to its current stage index (0-based) or null if not started/finished
  instructionStages: Record<number, number | null>;
  isFinished: boolean; // Track if simulation completed

  // New fields for hazard detection
  registerUsage: Record<number, RegisterUsage>;
  hazards: Record<number, HazardInfo>;
  forwardings: Record<number, ForwardingInfo[]>;
  stalls: Record<number, number>; // Map instruction index to number of stall cycles

  // Track current execution state
  currentStallCycles: number;

  // Forwarding enabled flag
  forwardingEnabled: boolean;
}

// Define the shape of the context actions
interface SimulationActions {
  startSimulation: (submittedInstructions: string[]) => void;
  resetSimulation: () => void;
  pauseSimulation: () => void;
  resumeSimulation: () => void;
  setForwardingEnabled: (enabled: boolean) => void;
}

// Create the contexts
const SimulationStateContext = React.createContext<SimulationState | undefined>(
  undefined
);
const SimulationActionsContext = React.createContext<
  SimulationActions | undefined
>(undefined);

const DEFAULT_STAGE_COUNT = STAGE_NAMES.length; // Use length of defined stages

const initialState: SimulationState = {
  instructions: [],
  currentCycle: 0,
  maxCycles: 0,
  isRunning: false,
  stageCount: DEFAULT_STAGE_COUNT,
  instructionStages: {},
  isFinished: false,

  // Initialize new fields
  registerUsage: {},
  hazards: {},
  forwardings: {},
  stalls: {},
  currentStallCycles: 0,
  forwardingEnabled: true,
};

// Function to parse a MIPS instruction hex and extract register usage
const parseInstruction = (hexInstruction: string): RegisterUsage => {
  // Convert hex to binary (32 bits)
  const binary = parseInt(hexInstruction, 16).toString(2).padStart(32, "0");

  // Extract fields
  const opcode = parseInt(binary.substring(0, 6), 2);
  const rs = parseInt(binary.substring(6, 11), 2);
  const rt = parseInt(binary.substring(11, 16), 2);

  // Determine instruction type and extract rd
  let type: InstructionType = "R";
  let rd = 0;
  let funct = 0;

  if (opcode === 0) {
    // R-type
    type = "R";
    rd = parseInt(binary.substring(16, 21), 2);
    funct = parseInt(binary.substring(26, 32), 2);
  } else if (opcode === 2 || opcode === 3) {
    // J-type (j, jal)
    type = "J";
    rd = opcode === 3 ? 31 : 0; // jal uses $ra (r31)
    funct = 0;
  } else {
    // I-type
    type = "I";
    // For I-type, destination is rt for load/immediate ops, but none for store/branch
    if (opcode >= 32 && opcode <= 37) {
      // Load instructions
      rd = rt;
    } else if (opcode >= 8 && opcode <= 15) {
      // Immediate instructions
      rd = rt;
    } else {
      rd = 0; // Store/branch instructions don't write to registers
    }
  }

  return { rs, rt, rd, opcode, funct, type };
};

// Function to detect hazards between instructions
const detectHazards = (
  instructions: string[],
  registerUsage: Record<number, RegisterUsage>,
  forwardingEnabled: boolean
): [
  Record<number, HazardInfo>,
  Record<number, ForwardingInfo[]>,
  Record<number, number>
] => {
  const hazards: Record<number, HazardInfo> = {};
  const forwardings: Record<number, ForwardingInfo[]> = {};
  const stalls: Record<number, number> = {};

  // Initialize with no hazards
  instructions.forEach((_, index) => {
    hazards[index] = {
      type: "NONE",
      description: "No hazard",
      canForward: false,
      stallCycles: 0,
    };
    forwardings[index] = [];
    stalls[index] = 0;
  });

  // Check for hazards between instructions
  for (let i = 1; i < instructions.length; i++) {
    const currentInst = registerUsage[i];

    // Skip jump instructions for hazard detection
    if (currentInst.type === "J") continue;

    // Track RAW hazards for this instruction
    const rawHazards: Array<{
      sourceReg: string;
      regNum: number;
      fromInst: number;
      distance: number;
    }> = [];

    let maxStallCycles = 0;
    let hazardDescription = "";

    // Only check the previous 1 or 2 instructions for RAW hazards
    for (let j = Math.max(0, i - 2); j < i; j++) {
      const prevInst = registerUsage[j];
      const distance = i - j; // Will only be 1 or 2 here

      // Skip if previous instruction doesn't write to any register
      if (prevInst.rd === 0) continue;

      // Check for RAW hazards on rs
      if (currentInst.rs === prevInst.rd) {
        rawHazards.push({
          sourceReg: "rs",
          regNum: currentInst.rs,
          fromInst: j,
          distance: distance,
        });

        // When forwarding is disabled, calculate stalls
        if (!forwardingEnabled) {
          const stallsNeeded = 3 - distance;
          if (stallsNeeded > maxStallCycles) {
            maxStallCycles = stallsNeeded;
            hazardDescription = `rs($${currentInst.rs}) depends on instruction ${j}`;
          }
        }
      }

      // Check for RAW hazards on rt
      if (currentInst.rt === prevInst.rd) {
        rawHazards.push({
          sourceReg: "rt",
          regNum: currentInst.rt,
          fromInst: j,
          distance: distance,
        });

        // When forwarding is disabled, calculate stalls
        if (!forwardingEnabled) {
          const stallsNeeded = 3 - distance;
          if (stallsNeeded > maxStallCycles) {
            maxStallCycles = stallsNeeded;
            hazardDescription = `rt($${currentInst.rt}) depends on instruction ${j}`;
          }
        }
      }
    }

    // If we found RAW hazards
    if (rawHazards.length > 0) {
      // Set up hazard info
      hazards[i] = {
        type: "RAW",
        description:
          hazardDescription ||
          `Depends on previous instruction ${rawHazards[0].fromInst}`,
        canForward: forwardingEnabled,
        stallCycles: forwardingEnabled ? 0 : maxStallCycles,
      };

      // Add stalls if needed
      if (!forwardingEnabled && maxStallCycles > 0) {
        stalls[i] = maxStallCycles;
      }
      // Add forwarding info if enabled
      else if (forwardingEnabled) {
        forwardings[i] = rawHazards.map((hazard) => ({
          from: hazard.fromInst,
          to: i,
          fromStage: hazard.distance === 1 ? "EX" : "MEM",
          toStage: "EX",
          register: `$${hazard.regNum}`,
        }));
      }
    }
    // If no RAW, check for WAW hazards
    else if (currentInst.rd !== 0) {
      for (let j = Math.max(0, i - 2); j < i; j++) {
        const prevInst = registerUsage[j];

        // WAW hazard (write after write)
        if (prevInst.rd !== 0 && currentInst.rd === prevInst.rd) {
          hazards[i] = {
            type: "WAW",
            description: `Both instructions write to $${currentInst.rd}`,
            canForward: true,
            stallCycles: 0,
          };
          break;
        }
      }
    }
  }

  return [hazards, forwardings, stalls];
};

// Calculate total stall cycles before a specific instruction
const calculatePrecedingStalls = (
  stalls: Record<number, number>,
  index: number
): number => {
  let totalStalls = 0;
  for (let i = 0; i < index; i++) {
    totalStalls += stalls[i] || 0;
  }
  return totalStalls;
};

// Function to calculate the next state based on the current state
const calculateNextState = (currentState: SimulationState): SimulationState => {
  if (!currentState.isRunning || currentState.isFinished) {
    return currentState; // No changes if not running or already finished
  }

  const nextCycle = currentState.currentCycle + 1;
  const newInstructionStages: Record<number, number | null> = {};
  let activeInstructions = 0;

  // Handle current stall situation
  let newStallCycles = currentState.currentStallCycles;
  if (newStallCycles > 0) {
    newStallCycles--; // Decrement stall counter
    // During a stall, instruction stages don't advance
    return {
      ...currentState,
      currentCycle: nextCycle,
      instructionStages: currentState.instructionStages,
      currentStallCycles: newStallCycles,
    };
  }

  // Calculate total stall cycles
  let totalStallCycles = 0;
  Object.values(currentState.stalls).forEach((stalls) => {
    totalStallCycles += stalls;
  });

  currentState.instructions.forEach((_, index) => {
    // Calculate the stage index for the instruction in the next cycle
    // Adjusted for stalls before this instruction
    const precedingStalls = calculatePrecedingStalls(
      currentState.stalls,
      index
    );
    const stageIndex = nextCycle - index - 1 - precedingStalls;

    if (stageIndex >= 0 && stageIndex < currentState.stageCount) {
      newInstructionStages[index] = stageIndex;
      activeInstructions++; // Count instructions currently in the pipeline

      // Check if we need to introduce a stall based on the current instruction
      if (
        stageIndex === 1 &&
        currentState.stalls[index] > 0 &&
        newStallCycles === 0
      ) {
        // We're about to enter EX stage but need to stall
        newStallCycles = currentState.stalls[index];
      }
    } else {
      newInstructionStages[index] = null; // Not in pipeline (either hasn't started or has finished)
    }
  });

  // The simulation completes *after* the last instruction finishes the last stage
  const completionCycle =
    currentState.instructions.length > 0
      ? currentState.instructions.length +
        currentState.stageCount -
        1 +
        totalStallCycles
      : 0;

  const isFinished = nextCycle > completionCycle;
  const isRunning = !isFinished; // Stop running when finished

  return {
    ...currentState,
    currentCycle: isFinished ? completionCycle : nextCycle, // Cap cycle at completion
    instructionStages: newInstructionStages,
    isRunning: isRunning,
    isFinished: isFinished,
    currentStallCycles: newStallCycles,
  };
};

// Create the provider component
export function SimulationProvider({ children }: PropsWithChildren) {
  const [simulationState, setSimulationState] =
    React.useState<SimulationState>(initialState);
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const runClock = React.useCallback(() => {
    clearTimer(); // Clear any existing timer
    if (!simulationState.isRunning || simulationState.isFinished) return; // Don't start timer if not running or finished

    intervalRef.current = setInterval(() => {
      setSimulationState((prevState) => {
        const nextState = calculateNextState(prevState);
        // Check if the simulation just finished in this step
        if (nextState.isFinished && !prevState.isFinished) {
          clearTimer(); // Stop the clock immediately
        }
        return nextState;
      });
    }, 1000); // Advance cycle every 1 second
  }, [simulationState.isRunning, simulationState.isFinished]); // Dependencies

  const resetSimulation = React.useCallback(() => {
    clearTimer();
    setSimulationState((prevState) => ({
      ...initialState,
      forwardingEnabled: prevState.forwardingEnabled, // Preserve forwarding setting
    }));
  }, []);

  const startSimulation = React.useCallback(
    (submittedInstructions: string[]) => {
      clearTimer(); // Clear previous timer just in case
      if (submittedInstructions.length === 0) {
        resetSimulation(); // Reset if no instructions submitted
        return;
      }

      // Parse instructions to extract register usage
      const registerUsage: Record<number, RegisterUsage> = {};
      submittedInstructions.forEach((inst, index) => {
        registerUsage[index] = parseInstruction(inst);
      });

      // Detect hazards and determine forwarding/stalls
      const [hazards, forwardings, stalls] = detectHazards(
        submittedInstructions,
        registerUsage,
        simulationState.forwardingEnabled
      );

      // Calculate total stall cycles
      let totalStallCycles = 0;
      Object.values(stalls).forEach((stall) => {
        totalStallCycles += stall;
      });

      const calculatedMaxCycles =
        submittedInstructions.length +
        DEFAULT_STAGE_COUNT -
        1 +
        totalStallCycles;
      const initialStages: Record<number, number | null> = {};

      // Initialize stages for cycle 1
      submittedInstructions.forEach((_, index) => {
        const stageIndex = 1 - index - 1; // Calculate stage for cycle 1
        if (stageIndex >= 0 && stageIndex < DEFAULT_STAGE_COUNT) {
          initialStages[index] = stageIndex;
        } else {
          initialStages[index] = null;
        }
      });

      setSimulationState({
        instructions: submittedInstructions,
        currentCycle: 1, // Start from cycle 1
        maxCycles: calculatedMaxCycles,
        isRunning: true,
        stageCount: DEFAULT_STAGE_COUNT,
        instructionStages: initialStages, // Set initial stages for cycle 1
        isFinished: false,

        // New fields initialization
        registerUsage,
        hazards,
        forwardings,
        stalls,
        currentStallCycles: 0,
        forwardingEnabled: simulationState.forwardingEnabled,
      });
      // runClock will be triggered by the useEffect below when isRunning becomes true
    },
    [resetSimulation, simulationState.forwardingEnabled]
  );

  const pauseSimulation = () => {
    setSimulationState((prevState) => {
      if (prevState.isRunning) {
        clearTimer();
        return { ...prevState, isRunning: false };
      }
      return prevState; // No change if already paused
    });
  };

  const resumeSimulation = () => {
    setSimulationState((prevState) => {
      // Resume only if paused, started, and not finished
      if (
        !prevState.isRunning &&
        prevState.currentCycle > 0 &&
        !prevState.isFinished
      ) {
        return { ...prevState, isRunning: true };
      }
      return prevState; // No change if running, not started, or finished
    });
    // runClock will be triggered by useEffect
  };

  const setForwardingEnabled = (enabled: boolean) => {
    // Cambia el estado inmediatamente, independiente del estado de la simulación
    setSimulationState((prevState) => {
      return { ...prevState, forwardingEnabled: enabled };
    });
  };

  // Effect to manage the interval timer based on isRunning state
  React.useEffect(() => {
    if (simulationState.isRunning && !simulationState.isFinished) {
      runClock();
    } else {
      clearTimer();
    }
    // Cleanup timer on unmount or when isRunning/isFinished changes
    return clearTimer;
  }, [simulationState.isRunning, simulationState.isFinished, runClock]);

  // Effect to add animation styles to the document
  React.useEffect(() => {
    // Add the animation keyframes to the document
    const styleElement = document.createElement("style");
    styleElement.textContent = `
      @keyframes pulse-bg {
        0%, 100% { 
          background-color: rgb(219 234 254);
          box-shadow: 0 0 0 2px rgb(96 165 250);
        }
        50% { 
          background-color: rgb(147 197 253);
          box-shadow: 0 0 0 3px rgb(59 130 246);
        }
      }
      .animate-pulse-bg {
        animation: pulse-bg 1.5s ease-in-out infinite;
      }
      
      @keyframes pulse-bg-red {
        0%, 100% { 
          background-color: rgb(254 242 242);
          box-shadow: 0 0 0 2px rgb(248 113 113);
        }
        50% { 
          background-color: rgb(252 165 165);
          box-shadow: 0 0 0 3px rgb(239 68 68);
        }
      }
      .animate-pulse-bg-red {
        animation: pulse-bg-red 1.5s ease-in-out infinite;
      }
      
      @keyframes pulse-bg-green {
        0%, 100% { 
          background-color: rgb(240 253 244);
          box-shadow: 0 0 0 2px rgb(74 222 128);
        }
        50% { 
          background-color: rgb(187 247 208);
          box-shadow: 0 0 0 3px rgb(34 197 94);
        }
      }
      .animate-pulse-bg-green {
        animation: pulse-bg-green 1.5s ease-in-out infinite;
      }
      
      /* Dark mode equivalents */
      @media (prefers-color-scheme: dark) {
        @keyframes pulse-bg {
          0%, 100% { 
            background-color: rgb(30 58 138);
            box-shadow: 0 0 0 2px rgb(59 130 246);
          }
          50% { 
            background-color: rgb(37 99 235);
            box-shadow: 0 0 0 3px rgb(96 165 250);
          }
        }
        @keyframes pulse-bg-red {
          0%, 100% { 
            background-color: rgb(127 29 29);
            box-shadow: 0 0 0 2px rgb(239 68 68);
          }
          50% { 
            background-color: rgb(185 28 28);
            box-shadow: 0 0 0 3px rgb(248 113 113);
          }
        }
        @keyframes pulse-bg-green {
          0%, 100% { 
            background-color: rgb(6 78 59);
            box-shadow: 0 0 0 2px rgb(34 197 94);
          }
          50% { 
            background-color: rgb(5 150 105);
            box-shadow: 0 0 0 3px rgb(74 222 128);
          }
        }
      }
      
      /* Add Montserrat font class */
      .font-montserrat {
        font-family: var(--font-montserrat), system-ui, sans-serif;
      }
    `;
    document.head.appendChild(styleElement);

    // Cleanup function
    return () => {
      if (document.head.contains(styleElement)) {
        document.head.removeChild(styleElement);
      }
    };
  }, []);

  // State value derived directly from simulationState
  const stateValue: SimulationState = simulationState;

  const actionsValue: SimulationActions = React.useMemo(
    () => ({
      startSimulation,
      resetSimulation,
      pauseSimulation,
      resumeSimulation,
      setForwardingEnabled,
    }),
    [startSimulation, resetSimulation] // pause/resume/forwarding don't change
  );

  return (
    <SimulationStateContext.Provider value={stateValue}>
      <SimulationActionsContext.Provider value={actionsValue}>
        {children}
      </SimulationActionsContext.Provider>
    </SimulationStateContext.Provider>
  );
}

// Custom hooks for easy context consumption
export function useSimulationState() {
  const context = React.useContext(SimulationStateContext);
  if (context === undefined) {
    throw new Error(
      "useSimulationState must be used within a SimulationProvider"
    );
  }
  return context;
}

export function useSimulationActions() {
  const context = React.useContext(SimulationActionsContext);
  if (context === undefined) {
    throw new Error(
      "useSimulationActions must be used within a SimulationProvider"
    );
  }
  return context;
}
