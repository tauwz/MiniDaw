import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Copy, Link2Off, Plus, Radio, Trash2, X } from 'lucide-react';
import {
  ComponentLfoConfig,
  LfoSyncDivision,
  LfoWave,
  MidiCurve,
  MidiMapping,
  MidiMessageType,
  ModuleAccent,
  ModuleGroup,
  ModuleValues,
  SelectOptionItem,
  SynthModule,
  SynthParamTarget,
  ThemePalette,
} from '../types/synth';
import { SYNTH_TARGET_OPTIONS } from '../data/presets';
import { resolveAccentHex } from '../data/themes';
import {
  DEFAULT_COMPONENT_LFO,
  LFO_SYNC_DIVISIONS,
  LFO_WAVE_OPTIONS,
  evalLfoSample,
  formatLfoAmountPct,
  isLfoModActive,
  lfoEffectiveHz,
  normalizedToSyncDiv,
  resolveEffectiveLfo,
  syncDivToNormalized,
} from '../audio/lfoMath';
import { RotaryMiniWheel } from './controllers/RotaryMiniWheel';
import { midiEngine } from '../midi/midiEngine';

interface ControllerContextMenuProps {
  module: SynthModule;
  allModules?: SynthModule[];
  group?: ModuleGroup;
  palette: ThemePalette;
  bpm: number;
  x: number;
  y: number;
  onClose: () => void;
  onUpdateModule: (id: string, updater: (prev: SynthModule) => SynthModule) => void;
  onValueChange: (id: string, values: Partial<ModuleValues>) => void;
  onUpdateLfo: (id: string, lfo: ComponentLfoConfig) => void;
  onOpenModulation: (id: string) => void;
  onDeleteModulation: (id: string) => void;
  onDuplicateModule: (id: string) => void;
  onDeleteModule: (id: string) => void;
  onRemoveFromGroup: (id: string) => void;
}

const ACCENT_OPTIONS: { id: ModuleAccent; label: string }[] = [
  { id: 'amber', label: 'Primary' },
  { id: 'emerald', label: 'Secondary' },
  { id: 'sky', label: 'Tertiary' },
  { id: 'violet', label: 'Accent 4' },
  { id: 'rose', label: 'Alert' },
  { id: 'slate', label: 'Neutral' },
];

export const ControllerContextMenu: React.FC<ControllerContextMenuProps> = ({
  module,
  allModules,
  group,
  palette,
  bpm,
  x,
  y,
  onClose,
  onUpdateModule,
  onValueChange,
  onUpdateLfo,
  onOpenModulation,
  onDeleteModulation,
  onDuplicateModule,
  onDeleteModule,
  onRemoveFromGroup,
}) => {
  const rawLfoCfg: ComponentLfoConfig = {
    ...DEFAULT_COMPONENT_LFO,
    ...(module.lfo ?? {}),
  };
  const moduleLookup = new Map<string, SynthModule>();
  (allModules ?? []).forEach((m) => moduleLookup.set(m.id, m));
  const lfoCfg = resolveEffectiveLfo(rawLfoCfg, moduleLookup);
  const hasLfo = isLfoModActive(lfoCfg) || Boolean(rawLfoCfg.amountSourceId && rawLfoCfg.enabled);
  const amtLinkedMod = rawLfoCfg.amountSourceId ? moduleLookup.get(rawLfoCfg.amountSourceId) : undefined;
  const spdLinkedMod = rawLfoCfg.speedSourceId ? moduleLookup.get(rawLfoCfg.speedSourceId) : undefined;
  const attLinkedMod = rawLfoCfg.attackSourceId ? moduleLookup.get(rawLfoCfg.attackSourceId) : undefined;
  const patchLfo = (patch: Partial<ComponentLfoConfig>) => {
    onUpdateLfo(module.id, {
      ...rawLfoCfg,
      ...patch,
    });
  };
  const accentHex = resolveAccentHex(module.accent, palette);
  const { lfoMiniActive, lfoMiniGhost, lfoSignedAmt } = useMemo(() => {
    const samples = 120;
    const w = 220;
    const h = 44;
    const midY = h * 0.5;
    const ampPx = h * 0.39;
    const hz = lfoEffectiveHz(lfoCfg, bpm);
    const delSec = Math.max(0, lfoCfg.predelay) * 1.4;
    const attSec = Math.max(0.005, lfoCfg.attack * 1.6);
    const spanSec = Math.max(1.2, Math.min(8, delSec + attSec * 0.5 + 3.0 / Math.max(0.25, hz)));
    const previewCfg: ComponentLfoConfig = { ...lfoCfg, enabled: true };
    const signedAmt = (lfoCfg.amount - 0.5) * 2;
    const activePts: string[] = [];
    const ghostPts: string[] = [];
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const x = 6 + u * (w - 12);
      const rawVal = evalLfoSample(previewCfg, u * spanSec, bpm);
      ghostPts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${(midY - rawVal * ampPx).toFixed(1)}`);
      activePts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${(midY - rawVal * signedAmt * ampPx).toFixed(1)}`);
    }
    return {
      lfoMiniActive: activePts.join(' '),
      lfoMiniGhost: ghostPts.join(' '),
      lfoSignedAmt: signedAmt,
    };
  }, [lfoCfg, bpm]);
  const [learningTarget, setLearningTarget] = useState<'primary' | 'secondary' | null>(null);
  const currentMidiVal = Math.round(
    module.midi.minValue +
      (module.values.primary ?? 0) * (module.midi.maxValue - module.midi.minValue)
  );
  const [exactValStr, setExactValStr] = useState(String(currentMidiVal));

  useEffect(() => {
    setExactValStr(String(currentMidiVal));
  }, [currentMidiVal, module.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        midiEngine.cancelMidiLearn();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      midiEngine.cancelMidiLearn();
    };
  }, [onClose]);

  const menuW = 324;
  const maxMenuH = Math.min(560, window.innerHeight - 24);
  const clampedX = Math.max(12, Math.min(x, window.innerWidth - menuW - 12));
  const clampedY = Math.max(12, Math.min(y, window.innerHeight - maxMenuH - 12));

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

  const applyExactNumeric = (raw: string) => {
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;
    const clampedMidi = Math.max(0, Math.min(127, parsed));
    const min = module.midi.minValue;
    const max = module.midi.maxValue;
    const norm =
      max !== min
        ? Math.max(0, Math.min(1, (clampedMidi - min) / (max - min)))
        : clampedMidi / 127;
    onValueChange(module.id, { primary: norm });
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
      <div className="flex flex-col gap-2 pt-2.5" style={{ borderTop: '1px solid var(--pg-border)' }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold" style={{ color: 'var(--pg-text)' }}>
            {title}
          </span>
          <button
            type="button"
            onClick={() => triggerLearn(which)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium"
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
            <span className="text-[10px]" style={{ color: 'var(--pg-text-muted)' }}>Message</span>
            <select
              value={mapping.messageType}
              onChange={(e) =>
                updateMidi(which, { messageType: e.target.value as MidiMessageType })
              }
              className="px-2 py-1 rounded text-xs outline-none"
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
            <span className="text-[10px]" style={{ color: 'var(--pg-text-muted)' }}>Channel</span>
            <select
              value={mapping.channel}
              onChange={(e) => updateMidi(which, { channel: Number(e.target.value) })}
              className="px-2 py-1 rounded text-xs font-mono outline-none"
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
            <span className="text-[10px]" style={{ color: 'var(--pg-text-muted)' }}>
              {mapping.messageType === 'note' ? 'Base Note' : 'CC #'}
            </span>
            <input
              type="number"
              min={0}
              max={127}
              value={mapping.ccNumber}
              onChange={(e) =>
                updateMidi(which, {
                  ccNumber: Math.max(0, Math.min(127, Number(e.target.value) || 0)),
                })
              }
              className="px-2 py-1 rounded text-xs font-mono outline-none"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px]" style={{ color: 'var(--pg-text-muted)' }}>Min</span>
            <input
              type="number"
              min={0}
              max={127}
              value={mapping.minValue}
              onChange={(e) =>
                updateMidi(which, {
                  minValue: Math.max(0, Math.min(127, Number(e.target.value) || 0)),
                })
              }
              className="px-2 py-1 rounded text-xs font-mono outline-none"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px]" style={{ color: 'var(--pg-text-muted)' }}>Max</span>
            <input
              type="number"
              min={0}
              max={127}
              value={mapping.maxValue}
              onChange={(e) =>
                updateMidi(which, {
                  maxValue: Math.max(0, Math.min(127, Number(e.target.value) || 0)),
                })
              }
              className="px-2 py-1 rounded text-xs font-mono outline-none"
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
            <span className="text-[10px]" style={{ color: 'var(--pg-text-muted)' }}>Curve</span>
            <select
              value={mapping.curve}
              onChange={(e) => updateMidi(which, { curve: e.target.value as MidiCurve })}
              className="px-2 py-1 rounded text-xs outline-none"
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
            <span className="text-[10px]" style={{ color: 'var(--pg-text-muted)' }}>Synth Target</span>
            <select
              value={mapping.synthTarget}
              onChange={(e) =>
                updateMidi(which, { synthTarget: e.target.value as SynthParamTarget })
              }
              className="px-2 py-1 rounded text-xs outline-none"
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
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        role="dialog"
        aria-label="MIDI Controller Configuration"
        style={{
          left: clampedX,
          top: clampedY,
          width: menuW,
          maxHeight: maxMenuH,
          backgroundColor: 'var(--pg-surface)',
          border: '1px solid var(--pg-border-strong)',
        }}
        className="fixed z-50 rounded-md shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Menu Header */}
        <div
          className="px-3 py-2 flex items-center justify-between shrink-0"
          style={{
            backgroundColor: 'var(--pg-panel)',
            borderBottom: '1px solid var(--pg-border)',
          }}
        >
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate" style={{ color: 'var(--pg-text)' }}>
              {module.label}
            </div>
            <div className="text-[10px] font-mono" style={{ color: 'var(--pg-text-dim)' }}>
              MIDI Controller Config · {module.type}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:opacity-80"
            style={{ color: 'var(--pg-text-muted)' }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Scrollable Config Body */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          {/* Name & Numeric Value */}
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-[10px]" style={{ color: 'var(--pg-text-muted)' }}>Controller Name</span>
              <input
                type="text"
                value={module.label}
                onChange={(e) =>
                  onUpdateModule(module.id, (prev) => ({ ...prev, label: e.target.value }))
                }
                className="px-2 py-1 rounded text-xs outline-none"
                style={{
                  backgroundColor: 'var(--pg-canvas)',
                  border: '1px solid var(--pg-border)',
                  color: 'var(--pg-text)',
                }}
              />
            </label>

            {(module.type === 'knob' || module.type === 'fader' || module.type === 'ribbon') && (
              <label className="flex flex-col gap-1">
                <span className="text-[10px]" style={{ color: 'var(--pg-text-muted)' }}>Value (0–127)</span>
                <input
                  type="number"
                  min={0}
                  max={127}
                  value={exactValStr}
                  onChange={(e) => {
                    setExactValStr(e.target.value);
                    applyExactNumeric(e.target.value);
                  }}
                  className="px-2 py-1 rounded text-xs font-mono text-right outline-none"
                  style={{
                    backgroundColor: 'var(--pg-canvas)',
                    border: '1px solid var(--pg-border)',
                    color: 'var(--pg-text)',
                  }}
                />
              </label>
            )}
          </div>

          {/* Signal Color */}
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: 'var(--pg-text-muted)' }}>Signal Color</span>
            <div className="flex items-center gap-1.5">
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
                    className="w-4 h-4 rounded"
                    style={{
                      backgroundColor: hex,
                      outline: selected ? '2px solid var(--pg-text)' : 'none',
                      outlineOffset: '1px',
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Inline LFO Controller + Modulation Curve Overlay + Del Modulation */}
          {module.type !== 'scope' && (
            <div
              className="flex flex-col gap-2 pt-2.5"
              style={{ borderTop: '1px solid var(--pg-border)' }}
            >
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Activity size={12} style={{ color: accentHex }} />
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--pg-text)' }}>
                    LFO Modulation
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      patchLfo({
                        enabled: !lfoCfg.enabled,
                        amount:
                          !lfoCfg.enabled && Math.abs(lfoCfg.amount - 0.5) < 0.02
                            ? 0.72
                            : lfoCfg.amount,
                      })
                    }
                    className="px-2 py-0.5 rounded text-[10px] font-semibold"
                    style={{
                      backgroundColor: lfoCfg.enabled ? accentHex : 'var(--pg-canvas)',
                      color: lfoCfg.enabled ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
                      border: `1px solid ${lfoCfg.enabled ? accentHex : 'var(--pg-border)'}`,
                    }}
                  >
                    {lfoCfg.enabled ? 'LFO On' : 'LFO Off'}
                  </button>
                  {(hasLfo || module.lfo?.enabled) && (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteModulation(module.id);
                        onClose();
                      }}
                      title="Delete LFO modulation from this component"
                      className="px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                      style={{
                        backgroundColor: 'var(--pg-canvas)',
                        border: '1px solid var(--pg-border)',
                        color: 'var(--pg-alert)',
                      }}
                    >
                      Del Modulation
                    </button>
                  )}
                </div>
              </div>

              {/* Wave + Sync + Global */}
              <div className="grid grid-cols-4 gap-1.5 items-center">
                <select
                  value={lfoCfg.wave}
                  onChange={(e) =>
                    patchLfo({
                      enabled: true,
                      wave: e.target.value as LfoWave,
                      amount:
                        Math.abs(rawLfoCfg.amount - 0.5) < 0.02
                          ? 0.72
                          : rawLfoCfg.amount,
                    })
                  }
                  className="col-span-2 px-2 py-1 rounded text-[11px] outline-none"
                  style={{
                    backgroundColor: 'var(--pg-canvas)',
                    border: '1px solid var(--pg-border)',
                    color: 'var(--pg-text)',
                  }}
                >
                  {LFO_WAVE_OPTIONS.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => patchLfo({ tempoSync: !lfoCfg.tempoSync })}
                  className="px-1.5 py-1 rounded text-[10px] font-semibold"
                  style={{
                    backgroundColor: lfoCfg.tempoSync ? accentHex : 'var(--pg-canvas)',
                    color: lfoCfg.tempoSync ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
                    border: `1px solid ${lfoCfg.tempoSync ? accentHex : 'var(--pg-border)'}`,
                  }}
                >
                  Sync
                </button>
                <button
                  type="button"
                  onClick={() => patchLfo({ global: !lfoCfg.global })}
                  className="px-1.5 py-1 rounded text-[10px] font-semibold"
                  style={{
                    backgroundColor: lfoCfg.global ? 'var(--pg-panel)' : 'var(--pg-canvas)',
                    color: lfoCfg.global ? 'var(--pg-text)' : 'var(--pg-text-muted)',
                    border: '1px solid var(--pg-border)',
                  }}
                >
                  {lfoCfg.global ? 'Global' : 'Retrig'}
                </button>
              </div>

              {/* Mini LFO Waveform Preview */}
              <div
                className="h-11 rounded overflow-hidden"
                style={{ backgroundColor: 'var(--pg-canvas)', border: '1px solid var(--pg-border)' }}
              >
                <svg viewBox="0 0 220 44" preserveAspectRatio="none" className="w-full h-full block">
                  <line x1="6" y1="22" x2="214" y2="22" stroke="var(--pg-border)" strokeWidth="0.7" strokeDasharray="3 3" />
                  <path
                    d={lfoMiniGhost}
                    fill="none"
                    stroke={accentHex}
                    strokeOpacity={Math.abs(lfoSignedAmt) < 0.03 ? '0.45' : '0.2'}
                    strokeWidth="1.2"
                    strokeDasharray={Math.abs(lfoSignedAmt) < 0.03 ? '3 2' : undefined}
                    strokeLinejoin="round"
                  />
                  {Math.abs(lfoSignedAmt) >= 0.01 && (
                    <path
                      d={lfoMiniActive}
                      fill="none"
                      stroke={lfoCfg.enabled ? accentHex : 'var(--pg-text-muted)'}
                      strokeWidth="1.9"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>
              </div>

              {/* Rotary Wheels: DEL, ATT, Bipolar AMT (-/+), FREQ (Hz/Sync), Bipolar CRV */}
              <div className="grid grid-cols-5 gap-1">
                <RotaryMiniWheel
                  size="sm"
                  label="DEL"
                  value={lfoCfg.predelay}
                  accentHex={accentHex}
                  readout={`${Math.round(lfoCfg.predelay * 1400)}`}
                  defaultValue={0}
                  onChange={(v) => patchLfo({ enabled: true, predelay: v })}
                />
                <RotaryMiniWheel
                  size="sm"
                  label="ATT"
                  value={lfoCfg.attack}
                  accentHex={accentHex}
                  readout={`${Math.round(lfoCfg.attack * 1600)}`}
                  defaultValue={0.08}
                  disabled={Boolean(attLinkedMod)}
                  linkedLabel={attLinkedMod?.label}
                  onChange={(v) => patchLfo({ enabled: true, attack: v })}
                />
                <RotaryMiniWheel
                  size="sm"
                  label="AMT"
                  value={lfoCfg.amount}
                  bipolar
                  bipolarHints
                  accentHex={accentHex}
                  readout={formatLfoAmountPct(lfoCfg.amount)}
                  defaultValue={0.5}
                  disabled={Boolean(amtLinkedMod)}
                  linkedLabel={amtLinkedMod?.label}
                  onChange={(v) =>
                    patchLfo({
                      enabled: Math.abs(v - 0.5) > 0.004,
                      amount: v,
                    })
                  }
                />
                <RotaryMiniWheel
                  size="sm"
                  label="FREQ"
                  value={lfoCfg.tempoSync ? syncDivToNormalized(lfoCfg.syncDiv) : lfoCfg.speed}
                  accentHex={accentHex}
                  readout={
                    lfoCfg.tempoSync
                      ? lfoCfg.syncDiv
                      : `${lfoEffectiveHz(lfoCfg, bpm).toFixed(1)}Hz`
                  }
                  defaultValue={0.32}
                  disabled={Boolean(spdLinkedMod)}
                  linkedLabel={spdLinkedMod?.label}
                  onChange={(v) =>
                    patchLfo({
                      enabled: true,
                      speed: v,
                      ...(lfoCfg.tempoSync ? { syncDiv: normalizedToSyncDiv(v) } : {}),
                    })
                  }
                />
                <RotaryMiniWheel
                  size="sm"
                  label="CRV"
                  value={((lfoCfg.curveTension ?? 0) + 1) * 0.5}
                  bipolar
                  bipolarHints
                  accentHex={accentHex}
                  readout={`${Math.round((lfoCfg.curveTension ?? 0) * 100)}%`}
                  defaultValue={0.5}
                  onChange={(v) =>
                    patchLfo({
                      enabled: true,
                      curveTension: Number((v * 2 - 1).toFixed(3)),
                    })
                  }
                />
              </div>

              {lfoCfg.tempoSync && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--pg-text-muted)' }}>
                    Sync Div
                  </span>
                  <select
                    value={lfoCfg.syncDiv}
                    onChange={(e) =>
                      patchLfo({ enabled: true, syncDiv: e.target.value as LfoSyncDivision })
                    }
                    className="flex-1 px-2 py-0.5 rounded text-[11px] font-mono outline-none"
                    style={{
                      backgroundColor: 'var(--pg-canvas)',
                      border: '1px solid var(--pg-border)',
                      color: 'var(--pg-text)',
                    }}
                  >
                    {LFO_SYNC_DIVISIONS.map((div) => (
                      <option key={div.id} value={div.id}>
                        {div.id} Beat
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Open Semi-Transparent Modulation Overlay (Curve + Full LFO) */}
              <button
                type="button"
                onClick={() => {
                  onOpenModulation(module.id);
                  onClose();
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
                style={{
                  backgroundColor: hasLfo ? `${accentHex}22` : 'var(--pg-canvas)',
                  border: `1px solid ${hasLfo ? accentHex : 'var(--pg-border)'}`,
                  color: hasLfo ? accentHex : 'var(--pg-text)',
                }}
              >
                <span className="flex items-center gap-1.5">
                  <Activity size={12} style={{ color: accentHex }} />
                  <span>Modulation</span>
                </span>
                <span
                  className="text-[10px] font-mono tabular-nums"
                  style={{ color: hasLfo ? accentHex : 'var(--pg-text-dim)' }}
                >
                  Open Curve &amp; LFO Overlay
                </span>
              </button>
            </div>
          )}

          {/* Controller-Specific Options */}
          {module.type === 'knob' && (
            <label className="flex items-center justify-between text-xs" style={{ color: 'var(--pg-text-muted)' }}>
              <span>Bipolar Center Mode</span>
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
            <label className="flex items-center justify-between text-xs" style={{ color: 'var(--pg-text-muted)' }}>
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
            <label className="flex items-center justify-between text-xs" style={{ color: 'var(--pg-text-muted)' }}>
              <span>Momentary Trigger</span>
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
            <div className="flex flex-col gap-1.5 pt-2" style={{ borderTop: '1px solid var(--pg-border)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold" style={{ color: 'var(--pg-text)' }}>
                  Selector Options
                </span>
                <button
                  type="button"
                  onClick={addOption}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                  style={{
                    backgroundColor: 'var(--pg-panel)',
                    border: '1px solid var(--pg-border)',
                    color: 'var(--pg-text)',
                  }}
                >
                  <Plus size={10} />
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
                    max={127}
                    value={Math.round(opt.value * 127)}
                    onChange={(e) =>
                      updateOption(idx, {
                        value: Math.max(0, Math.min(1, (Number(e.target.value) || 0) / 127)),
                      })
                    }
                    className="w-12 px-1.5 py-1 rounded text-xs font-mono text-right outline-none"
                    style={{
                      backgroundColor: 'var(--pg-canvas)',
                      border: '1px solid var(--pg-border)',
                      color: 'var(--pg-text)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="p-0.5 rounded hover:opacity-80"
                    style={{ color: 'var(--pg-text-dim)' }}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {module.type === 'keyboard' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px]" style={{ color: 'var(--pg-text-muted)' }}>Scale</span>
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
                  className="px-2 py-1 rounded text-xs outline-none"
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
                <span className="text-[10px]" style={{ color: 'var(--pg-text-muted)' }}>Octave</span>
                <select
                  value={module.config.octave ?? 3}
                  onChange={(e) =>
                    onUpdateModule(module.id, (prev) => ({
                      ...prev,
                      config: { ...prev.config, octave: Number(e.target.value) },
                    }))
                  }
                  className="px-2 py-1 rounded text-xs font-mono outline-none"
                  style={{
                    backgroundColor: 'var(--pg-canvas)',
                    border: '1px solid var(--pg-border)',
                    color: 'var(--pg-text)',
                  }}
                >
                  {[1, 2, 3, 4, 5].map((oct) => (
                    <option key={oct} value={oct}>Oct {oct}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {module.type === 'pads' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px]" style={{ color: 'var(--pg-text-muted)' }}>Rows</span>
                <select
                  value={module.config.padRows ?? 2}
                  onChange={(e) =>
                    onUpdateModule(module.id, (prev) => ({
                      ...prev,
                      config: { ...prev.config, padRows: Number(e.target.value) },
                    }))
                  }
                  className="px-2 py-1 rounded text-xs font-mono outline-none"
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
                <span className="text-[10px]" style={{ color: 'var(--pg-text-muted)' }}>Columns</span>
                <select
                  value={module.config.padCols ?? 4}
                  onChange={(e) =>
                    onUpdateModule(module.id, (prev) => ({
                      ...prev,
                      config: { ...prev.config, padCols: Number(e.target.value) },
                    }))
                  }
                  className="px-2 py-1 rounded text-xs font-mono outline-none"
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
              <span className="text-[10px]" style={{ color: 'var(--pg-text-muted)' }}>Steps</span>
              <select
                value={module.config.steps ?? 8}
                onChange={(e) =>
                  onUpdateModule(module.id, (prev) => ({
                    ...prev,
                    config: { ...prev.config, steps: Number(e.target.value) },
                  }))
                }
                className="px-2 py-1 rounded text-xs font-mono outline-none"
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

          {/* MIDI Routing Sections */}
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

        {/* Footer Actions */}
        <div
          className="px-3 py-2 flex items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: 'var(--pg-panel)',
            borderTop: '1px solid var(--pg-border)',
          }}
        >
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onDuplicateModule(module.id);
                onClose();
              }}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              <Copy size={11} />
              <span>Duplicate</span>
            </button>

            {group && (
              <button
                type="button"
                onClick={() => {
                  onRemoveFromGroup(module.id);
                  onClose();
                }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium"
                style={{
                  backgroundColor: 'var(--pg-canvas)',
                  border: '1px solid var(--pg-border)',
                  color: 'var(--pg-text-muted)',
                }}
              >
                <Link2Off size={11} />
                <span>Detach</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              onDeleteModule(module.id);
              onClose();
            }}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium"
            style={{
              backgroundColor: 'var(--pg-canvas)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-alert)',
            }}
          >
            <Trash2 size={11} />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </>
  );
};
