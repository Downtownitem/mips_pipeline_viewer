// src/components/instruction-input.tsx
"use client";

import type * as React from "react";
import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  useSimulationActions,
  useSimulationState,
} from "@/context/SimulationContext"; // Import context hooks
import { Play, Pause, RotateCcw, AlertTriangle, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch"; // Import Switch if available

interface InstructionInputProps {
  onInstructionsSubmit: (instructions: string[]) => void;
  onReset: () => void;
  isRunning: boolean; // Keep isRunning prop for button state logic
}

const HEX_REGEX = /^[0-9a-fA-F]{8}$/; // Basic check for 8 hex characters

export function InstructionInput({
  onInstructionsSubmit,
  onReset,
  isRunning,
}: InstructionInputProps) {
  const [inputText, setInputText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const { pauseSimulation, resumeSimulation, setForwardingEnabled } =
    useSimulationActions();
  const {
    currentCycle,
    isFinished,
    instructions,
    hazards,
    stalls,
    forwardingEnabled,
    forwardings,
  } = useSimulationState();

  // Only clear errors on reset, but keep the input text
  useEffect(() => {
    if (instructions.length === 0) {
      setError(null); // Clear errors on reset
      // Removed the line that was clearing inputText
    }
  }, [instructions]);

  const hasStarted = currentCycle > 0;
  // Can only pause/resume if started and not finished
  const canPauseResume = hasStarted && !isFinished;
  // Input/Start button should be disabled if simulation has started and isn't finished
  const disableInputAndStart = hasStarted && !isFinished;

  // Count hazards and stalls
  const hazardCount = Object.values(hazards).filter(
    (h) => h.type !== "NONE"
  ).length;
  const stallCount = Object.values(stalls).reduce((sum, s) => sum + s, 0);
  const forwardingCount = Object.values(forwardings).filter(
    (f) => f.length > 0
  ).length;

  const handleSubmit = () => {
    setError(null);
    const lines = inputText.trim().split("\n");
    const currentInstructions = lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (currentInstructions.length === 0) {
      setError(
        "Please enter at least one MIPS instruction in hexadecimal format."
      );
      return;
    }

    const invalidInstructions = currentInstructions.filter(
      (inst) => !HEX_REGEX.test(inst)
    );
    if (invalidInstructions.length > 0) {
      setError(
        `Invalid instruction format found: ${invalidInstructions.join(
          ", "
        )}. Each instruction must be 8 hexadecimal characters.`
      );
      return;
    }

    onInstructionsSubmit(currentInstructions);
  };

  const handlePauseResume = () => {
    if (isRunning) {
      pauseSimulation();
    } else {
      resumeSimulation();
    }
  };

  // Función para manejar el cambio de forwarding
  const handleForwardingChange = (checked: boolean) => {
    // Primero actualiza el estado
    setForwardingEnabled(checked);

    // Si la simulación ha terminado, reiníciala con la nueva configuración
    if (hasStarted && isFinished) {
      // Espera a que se aplique el cambio de forwarding
      setTimeout(() => {
        // Reinicia la simulación
        onReset();

        // Luego reinicia con las mismas instrucciones
        setTimeout(() => {
          const currentInstructions = inputText
            .trim()
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

          if (currentInstructions.length > 0) {
            onInstructionsSubmit(currentInstructions);
          }
        }, 50);
      }, 50);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>MIPS Instructions</CardTitle>
        <CardDescription>
          Enter instructions in hex format (8 characters) to visualize pipeline
          with hazard detection
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid w-full gap-1.5">
          <Label htmlFor="instructions">
            Enter Hex Instructions (one per line)
          </Label>
          <Textarea
            id="instructions"
            placeholder="e.g., 00a63820..." // Removed 0x prefix for consistency with regex
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={5}
            className="font-mono"
            // Disable input field if simulation has started and not yet finished
            disabled={disableInputAndStart}
            aria-label="MIPS Hex Instructions Input"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {/* Forwarding configuration switch */}
        <div className="flex items-center space-x-2">
          <Switch
            id="forwarding-mode"
            checked={forwardingEnabled}
            onCheckedChange={handleForwardingChange}
            disabled={disableInputAndStart}
          />
          <Label htmlFor="forwarding-mode">Enable Data Forwarding</Label>
        </div>

        {/* Show hazard statistics if simulation has started */}
        {hasStarted && hazardCount > 0 && (
          <div className="flex flex-col gap-1 p-2 bg-muted rounded">
            <div className="flex items-center text-sm">
              <AlertTriangle className="w-4 h-4 mr-2 text-yellow-500" />
              <span>{hazardCount} hazards detected</span>
            </div>
            {forwardingEnabled && forwardingCount > 0 && (
              <div className="flex items-center text-sm">
                <Zap className="w-4 h-4 mr-2 text-green-500" />
                <span>{forwardingCount} forwarding paths active</span>
              </div>
            )}
            {stallCount > 0 && (
              <div className="flex items-center text-sm">
                <AlertTriangle className="w-4 h-4 mr-2 text-red-500" />
                <span>{stallCount} stall cycles added</span>
              </div>
            )}
            <div className="flex items-center text-sm">
              <Zap className="w-4 h-4 mr-2 text-green-500" />
              <span>
                {forwardingEnabled
                  ? "Data forwarding enabled"
                  : "Data forwarding disabled"}
              </span>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center gap-2">
          {/* Start Button: Disabled if started and not finished */}
          <Button
            onClick={handleSubmit}
            disabled={disableInputAndStart}
            className="flex-1"
          >
            {isFinished
              ? "Finished"
              : hasStarted
              ? "Running..."
              : "Start Simulation"}
          </Button>

          {/* Conditional Play/Pause Button: Show only when pause/resume is possible */}
          {canPauseResume && (
            <Button
              variant="outline"
              onClick={handlePauseResume}
              size="icon"
              aria-label={isRunning ? "Pause Simulation" : "Resume Simulation"}
            >
              {isRunning ? <Pause /> : <Play />}
            </Button>
          )}

          {/* Reset Button: Show only if the simulation has started */}
          {hasStarted && (
            <Button
              variant="destructive"
              onClick={onReset}
              size="icon"
              aria-label="Reset Simulation"
            >
              <RotateCcw />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
