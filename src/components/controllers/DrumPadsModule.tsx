import React, { useState } from 'react';
import { SynthModule } from '../../types/synth';

interface DrumPadsModuleProps {
  module: SynthModule;
  accentHex: string;
  onTriggerDrum: (padIdx: number, note: number, velocity: number, isOn: boolean) => void;
}

const PAD_NAMES = ['Kick', 'Snare', 'CHat', 'Perc', 'Rim', 'Clap', 'Tom L', 'Tom H', 'Crash', 'Ride', 'Sub', 'Zap', 'FX 1', 'FX 2', 'Stab', 'Chord'];

export const DrumPadsModule: React.FC<DrumPadsModuleProps> = ({
  module,
  accentHex,
  onTriggerDrum,
}) => {
  const rows = module.config.padRows ?? 2;
  const cols = module.config.padCols ?? 4;
  const total = rows * cols;
  const baseNote = module.midi.ccNumber || 36;
  const [activePads, setActivePads] = useState<Record<number, boolean>>({});
  const [lastVelocity, setLastVelocity] = useState<number | null>(null);

  const handlePadDown = (idx: number, e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    // Bottom of pad = higher velocity, top = softer
    const relY = Math.max(0.15, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
    const vel = Math.round(
      module.midi.minValue + relY * (module.midi.maxValue - module.midi.minValue)
    );
    setActivePads((prev) => ({ ...prev, [idx]: true }));
    setLastVelocity(vel);
    onTriggerDrum(idx, baseNote + idx, vel, true);
  };

  const handlePadUp = (idx: number, e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!activePads[idx]) return;
    setActivePads((prev) => ({ ...prev, [idx]: false }));
    onTriggerDrum(idx, baseNote + idx, 0, false);
  };

  return (
    <div className="touch-surface flex flex-col w-full h-full gap-1.5 select-none">
      <div
        className="flex-1 grid gap-1.5 min-h-0"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: total }, (_, idx) => {
          const isActive = Boolean(activePads[idx]);
          return (
            <button
              key={idx}
              type="button"
              onPointerDown={(e) => handlePadDown(idx, e)}
              onPointerUp={(e) => handlePadUp(idx, e)}
              onPointerLeave={(e) => handlePadUp(idx, e)}
              onPointerCancel={(e) => handlePadUp(idx, e)}
              className="relative rounded flex flex-col items-start justify-between p-1.5 text-left transition-transform duration-75 active:scale-[0.97] min-h-0"
              style={{
                backgroundColor: isActive ? `${accentHex}33` : 'var(--pg-canvas)',
                border: `1.5px solid ${isActive ? accentHex : 'var(--pg-border)'}`,
              }}
            >
              <span
                className="text-[10px] font-medium truncate max-w-full leading-none"
                style={{ color: isActive ? accentHex : 'var(--pg-text-muted)' }}
              >
                {PAD_NAMES[idx % PAD_NAMES.length]}
              </span>
              <span
                className="text-[10px] font-mono leading-none self-end"
                style={{ color: 'var(--pg-text-dim)' }}
              >
                {baseNote + idx}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono leading-none px-0.5" style={{ color: 'var(--pg-text-dim)' }}>
        <span>Ch {module.midi.channel} · Notes {baseNote}–{baseNote + total - 1}</span>
        <span>{lastVelocity !== null ? `Vel ${lastVelocity}` : 'Tap pad'}</span>
      </div>
    </div>
  );
};
