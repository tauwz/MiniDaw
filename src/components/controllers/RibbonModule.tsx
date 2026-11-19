import React, { useRef, useState } from 'react';
import { ModuleValues, SynthModule } from '../../types/synth';

interface RibbonModuleProps {
  module: SynthModule;
  accentHex: string;
  onValueChange: (values: Partial<ModuleValues>) => void;
}

export const RibbonModule: React.FC<RibbonModuleProps> = ({ module, accentHex, onValueChange }) => {
  const value = Math.max(0, Math.min(1, module.values.primary ?? 0.5));
  const springReturn = module.config.springReturn ?? true;
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const updateFromX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const norm = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    onValueChange({ primary: norm });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setDragging(true);
    updateFromX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromX(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (springReturn) {
      onValueChange({ primary: 0.5 });
    }
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const midiVal = Math.round(
    module.midi.minValue + value * (module.midi.maxValue - module.midi.minValue)
  );

  return (
    <div className="touch-surface flex items-center gap-3 w-full h-full select-none">
      <div
        ref={trackRef}
        className="relative flex-1 h-7 rounded cursor-ew-resize overflow-hidden flex items-center"
        style={{
          backgroundColor: 'var(--pg-canvas)',
          border: `1px solid ${dragging ? accentHex : 'var(--pg-border)'}`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Center notch */}
        <div
          className="absolute top-0 bottom-0 left-1/2 w-[1px] pointer-events-none"
          style={{ backgroundColor: 'var(--pg-border-strong)' }}
        />

        {/* Active bar from center if springReturn, else from left */}
        {springReturn ? (
          <div
            className="absolute top-1 bottom-1 pointer-events-none rounded-sm opacity-45"
            style={{
              left: value >= 0.5 ? '50%' : `${value * 100}%`,
              width: `${Math.abs(value - 0.5) * 100}%`,
              backgroundColor: accentHex,
            }}
          />
        ) : (
          <div
            className="absolute top-1 bottom-1 left-0 pointer-events-none rounded-sm opacity-45"
            style={{ width: `${value * 100}%`, backgroundColor: accentHex }}
          />
        )}

        {/* Touch cursor */}
        <div
          className="absolute top-0.5 bottom-0.5 w-2 -translate-x-1/2 rounded-sm pointer-events-none"
          style={{ left: `${value * 100}%`, backgroundColor: accentHex }}
        />
      </div>

      <span className="text-[11px] font-mono w-10 text-right shrink-0" style={{ color: 'var(--pg-text-muted)' }}>
        {midiVal}
      </span>
    </div>
  );
};
