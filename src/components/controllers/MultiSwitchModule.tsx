import React from 'react';
import { ModuleValues, SynthModule } from '../../types/synth';

interface MultiSwitchModuleProps {
  module: SynthModule;
  accentHex: string;
  onValueChange: (values: Partial<ModuleValues>) => void;
}

const DEFAULT_STEPS = [
  { label: 'I', value: 0.15 },
  { label: 'II', value: 0.4 },
  { label: 'III', value: 0.7 },
  { label: 'IV', value: 0.95 },
];

export const MultiSwitchModule: React.FC<MultiSwitchModuleProps> = ({
  module,
  accentHex,
  onValueChange,
}) => {
  const options = module.config.options && module.config.options.length > 0
    ? module.config.options
    : DEFAULT_STEPS;
  const selectedIdx = Math.max(
    0,
    Math.min(options.length - 1, module.values.selectedIndex ?? 0)
  );

  return (
    <div
      className={`touch-surface flex items-center w-full h-full select-none ${
        options.length >= 5 ? 'gap-0.5' : 'gap-1'
      }`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {options.map((opt, idx) => {
        const active = idx === selectedIdx;
        return (
          <button
            key={`${opt.label}-${idx}`}
            type="button"
            onClick={() => onValueChange({ selectedIndex: idx, primary: opt.value })}
            className={`flex-1 h-7 rounded font-mono font-semibold truncate transition-colors ${
              options.length >= 5 ? 'text-[9.5px] px-0.5' : 'text-[11px] px-1'
            }`}
            style={{
              backgroundColor: active ? accentHex : 'var(--pg-canvas)',
              color: active ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
              border: `1px solid ${active ? accentHex : 'var(--pg-border-strong)'}`,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
