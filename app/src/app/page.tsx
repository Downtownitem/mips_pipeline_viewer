// src/app/page.tsx

"use client";

import type * as React from 'react';
import { InstructionInput } from '@/components/instruction-input';
import { PipelineVisualization } from '@/components/pipeline-visualization';
import { Separator } from '@/components/ui/separator';
import { useSimulationState, useSimulationActions } from '@/context/SimulationContext'; // Import context hooks

export default function Home() {
  // Get state and actions from context
  const { instructions, isRunning, currentCycle, maxCycles, isFinished } = useSimulationState();
  const { startSimulation, resetSimulation } = useSimulationActions();

  // Simulation has started if cycle > 0
  const hasStarted = currentCycle > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/50 via-white to-indigo-50/50">
      <div className="container mx-auto p-4 md:p-8 flex flex-col items-center space-y-8">
        <header className="text-center space-y-4 pt-8">
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text font-montserrat">
            MIPS Pipeline Viewer
          </h1>
          <p className="text-lg text-gray-600 font-montserrat font-medium max-w-2xl mx-auto leading-relaxed">
            Visualize the flow of MIPS instructions through a 5-stage pipeline with advanced hazard detection and forwarding mechanisms.
          </p>
          <div className="flex justify-center space-x-8 text-sm text-gray-500 font-montserrat">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span>Real-time Simulation</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span>Data Forwarding</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span>Hazard Detection</span>
            </div>
          </div>
        </header>

        {/* Pass context actions/state down */}
        <div className="w-full max-w-md">
          <InstructionInput
            onInstructionsSubmit={startSimulation}
            onReset={resetSimulation}
            isRunning={isRunning} // isRunning is needed for button state/icons
          />
        </div>

        <Separator className="my-8 w-full max-w-4xl bg-gradient-to-r from-transparent via-gray-300 to-transparent h-px" />

        {/* Conditionally render visualization and cycle info only if instructions exist */}
        {instructions.length > 0 && (
          <div className="w-full space-y-6">
            <PipelineVisualization />
            {/* Display cycle info below the visualization */}
            { maxCycles > 0 && (
              <div className="text-center">
                <div className="inline-flex items-center space-x-4 bg-white/80 backdrop-blur-sm rounded-full px-6 py-3 shadow-lg border border-gray-200">
                  <span className="font-montserrat font-semibold text-gray-700">
                    Cycle: {currentCycle} / {maxCycles}
                  </span>
                  <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium font-montserrat ${
                    isFinished 
                      ? 'bg-green-100 text-green-700 border border-green-200' 
                      : isRunning 
                        ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                        : 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      isFinished 
                        ? 'bg-green-500' 
                        : isRunning 
                          ? 'bg-blue-500 animate-pulse' 
                          : 'bg-yellow-500'
                    }`}></div>
                    <span>
                      {isFinished ? 'Finished' : isRunning ? 'Running' : 'Paused'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Show message if reset/never run and no instructions */}
        {!hasStarted && instructions.length === 0 && (
          <div className="text-center space-y-4 py-12">
            <div className="text-6xl">🚀</div>
            <h2 className="text-2xl font-montserrat font-semibold text-gray-700">Ready to Start</h2>
            <p className="text-gray-600 font-montserrat max-w-md mx-auto">
              Enter your MIPS instructions above and press "Start Simulation" to begin visualizing the pipeline execution.
            </p>
          </div>
        )}
        
        {/* Show different message if reset after a run */}
        {hasStarted && instructions.length === 0 && (
          <div className="text-center space-y-4 py-12">
            <div className="text-6xl">🔄</div>
            <h2 className="text-2xl font-montserrat font-semibold text-gray-700">Simulation Reset</h2>
            <p className="text-gray-600 font-montserrat max-w-md mx-auto">
              The simulation has been reset. Enter new instructions to start a fresh pipeline analysis.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}