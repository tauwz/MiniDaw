import React from 'react';
import { ModuleValues, SynthModule } from '../../types/synth';

interface SelectBoxModuleProps {
  module: SynthModule;
  accentHex: string;
  onValueChange: (values: Partial<ModuleValues>) => void;
}

const DEFAULT_OPTIONS = [
  { label: 'Option 1', value: 0.2 },
  { label: 'Option 2', value: 0.5 },
  { label: 'Option 3', value: 0.8 },
  { label: 'Option 4', value: 1.0 },
];

export const SelectBoxModule: React.FC<SelectBoxModuleProps> = ({
  module,
  accentHex,
  onValueChange,
}) => {
  const options = module.config.options && module.config.options.length > 0
    ? module.config.options
    : DEFAULT_OPTIONS;
  const selectedIdx = Math.max(
    0,
    Math.min(options.length - 1, module.values.selectedIndex ?? 0)
  );

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = Number(e.target.value);
    const chosen = options[idx] ?? options[0];
    onValueChange({ selectedIndex: idx, primary: chosen.value });
  };

  return (
    <div
      className="touch-surface flex items-center w-full h-full select-none px-0.5"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <select
        value={selectedIdx}
        onChange={handleChange}
        className="w-full h-8 px-2 rounded text-xs font-medium outline-none cursor-pointer"
        style={{
          backgroundColor: 'var(--pg-canvas)',
          border: `1.5px solid ${accentHex}`,
          color: 'var(--pg-text)',
        }}
      >
        {options.map((opt, idx) => (
          <option
            key={`${opt.label}-${idx}`}
            value={idx}
            className="bg-[#151820] text-[#ECEEF2]"
          >
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};
