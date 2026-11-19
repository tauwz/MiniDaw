import React, { useState } from 'react';
import { Link2Off, Plus, Radio, Sliders, Trash2, X } from 'lucide-react';
import {
  MidiCurve,
  MidiMapping,
  MidiMessageType,
  ModuleAccent,
  ModuleGroup,
  SelectOptionItem,
  SynthModule,
  SynthParamTarget,
  ThemePalette,
} from '../types/synth';
import { SYNTH_TARGET_OPTIONS } from '../data/presets';
import { resolveAccentHex } from '../data/themes';
import { midiEngine } from '../midi/midiEngine';

interface InspectorSidebarProps {
  module: SynthModule | null;
  group?: ModuleGroup;
  palette: ThemePalette;
  onUpdateModule: (id: string, updater: (prev: SynthModule) => SynthModule) => void;
  onDeleteModule: (id: string) => void;
  onRemoveFromGroup: (moduleId: string) => void;
}

const ACCENT_OPTIONS: { id: ModuleAccent; label: string }[] = [
  { id: 'amber', label: 'Primary' },
  { id: 'emerald', label: 'Secondary' },
  { id: 'sky', label: 'Tertiary' },
  { id: 'violet', label: 'Accent 4' },
  { id: 'rose', label: 'Alert' },
  { id: 'slate', label: 'Neutral' },
];

export const InspectorSidebar: React.FC<InspectorSidebarProps> = ({
  module,
  group,
  palette,
  onUpdateModule,
  onDeleteModule,
  onRemoveFromGroup,
}) => {
  const [learningTarget, setLearningTarget] = useState<'primary' | 'secondary' | null>(null);

  if (!module) {
    return (
      <aside
        className="w-[296px] shrink-0 flex flex-col items-center justify-center p-6 text-center h-full"
        style={{
          backgroundColor: 'var(--pg-surface)',
          borderLeft: '1px solid var(--pg-border)',
        }}
      >
        <div
          className="w-10 h-10 rounded-md flex items-center justify-center mb-3"
          style={{
            backgroundColor: 'var(--pg-panel)',
            border: '1px solid var(--pg-border)',
            color: 'var(--pg-text-muted)',
          }}
        >
          <Sliders size={18} />
        </div>
        <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--pg-text)' }}>
          Module Inspector
        </h3>
        <p className="text-xs leading-relaxed max-w-[220px]" style={{ color: 'var(--pg-text-muted)' }}>
          Select any controller to edit MIDI routing. Hold Shift+Click to select multiple controllers and glue them into a compact group.
        </p>
      </aside>
    );
  }

  const updateMidi = (which: 'primary' | 'secondary', patch: Partial<MidiMapping>) => {
    onUpdateModule(module.id, (prev) => {
      if (which === 'secondary' && prev.secondaryMidi) {
        return { ...prev, secondaryMidi: { ...prev.secondaryMidi, ...patch } };
      }
      return { ...prev, midi: { ...prev.midi, ...patch } };
    });
  };

  const triggerLearn = (which: 'primary' | 'secondary') => {
    if (learningTarget === which) {
      midiEngine.cancelMidiLearn();
      setLearningTarget(null);
      return;
    }
    setLearningTarget(which);
    midiEngine.startMidiLearn((channel, ccOrNote, isNote) => {
      updateMidi(which, {
        channel,
        ccNumber: ccOrNote,
        messageType: isNote ? 'note' : 'cc',
      });
      setLearningTarget(null);
    });
  };

  const updateOption = (idx: number, patch: Partial<SelectOptionItem>) => {
    const current = module.config.options ?? [];
    const next = current.map((o, i) => (i === idx ? { ...o, ...patch } : o));
    onUpdateModule(module.id, (prev) => ({
      ...prev,
      config: { ...prev.config, options: next },
    }));
  };

  const addOption = () => {
    const current = module.config.options ?? [];
    const next: SelectOptionItem[] = [
      ...current,
      { label: `Mode ${current.length + 1}`, value: Math.min(1, (current.length + 1) * 0.25) },
    ];
    onUpdateModule(module.id, (prev) => ({
      ...prev,
      config: { ...prev.config, options: next },
    }));
  };

  const removeOption = (idx: number) => {
    const current = module.config.options ?? [];
    if (current.length <= 2) return;
    const next = current.filter((_, i) => i !== idx);
    onUpdateModule(module.id, (prev) => ({
      ...prev,
      config: { ...prev.config, options: next },
    }));
  };

  const renderMappingBlock = (title: string, mapping: MidiMapping, which: 'primary' | 'secondary') => {
    const isLearning = learningTarget === which;
    return (
      <div className="flex flex-col gap-2.5 pt-3" style={{ borderTop: '1px solid var(--pg-border)' }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold" style={{ color: 'var(--pg-text)' }}>
            {title}
          </span>
          <button
            type="button"
            onClick={() => triggerLearn(which)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
            style={{
              backgroundColor: isLearning ? 'var(--pg-primary)' : 'var(--pg-panel)',
              color: isLearning ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
              border: '1px solid var(--pg-border)',
            }}
          >
            <Radio size={11} />
            <span>{isLearning ? 'Listening...' : 'MIDI Learn'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>Message</span>
            <select
              value={mapping.messageType}
              onChange={(e) =>
                updateMidi(which, { messageType: e.target.value as MidiMessageType })
              }
              className="px-2 py-1.5 rounded text-xs outline-none"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              <option value="cc">Control Change (CC)</option>
              <option value="note">MIDI Note</option>
              <option value="pitchbend">Pitch Bend</option>
              <option value="program">Program Change</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>Channel</span>
            <select
              value={mapping.channel}
              onChange={(e) => updateMidi(which, { channel: Number(e.target.value) })}
              className="px-2 py-1.5 rounded text-xs font-mono outline-none"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
                <option key={ch} value={ch}>
                  Ch {ch}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>
              {mapping.messageType === 'note' ? 'Base Note' : 'CC #'}
            </span>
            <input
              type="number"
              min={0}
              max={127}
              value={mapping.ccNumber}
              onChange={(e) =>
                updateMidi(which, { ccNumber: Math.max(0, Math.min(127, Number(e.target.value) || 0)) })
              }
              className="px-2 py-1.5 rounded text-xs font-mono outline-none"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>Min</span>
            <input
              type="number"
              min={0}
              max={127}
              value={mapping.minValue}
              onChange={(e) =>
                updateMidi(which, { minValue: Math.max(0, Math.min(127, Number(e.target.value) || 0)) })
              }
              className="px-2 py-1.5 rounded text-xs font-mono outline-none"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>Max</span>
            <input
              type="number"
              min={0}
              max={127}
              value={mapping.maxValue}
              onChange={(e) =>
                updateMidi(which, { maxValue: Math.max(0, Math.min(127, Number(e.target.value) || 0)) })
              }
              className="px-2 py-1.5 rounded text-xs font-mono outline-none"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>Response Curve</span>
            <select
              value={mapping.curve}
              onChange={(e) => updateMidi(which, { curve: e.target.value as MidiCurve })}
              className="px-2 py-1.5 rounded text-xs outline-none"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              <option value="linear">Linear</option>
              <option value="exponential">Exponential</option>
              <option value="logarithmic">Logarithmic</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>Internal Synth</span>
            <select
              value={mapping.synthTarget}
              onChange={(e) =>
                updateMidi(which, { synthTarget: e.target.value as SynthParamTarget })
              }
              className="px-2 py-1.5 rounded text-xs outline-none"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              {SYNTH_TARGET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    );
  };

  return (
    <aside
      className="w-[296px] shrink-0 flex flex-col h-full overflow-hidden"
      style={{
        backgroundColor: 'var(--pg-surface)',
        borderLeft: '1px solid var(--pg-border)',
      }}
    >
      <div
        className="px-3.5 py-3 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--pg-border)' }}
      >
        <div>
          <h2 className="text-xs font-semibold" style={{ color: 'var(--pg-text)' }}>
            Controller Inspector
          </h2>
          <p className="text-[11px] font-mono" style={{ color: 'var(--pg-text-dim)' }}>
            {module.type} · {Math.round(module.pw ?? module.w * 86)}×{Math.round(module.ph ?? module.h * 74)} px
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDeleteModule(module.id)}
          title="Remove controller"
          className="p-1.5 rounded transition-colors hover:opacity-80"
          style={{
            backgroundColor: 'var(--pg-panel)',
            border: '1px solid var(--pg-border)',
            color: 'var(--pg-alert)',
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3.5">
        {group && (
          <div
            className="rounded px-2.5 py-2 flex items-center justify-between gap-2 text-xs"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
            }}
          >
            <span className="truncate font-medium" style={{ color: 'var(--pg-text)' }}>
              Group: {group.name}
            </span>
            <button
              type="button"
              onClick={() => onRemoveFromGroup(module.id)}
              title="Detach from group"
              className="flex items-center gap-1 text-[11px] shrink-0"
              style={{ color: 'var(--pg-text-muted)' }}
            >
              <Link2Off size={12} />
              <span>Detach</span>
            </button>
          </div>
        )}

        {/* Label & Accent */}
        <label className="flex flex-col gap-1">
          <span className="text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>Display Label</span>
          <input
            type="text"
            value={module.label}
            onChange={(e) =>
              onUpdateModule(module.id, (prev) => ({ ...prev, label: e.target.value }))
            }
            className="px-2.5 py-1.5 rounded text-xs outline-none"
            style={{
              backgroundColor: 'var(--pg-canvas)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-text)',
            }}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>Signal Color</span>
          <div className="flex items-center gap-2">
            {ACCENT_OPTIONS.map((opt) => {
              const hex = resolveAccentHex(opt.id, palette);
              const selected = module.accent === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.label}
                  onClick={() =>
                    onUpdateModule(module.id, (prev) => ({ ...prev, accent: opt.id }))
                  }
                  className="w-6 h-6 rounded flex items-center justify-center transition-transform"
                  style={{
                    backgroundColor: hex,
                    outline: selected ? `2px solid var(--pg-text)` : 'none',
                    outlineOffset: '2px',
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Controller-Specific Options */}
        {module.type === 'knob' && (
          <label className="flex items-center justify-between py-1 text-xs" style={{ color: 'var(--pg-text-muted)' }}>
            <span>Bipolar (-100% to +100%)</span>
            <input
              type="checkbox"
              checked={Boolean(module.config.bipolar)}
              onChange={(e) =>
                onUpdateModule(module.id, (prev) => ({
                  ...prev,
                  config: { ...prev.config, bipolar: e.target.checked },
                }))
              }
            />
          </label>
        )}

        {module.type === 'ribbon' && (
          <label className="flex items-center justify-between py-1 text-xs" style={{ color: 'var(--pg-text-muted)' }}>
            <span>Spring Return to Center</span>
            <input
              type="checkbox"
              checked={module.config.springReturn ?? true}
              onChange={(e) =>
                onUpdateModule(module.id, (prev) => ({
                  ...prev,
                  config: { ...prev.config, springReturn: e.target.checked },
                }))
              }
            />
          </label>
        )}

        {(module.type === 'toggle' || module.type === 'button') && (
          <label className="flex items-center justify-between py-1 text-xs" style={{ color: 'var(--pg-text-muted)' }}>
            <span>Momentary Trigger Mode</span>
            <input
              type="checkbox"
              checked={Boolean(module.config.momentary)}
              onChange={(e) =>
                onUpdateModule(module.id, (prev) => ({
                  ...prev,
                  config: { ...prev.config, momentary: e.target.checked },
                }))
              }
            />
          </label>
        )}

        {(module.type === 'selectbox' || module.type === 'switch') && (
          <div className="flex flex-col gap-2 pt-2" style={{ borderTop: '1px solid var(--pg-border)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--pg-text)' }}>
                Selector Options
              </span>
              <button
                type="button"
                onClick={addOption}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px]"
                style={{
                  backgroundColor: 'var(--pg-panel)',
                  border: '1px solid var(--pg-border)',
                  color: 'var(--pg-text)',
                }}
              >
                <Plus size={11} />
                <span>Add</span>
              </button>
            </div>
            {(module.config.options ?? []).map((opt, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={opt.label}
                  onChange={(e) => updateOption(idx, { label: e.target.value })}
                  className="flex-1 min-w-0 px-2 py-1 rounded text-xs outline-none"
                  style={{
                    backgroundColor: 'var(--pg-canvas)',
                    border: '1px solid var(--pg-border)',
                    color: 'var(--pg-text)',
                  }}
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(opt.value * 100)}
                  onChange={(e) =>
                    updateOption(idx, {
                      value: Math.max(0, Math.min(1, (Number(e.target.value) || 0) / 100)),
                    })
                  }
                  title="Normalized %"
                  className="w-14 px-2 py-1 rounded text-xs font-mono text-right outline-none"
                  style={{
                    backgroundColor: 'var(--pg-canvas)',
                    border: '1px solid var(--pg-border)',
                    color: 'var(--pg-text)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeOption(idx)}
                  className="p-1 rounded hover:opacity-80"
                  style={{ color: 'var(--pg-text-dim)' }}
                  title="Remove option"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {module.type === 'keyboard' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>Scale</span>
              <select
                value={module.config.scale ?? 'chromatic'}
                onChange={(e) =>
                  onUpdateModule(module.id, (prev) => ({
                    ...prev,
                    config: {
                      ...prev.config,
                      scale: e.target.value as SynthModule['config']['scale'],
                    },
                  }))
                }
                className="px-2 py-1.5 rounded text-xs outline-none"
                style={{
                  backgroundColor: 'var(--pg-canvas)',
                  border: '1px solid var(--pg-border)',
                  color: 'var(--pg-text)',
                }}
              >
                <option value="chromatic">Chromatic</option>
                <option value="minorPentatonic">Minor Pentatonic</option>
                <option value="dorian">Dorian</option>
                <option value="phrygian">Phrygian</option>
                <option value="major">Major</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>Base Octave</span>
              <select
                value={module.config.octave ?? 3}
                onChange={(e) =>
                  onUpdateModule(module.id, (prev) => ({
                    ...prev,
                    config: { ...prev.config, octave: Number(e.target.value) },
                  }))
                }
                className="px-2 py-1.5 rounded text-xs font-mono outline-none"
                style={{
                  backgroundColor: 'var(--pg-canvas)',
                  border: '1px solid var(--pg-border)',
                  color: 'var(--pg-text)',
                }}
              >
                {[1, 2, 3, 4, 5].map((oct) => (
                  <option key={oct} value={oct}>
                    Oct {oct}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {module.type === 'pads' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>Rows</span>
              <select
                value={module.config.padRows ?? 2}
                onChange={(e) =>
                  onUpdateModule(module.id, (prev) => ({
                    ...prev,
                    config: { ...prev.config, padRows: Number(e.target.value) },
                  }))
                }
                className="px-2 py-1.5 rounded text-xs font-mono outline-none"
                style={{
                  backgroundColor: 'var(--pg-canvas)',
                  border: '1px solid var(--pg-border)',
                  color: 'var(--pg-text)',
                }}
              >
                {[1, 2, 3, 4].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>Columns</span>
              <select
                value={module.config.padCols ?? 4}
                onChange={(e) =>
                  onUpdateModule(module.id, (prev) => ({
                    ...prev,
                    config: { ...prev.config, padCols: Number(e.target.value) },
                  }))
                }
                className="px-2 py-1.5 rounded text-xs font-mono outline-none"
                style={{
                  backgroundColor: 'var(--pg-canvas)',
                  border: '1px solid var(--pg-border)',
                  color: 'var(--pg-text)',
                }}
              >
                {[2, 3, 4].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {module.type === 'sequencer' && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>Pattern Length</span>
            <select
              value={module.config.steps ?? 8}
              onChange={(e) =>
                onUpdateModule(module.id, (prev) => ({
                  ...prev,
                  config: { ...prev.config, steps: Number(e.target.value) },
                }))
              }
              className="px-2 py-1.5 rounded text-xs font-mono outline-none"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              <option value={8}>8 Steps</option>
              <option value={16}>16 Steps</option>
            </select>
          </label>
        )}

        {/* MIDI Routing Block */}
        {module.type !== 'scope' &&
          renderMappingBlock(
            module.type === 'xypad' ? 'X-Axis MIDI Routing' : 'MIDI & Synth Routing',
            module.midi,
            'primary'
          )}

        {module.type === 'xypad' &&
          module.secondaryMidi &&
          renderMappingBlock('Y-Axis MIDI Routing', module.secondaryMidi, 'secondary')}
      </div>
    </aside>
  );
};
