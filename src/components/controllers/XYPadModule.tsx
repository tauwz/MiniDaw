import React, { useRef, useState } from 'react';
import { ModuleValues, SynthModule } from '../../types/synth';

interface XYPadModuleProps {
  module: SynthModule;
  accentHex: string;
  onValueChange: (values: Partial<ModuleValues>) => void;
}

export const XYPadModule: React.FC<XYPadModuleProps> = ({ module, accentHex, onValueChange }) => {
  const xVal = Math.max(0, Math.min(1, module.values.primary ?? 0.5));
  const yVal = Math.max(0, Math.min(1, module.values.secondary ?? 0.5));
  const padRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const updateXY = (clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const ny = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / Math.max(1, rect.height)));
    onValueChange({ primary: nx, secondary: ny });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setDragging(true);
    updateXY(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateXY(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const ccX = Math.round(
    module.midi.minValue + xVal * (module.midi.maxValue - module.midi.minValue)
  );
  const sec = module.secondaryMidi;
  const ccY = sec
    ? Math.round(sec.minValue + yVal * (sec.maxValue - sec.minValue))
    : Math.round(yVal * 127);

  return (
    <div className="touch-surface flex flex-col w-full h-full gap-1.5 select-none">
      <div
        ref={padRef}
        className="relative flex-1 w-full rounded-md overflow-hidden cursor-crosshair"
        style={{
          backgroundColor: 'var(--pg-canvas)',
          border: `1px solid ${dragging ? accentHex : 'var(--pg-border)'}`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Subtle quadrant grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--pg-border) 1px, transparent 1px), linear-gradient(to bottom, var(--pg-border) 1px, transparent 1px)',
            backgroundSize: '25% 25%',
          }}
        />

        {/* Crosshair lines */}
        <div
          className="absolute top-0 bottom-0 w-[1px] pointer-events-none opacity-65"
          style={{ left: `${xVal * 100}%`, backgroundColor: accentHex }}
        />
        <div
          className="absolute left-0 right-0 h-[1px] pointer-events-none opacity-65"
          style={{ bottom: `${yVal * 100}%`, backgroundColor: accentHex }}
        />

        {/* Active puck */}
        <div
          className="absolute -translate-x-1/2 translate-y-1/2 w-5 h-5 rounded-full pointer-events-none flex items-center justify-center"
          style={{
            left: `${xVal * 100}%`,
            bottom: `${yVal * 100}%`,
            backgroundColor: `${accentHex}33`,
            border: `2px solid ${accentHex}`,
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentHex }} />
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] font-mono leading-none px-0.5">
        <span style={{ color: 'var(--pg-text-muted)' }}>
          X: <strong style={{ color: 'var(--pg-text)' }}>{ccX}</strong>
        </span>
        <span style={{ color: 'var(--pg-text-muted)' }}>
          Y: <strong style={{ color: 'var(--pg-text)' }}>{ccY}</strong>
        </span>
      </div>
    </div>
  );
};
