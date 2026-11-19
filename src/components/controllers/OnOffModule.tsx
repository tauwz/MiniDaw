import React from 'react';
import { Power } from 'lucide-react';
import { ModuleValues, SynthModule } from '../../types/synth';

interface OnOffModuleProps {
  module: SynthModule;
  accentHex: string;
  onValueChange: (values: Partial<ModuleValues>) => void;
}

export const OnOffModule: React.FC<OnOffModuleProps> = ({ module, accentHex, onValueChange }) => {
  const isOn = Boolean(module.values.active);

  const handleToggle = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const next = !isOn;
    onValueChange({ active: next, primary: next ? 1 : 0 });
  };

  return (
    <div className="touch-surface flex items-center justify-center w-full h-full select-none">
      <button
        type="button"
        onPointerDown={handleToggle}
        className="w-full h-full rounded flex items-center justify-between px-2.5 transition-colors duration-100"
        style={{
          backgroundColor: isOn ? `${accentHex}22` : 'var(--pg-canvas)',
          border: `1.5px solid ${isOn ? accentHex : 'var(--pg-border-strong)'}`,
        }}
      >
        <Power size={14} style={{ color: isOn ? accentHex : 'var(--pg-text-dim)' }} />
        <span
          className="text-[11px] font-mono font-semibold"
          style={{ color: isOn ? accentHex : 'var(--pg-text-muted)' }}
        >
          {isOn ? 'ON' : 'OFF'}
        </span>
      </button>
    </div>
  );
};
