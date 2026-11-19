import React from 'react';
import { ModuleValues, SynthModule } from '../../types/synth';

interface ToggleModuleProps {
  module: SynthModule;
  accentHex: string;
  onValueChange: (values: Partial<ModuleValues>) => void;
}

export const ToggleModule: React.FC<ToggleModuleProps> = ({ module, accentHex, onValueChange }) => {
  const isActive = Boolean(module.values.active);
  const momentary = Boolean(module.config.momentary);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (momentary) {
      onValueChange({ active: true, primary: 1 });
    } else {
      const next = !isActive;
      onValueChange({ active: next, primary: next ? 1 : 0 });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (momentary && isActive) {
      onValueChange({ active: false, primary: 0 });
    }
  };

  return (
    <div className="touch-surface flex items-center justify-center w-full h-full select-none">
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="w-full h-full rounded flex items-center justify-center gap-2 px-2 transition-all duration-100 active:scale-[0.97]"
        style={{
          backgroundColor: isActive ? `${accentHex}26` : 'var(--pg-canvas)',
          border: `1.5px solid ${isActive ? accentHex : 'var(--pg-border-strong)'}`,
        }}
      >
        <div
          className="w-4 h-2 rounded-full transition-colors shrink-0"
          style={{ backgroundColor: isActive ? accentHex : 'var(--pg-border-strong)' }}
        />
        <span
          className="text-[11px] font-mono font-semibold leading-none truncate"
          style={{ color: isActive ? accentHex : 'var(--pg-text-muted)' }}
        >
          {isActive ? 'ON' : momentary ? 'HOLD' : 'OFF'}
        </span>
      </button>
    </div>
  );
};
