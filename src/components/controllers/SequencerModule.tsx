import React, { useRef, useState } from 'react';
import { ModuleValues, SequencerStep, SynthModule } from '../../types/synth';

interface SequencerModuleProps {
  module: SynthModule;
  accentHex: string;
  currentStep: number;
  isPlaying: boolean;
  onValueChange: (values: Partial<ModuleValues>) => void;
}

const NOTE_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SequencerModule: React.FC<SequencerModuleProps> = ({
  module,
  accentHex,
  currentStep,
  isPlaying,
  onValueChange,
}) => {
  const stepCount = module.config.steps ?? 8;
  const rawSteps = module.values.seqSteps ?? [];
  const steps: SequencerStep[] = Array.from({ length: stepCount }, (_, i) =>
    rawSteps[i] ?? { active: i % 2 === 0, noteOffset: 0, velocity: 0.8 }
  );

  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const dragStartYRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const didDragRef = useRef(false);

  const activeStepIdx = isPlaying ? currentStep % stepCount : -1;
  const baseMidi = module.midi.ccNumber || 48;

  const updateStep = (idx: number, patch: Partial<SequencerStep>) => {
    const next = steps.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onValueChange({ seqSteps: next });
  };

  const handleBarPointerDown = (idx: number, e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setDraggingIdx(idx);
    dragStartYRef.current = e.clientY;
    dragStartOffsetRef.current = steps[idx].noteOffset;
    didDragRef.current = false;
  };

  const handleBarPointerMove = (idx: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingIdx !== idx) return;
    const dy = dragStartYRef.current - e.clientY;
    if (Math.abs(dy) > 4) {
      didDragRef.current = true;
    }
    const semitoneDelta = Math.round(dy / 7);
    const nextOffset = Math.max(0, Math.min(24, dragStartOffsetRef.current + semitoneDelta));
    if (nextOffset !== steps[idx].noteOffset) {
      updateStep(idx, { noteOffset: nextOffset });
    }
  };

  const handleBarPointerUp = (idx: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingIdx !== idx) return;
    setDraggingIdx(null);
    if (!didDragRef.current) {
      updateStep(idx, { active: !steps[idx].active });
    }
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div className="touch-surface flex flex-col w-full h-full gap-1.5 select-none">
      <div className="flex-1 flex items-stretch gap-1 min-h-0">
        {steps.map((step, idx) => {
          const isCurrent = idx === activeStepIdx;
          const pitchPct = 18 + (step.noteOffset / 24) * 82;
          const midiNote = baseMidi + step.noteOffset;
          const noteName = `${NOTE_LABELS[midiNote % 12]}${Math.floor(midiNote / 12) - 1}`;

          return (
            <div
              key={idx}
              onPointerDown={(e) => handleBarPointerDown(idx, e)}
              onPointerMove={(e) => handleBarPointerMove(idx, e)}
              onPointerUp={(e) => handleBarPointerUp(idx, e)}
              onPointerCancel={(e) => handleBarPointerUp(idx, e)}
              title="Click to toggle step · Drag vertically to change pitch"
              className="flex-1 flex flex-col justify-end rounded cursor-ns-resize overflow-hidden relative min-w-0"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: `1px solid ${isCurrent ? accentHex : step.active ? 'var(--pg-border-strong)' : 'var(--pg-border)'}`,
              }}
            >
              {/* Pitch bar */}
              <div
                className="w-full transition-all duration-75"
                style={{
                  height: `${pitchPct}%`,
                  backgroundColor: step.active ? accentHex : 'var(--pg-border-strong)',
                  opacity: isCurrent && step.active ? 1 : step.active ? 0.55 : 0.2,
                }}
              />
              {/* Step note & index */}
              <div className="absolute inset-x-0 top-1 flex flex-col items-center pointer-events-none">
                <span
                  className="text-[9px] font-mono leading-none"
                  style={{ color: step.active ? 'var(--pg-text)' : 'var(--pg-text-dim)' }}
                >
                  {noteName}
                </span>
              </div>
              <div
                className="absolute bottom-0.5 inset-x-0 text-center text-[9px] font-mono leading-none pointer-events-none"
                style={{ color: isCurrent ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)' }}
              >
                {idx + 1}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono leading-none px-0.5" style={{ color: 'var(--pg-text-dim)' }}>
        <span>Tap gate · Drag bar pitch</span>
        <span>{stepCount} steps</span>
      </div>
    </div>
  );
};
