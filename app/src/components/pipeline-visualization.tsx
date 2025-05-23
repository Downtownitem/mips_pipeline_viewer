// src/components/pipeline-visualization.tsx
"use client";

import type * as React from "react";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Download,
  Code2,
  Cpu,
  MemoryStick,
  CheckSquare,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSimulationState } from "@/context/SimulationContext"; // Import context hook
import { Badge } from "@/components/ui/badge"; // Import Badge component if available

const STAGES = [
  { name: "IF", icon: Download },
  { name: "ID", icon: Code2 },
  { name: "EX", icon: Cpu },
  { name: "MEM", icon: MemoryStick },
  { name: "WB", icon: CheckSquare },
] as const;

export function PipelineVisualization() {
  // Get state from context
  const {
    instructions,
    currentCycle: cycle,
    maxCycles, // Max cycles determines the number of columns
    isRunning,
    instructionStages, // Use the pre-calculated stages
    isFinished, // Use the finished flag from context

    // New fields for hazard detection
    hazards,
    forwardings,
    stalls,
    registerUsage,
    currentStallCycles,
  } = useSimulationState();

  // Use maxCycles for the number of columns if it's calculated, otherwise 0
  const totalCyclesToDisplay = maxCycles > 0 ? maxCycles : 0;
  const cycleNumbers = Array.from(
    { length: totalCyclesToDisplay },
    (_, i) => i + 1
  );

  // Function to calculate stalls before an instruction
  const calculatePrecedingStalls = (index: number): number => {
    let totalStalls = 0;
    for (let i = 0; i < index; i++) {
      totalStalls += stalls[i] || 0;
    }
    return totalStalls;
  };

  // Helper to determine if a cell represents a stall
  const isStallCell = (instIndex: number, cycleNum: number): boolean => {
    // Only instructions with stalls can have stall cells
    if (stalls[instIndex] <= 0) return false;

    // Calculate the expected stage without stalls
    const expectedCycleWithoutStalls = instIndex + 2; // ID stage is when stalls occur
    const precedingStalls = calculatePrecedingStalls(instIndex);

    // This is a stall cell if it falls within the stall period
    return (
      cycleNum > expectedCycleWithoutStalls + precedingStalls &&
      cycleNum <=
        expectedCycleWithoutStalls + precedingStalls + stalls[instIndex]
    );
  };

  // Helper to determine if this cell shows forwarding
  const getForwardingInfo = (instIndex: number, cycleNum: number) => {
    // Check if this instruction has any forwarding
    if (!forwardings[instIndex] || forwardings[instIndex].length === 0) {
      return { isForwarding: false };
    }

    // Calculate expected stage for this cycle
    const precedingStalls = calculatePrecedingStalls(instIndex);
    const expectedStage = cycleNum - instIndex - 1 - precedingStalls;

    // For EX stage (index 2), show forwarding
    if (expectedStage === 2) {
      return {
        isForwarding: true,
        forwardingInfo: forwardings[instIndex],
      };
    }

    return { isForwarding: false };
  };

  // Helper to check if a cell is in the current active column
  const isInCurrentColumn = (cycleNum: number): boolean => {
    return cycleNum === cycle;
  };

  // Determine current stage and cell state
  const getCellState = (instIndex: number, cycleNum: number) => {
    const precedingStalls = calculatePrecedingStalls(instIndex);

    // Check if this is a stall cell
    if (isStallCell(instIndex, cycleNum)) {
      return {
        type: "stall",
        stage: null,
        isCurrentCell: isInCurrentColumn(cycleNum),
      };
    }

    // Calculate expected stage accounting for stalls
    const expectedStageIndex = cycleNum - instIndex - 1 - precedingStalls;
    const currentStageIndex = instructionStages[instIndex]; // Current stage from context

    // Determine if this cell is in the pipeline
    const isInPipeline =
      expectedStageIndex >= 0 && expectedStageIndex < STAGES.length;
    const stageData = isInPipeline ? STAGES[expectedStageIndex] : null;

    // Check forwarding
    const { isForwarding, forwardingInfo } = getForwardingInfo(
      instIndex,
      cycleNum
    );

    // Determine if this is the current active cell
    const isCurrentCell =
      currentStageIndex !== null &&
      expectedStageIndex === currentStageIndex &&
      cycleNum === cycle;

    if (isForwarding) {
      return {
        type: "forwarding",
        stage: stageData,
        isCurrentCell: isCurrentCell || isInCurrentColumn(cycleNum),
        forwardingInfo,
      };
    }

    return {
      type: isInPipeline ? "normal" : "empty",
      stage: stageData,
      isCurrentCell: isCurrentCell || isInCurrentColumn(cycleNum),
    };
  };

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader>
        <CardTitle>Pipeline Progress with</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table className="min-w-max">
            <TableCaption>MIPS instruction pipeline visualization</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px] sticky left-0 bg-card z-10 border-r">
                  Instruction
                </TableHead>
                <TableHead className="w-[180px] sticky left-[150px] bg-card z-10 border-r">
                  Hazard & Forwarding
                </TableHead>
                {cycleNumbers.map((c) => (
                  <TableHead key={`cycle-${c}`} className="text-center w-16">
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {instructions.map((inst, instIndex) => (
                <TableRow key={`inst-${instIndex}`}>
                  {/* Instruction hex code */}
                  <TableCell className="font-mono sticky left-0 bg-card z-10 border-r">
                    {inst}
                    {registerUsage[instIndex] && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {registerUsage[instIndex].type}-type: rs=$
                        {registerUsage[instIndex].rs}, rt=$
                        {registerUsage[instIndex].rt}
                        {registerUsage[instIndex].rd !== 0 &&
                          `, rd=${registerUsage[instIndex].rd}`}
                      </div>
                    )}
                  </TableCell>

                  {/* Hazard information */}
                  <TableCell className="sticky left-[150px] bg-card z-10 border-r">
                    {hazards[instIndex]?.type !== "NONE" && (
                      <div className="flex flex-col gap-1 items-start">
                        <div className="flex items-start gap-1">
                          <Badge
                            className={cn(
                              hazards[instIndex].type === "RAW"
                                ? "border-red-500 bg-red-100 text-red-500"
                                : "border-yellow-500 bg-yellow-100 text-yellow-500",
                              "px-2 border-[1px] rounded-lg"
                            )}
                          >
                            {hazards[instIndex].type}
                          </Badge>
                          {hazards[instIndex].canForward &&
                            forwardings[instIndex]?.length > 0 && (
                              <Badge className="border-[1px] px-2 bg-green-100 text-green-500 border-green-500 rounded-lg">
                                FORWARDING
                              </Badge>
                            )}
                          {stalls[instIndex] > 0 && (
                            <Badge className="border-[1px] px-2 bg-red-100 text-red-500 border-red-500 rounded-lg">
                              STALL ({stalls[instIndex]})
                            </Badge>
                          )}
                        </div>

                        {hazards[instIndex].canForward &&
                          forwardings[instIndex]?.length > 0 && (
                            <div className="flex items-center gap-1">
                              {forwardings[instIndex].map((fw, idx) => (
                                <span
                                  key={idx}
                                  className="text-xs border px-2 bg-black/1 text-black border-black/50 rounded-lg"
                                >
                                  {fw.fromStage} {fw.register} → {fw.toStage}{" "}
                                  {fw.to}
                                </span>
                              ))}
                            </div>
                          )}

                        {/*<span className="text-xs mt-1">
                          {hazards[instIndex].description}
                        </span>*/}
                      </div>
                    )}
                  </TableCell>

                  {/* Pipeline stages for each cycle */}
                  {cycleNumbers.map((c) => {
                    const cellState = getCellState(instIndex, c);

                    // Determine highlight based on current column and cell content
                    const isActiveColumn = c === cycle;
                    const hasContent = cellState.type !== "empty";

                    // Define cell styling based on its state
                    const cellStyle =
                      cellState.type === "stall"
                        ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                        : cellState.type === "forwarding"
                        ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                        : cellState.type === "normal"
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-background";

                    // Define animation class for current column - only for cells with content
                    const animationClass =
                      isActiveColumn && hasContent && isRunning && !isFinished
                        ? cellState.type === "stall"
                          ? "animate-pulse-bg-red"
                          : cellState.type === "forwarding"
                          ? "animate-pulse-bg-green"
                          : "animate-pulse-bg"
                        : "";

                    // Define highlight class for current column - only for cells with content
                    const highlightClass =
                      isActiveColumn && hasContent
                        ? cellState.type === "stall"
                          ? "bg-red-200 dark:bg-red-800/50"
                          : cellState.type === "forwarding"
                          ? "bg-green-200 dark:bg-green-800/50"
                          : "bg-accent text-accent-foreground"
                        : "";

                    return (
                      <TableCell
                        key={`inst-${instIndex}-cycle-${c}`}
                        className={cn(
                          "text-center w-16 h-14 transition-colors duration-300",
                          cellStyle,
                          isActiveColumn ? highlightClass : "",
                          animationClass
                        )}
                      >
                        {/* Stall indicator */}
                        {cellState.type === "stall" && (
                          <div className="flex flex-col items-center justify-center">
                            <AlertTriangle className="w-4 h-4 mb-1 text-red-500" />
                            <span className="text-xs font-semibold">STALL</span>
                          </div>
                        )}

                        {/* Normal stage indicator */}
                        {cellState.type === "normal" && cellState.stage && (
                          <div className="flex flex-col items-center justify-center">
                            <cellState.stage.icon className="w-4 h-4 mb-1" />
                            <span className="text-xs">
                              {cellState.stage.name}
                            </span>
                          </div>
                        )}

                        {/* Forwarding indicator */}
                        {cellState.type === "forwarding" && cellState.stage && (
                          <div className="flex flex-col items-center justify-center">
                            <div className="flex items-center justify-center mb-1 gap-1">
                              <cellState.stage.icon className="w-4 h-4" />
                              <Zap className="w-3 h-3 text-green-500" />
                            </div>
                            <span className="text-xs">
                              {cellState.stage.name}
                            </span>
                          </div>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Add legend */}
        <div className="flex flex-wrap gap-4 mt-4 text-sm">
          <div className="flex items-center">
            <div className="w-4 h-4 bg-accent mr-2 rounded-sm"></div>
            <span>Current Stage</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-secondary mr-2 rounded-sm"></div>
            <span>Completed Stage</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-red-100 dark:bg-red-900/30 mr-2 rounded-sm"></div>
            <span>Stall</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-100 dark:bg-green-900/30 mr-2 rounded-sm"></div>
            <span>Forwarding</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
