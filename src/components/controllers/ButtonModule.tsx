import React from 'react';
import { ModuleValues, SynthModule } from '../../types/synth';

interface ButtonModuleProps {
  module: SynthModule;
  accentHex: string;
  onValueChange: (values: Partial<ModuleValues>) => void;
  onTriggerNote?: (note: number, velocity: number, isOn: boolean) => void;
}

export const ButtonModule: React.FC<ButtonModuleProps> = ({
  module,
  accentHex,
  onValueChange,
  onTriggerNote,
}) => {
  const isActive = Boolean(module.values.active);
  const momentary = module.config.momentary ?? true;

  const fireDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (momentary) {
      onValueChange({ active: true, primary: 1 });
      if (module.midi.messageType === 'note' && onTriggerNote) {
        onTriggerNote(module.midi.ccNumber || 48, module.midi.maxValue || 115, true);
      }
    } else {
      const next = !isActive;
      onValueChange({ active: next, primary: next ? 1 : 0 });
      if (module.midi.messageType === 'note' && onTriggerNote) {
        onTriggerNote(module.midi.ccNumber || 48, module.midi.maxValue || 115, next);
      }
    }
  };

  const fireUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (momentary && isActive) {
      onValueChange({ active: false, primary: 0 });
      if (module.midi.messageType === 'note' && onTriggerNote) {
        onTriggerNote(module.midi.ccNumber || 48, 0, false);
      }
    }
  };

  return (
    <div className="touch-surface flex items-center justify-center w-full h-full select-none">
      <button
        type="button"
        onPointerDown={fireDown}
        onPointerUp={fireUp}
        onPointerLeave={fireUp}
        onPointerCancel={fireUp}
        className="w-full h-full rounded flex items-center justify-center gap-2 transition-transform duration-75 active:scale-[0.96] px-2"
        style={{
          backgroundColor: isActive ? accentHex : 'var(--pg-canvas)',
          border: `1.5px solid ${isActive ? accentHex : 'var(--pg-border-strong)'}`,
          color: isActive ? 'var(--pg-primary-text)' : 'var(--pg-text)',
        }}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            backgroundColor: isActive ? 'var(--pg-primary-text)' : accentHex,
          }}
        />
        <span className="text-[11px] font-mono font-semibold truncate">
          {isActive ? 'FIRED' : momentary ? 'TRIG' : 'OFF'}
        </span>
      </button>
    </div>
  );
};
