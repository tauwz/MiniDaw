import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Plus,
  Power,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  LfoSyncDivision,
  MixerChannelStrip,
  MixerFxCategory,
  MixerFxSlot,
  MixerFxType,
  ThemePalette,
} from '../types/synth';
import {
  MIXER_FX_CATALOG,
  MIXER_FX_CATEGORIES,
  SYNC_DIV_BEATS,
  createDefaultFxSlot,
  syncDivToMs,
} from '../audio/mixerFxEngine';

const FX_DESCRIPTIONS: Record<MixerFxType, string> = {
  busComp: 'Native VCA bus glue compressor with makeup gain',
  stereoImager: 'Mid/Side stereo width & high-air shelf',
  svfFilter: 'LP / BP / HP resonant channel filter',
  tiltEq: 'Single-pivot warm/bright analog tilt EQ',
  tapeSat: 'Soft tanh analog tape harmonic saturator',
  tubeDrive: 'Asymmetric warm tube overdrive with crunch',
  bitcrusher: 'Quantized lo-fi bit depth reduction + LPF',
  echoDelay: 'Stereo precision delay (1–2000 ms or Tempo Sync)',
  dubDelay: 'Warm damped cross-feedback dub tape echo',
  spaceReverb: 'Pre-delayed convolution hall reverb',
  chorus: 'Dual-delay stereo LFO chorus modulation',
  phaser: '4-stage allpass swept stereo phaser',
  flanger: 'Short-delay resonant jet flanger',
  autoPan: 'Free Hz or tempo-synced stereo auto-panner',
};

interface FxCatalogOverlayProps {
  open: boolean;
  trackLabel: string;
  accentHex: string;
  palette: ThemePalette;
  onSelectFx: (type: MixerFxType) => void;
  onClose: () => void;
}

export const FxCatalogOverlay: React.FC<FxCatalogOverlayProps> = ({
  open,
  trackLabel,
  accentHex,
  palette,
  onSelectFx,
  onClose,
}) => {
  const [activeCat, setActiveCat] = useState<'all' | MixerFxCategory>('all');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const visibleCategories =
    activeCat === 'all'
      ? MIXER_FX_CATEGORIES
      : MIXER_FX_CATEGORIES.filter((c) => c.id === activeCat);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6, 8, 12, 0.72)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Select DSP Effect for ${trackLabel}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[660px] max-h-[82vh] rounded-lg shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--pg-surface)',
          border: `1px solid ${accentHex}88`,
          color: 'var(--pg-text)',
        }}
      >
        {/* Overlay Header */}
        <div
          className="px-4 py-2.5 flex items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: 'var(--pg-panel)',
            borderBottom: '1px solid var(--pg-border)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles size={14} style={{ color: accentHex }} />
            <span className="text-xs font-bold truncate">
              Insert DSP Effect → {trackLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10"
            style={{ color: 'var(--pg-text-muted)' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div
          className="px-4 py-2 flex flex-wrap items-center gap-1.5 shrink-0"
          style={{
            backgroundColor: 'var(--pg-canvas)',
            borderBottom: '1px solid var(--pg-border)',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveCat('all')}
            className="px-2.5 py-1 rounded text-[11px] font-semibold"
            style={{
              backgroundColor: activeCat === 'all' ? accentHex : 'var(--pg-panel)',
              color: activeCat === 'all' ? '#090b10' : 'var(--pg-text-muted)',
              border: '1px solid var(--pg-border)',
            }}
          >
            All ({MIXER_FX_CATALOG.length})
          </button>
          {MIXER_FX_CATEGORIES.map((cat) => {
            const isAct = activeCat === cat.id;
            const count = MIXER_FX_CATALOG.filter((f) => f.category === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCat(cat.id)}
                className="px-2.5 py-1 rounded text-[11px] font-semibold"
                style={{
                  backgroundColor: isAct ? accentHex : 'var(--pg-panel)',
                  color: isAct ? '#090b10' : 'var(--pg-text-muted)',
                  border: '1px solid var(--pg-border)',
                }}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Classified Effects Browser */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
          {visibleCategories.map((cat) => {
            const items = MIXER_FX_CATALOG.filter((e) => e.category === cat.id);
            return (
              <div key={cat.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-mono font-bold uppercase tracking-wider"
                    style={{ color: palette.colors.primary }}
                  >
                    {cat.label}
                  </span>
                  <div
                    className="flex-1 h-[1px]"
                    style={{ backgroundColor: 'var(--pg-border)' }}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {items.map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => onSelectFx(item.type)}
                      className="text-left p-2.5 rounded flex flex-col gap-1 transition-all hover:brightness-115"
                      style={{
                        backgroundColor: 'var(--pg-panel)',
                        border: '1px solid var(--pg-border-strong)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-xs font-semibold"
                          style={{ color: 'var(--pg-text)' }}
                        >
                          {item.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {item.supportsTimeSync && (
                            <span
                              className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: 'var(--pg-canvas)',
                                color: palette.colors.tertiary,
                                border: '1px solid var(--pg-border)',
                              }}
                            >
                              MS / SYNC
                            </span>
                          )}
                          <span
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold"
                            style={{
                              backgroundColor: `${accentHex}22`,
                              color: accentHex,
                            }}
                          >
                            + Add
                          </span>
                        </div>
                      </div>
                      <span
                        className="text-[10px] leading-snug"
                        style={{ color: 'var(--pg-text-muted)' }}
                      >
                        {FX_DESCRIPTIONS[item.type]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
};

interface MixerFxRackProps {
  trackLabel: string;
  accentHex: string;
  strip: MixerChannelStrip;
  bpm: number;
  palette: ThemePalette;
  onUpdateStrip: (patch: Partial<MixerChannelStrip>) => void;
  onOpenFxSelector?: () => void;
}

const SYNC_DIV_LIST = Object.keys(SYNC_DIV_BEATS) as LfoSyncDivision[];

export const MixerFxRack: React.FC<MixerFxRackProps> = ({
  trackLabel,
  accentHex,
  strip,
  bpm,
  palette,
  onUpdateStrip,
  onOpenFxSelector,
}) => {
  const [internalPickerOpen, setInternalPickerOpen] = useState(false);

  const addFxSlot = (type: MixerFxType) => {
    const slot = createDefaultFxSlot(type);
    onUpdateStrip({ fxSlots: [...strip.fxSlots, slot] });
    setInternalPickerOpen(false);
  };

  const updateSlot = (slotId: string, patch: Partial<MixerFxSlot>) => {
    onUpdateStrip({
      fxSlots: strip.fxSlots.map((s) => (s.id === slotId ? { ...s, ...patch } : s)),
    });
  };

  const updateSlotParam = (slotId: string, key: string, val: number) => {
    onUpdateStrip({
      fxSlots: strip.fxSlots.map((s) =>
        s.id === slotId ? { ...s, params: { ...s.params, [key]: val } } : s
      ),
    });
  };

  const removeSlot = (slotId: string) => {
    onUpdateStrip({
      fxSlots: strip.fxSlots.filter((s) => s.id !== slotId),
    });
  };

  const moveSlot = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= strip.fxSlots.length) return;
    const next = [...strip.fxSlots];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onUpdateStrip({ fxSlots: next });
  };

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {/* Header + Add FX Selector */}
      <div
        className="rounded p-2 flex flex-col gap-2"
        style={{
          backgroundColor: 'var(--pg-canvas)',
          border: `1px solid ${accentHex}55`,
        }}
      >
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: accentHex }}
            />
            <span
              className="text-[11px] font-bold truncate"
              style={{ color: 'var(--pg-text)' }}
            >
              {trackLabel} · FX Chain
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onOpenFxSelector) {
                onOpenFxSelector();
              } else {
                setInternalPickerOpen(true);
              }
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold shrink-0"
            style={{
              backgroundColor: accentHex,
              color: '#090b10',
            }}
          >
            <Plus size={11} />
            <span>Add FX</span>
          </button>
        </div>

        {/* Channel FX Wet Send Amount */}
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-mono uppercase shrink-0"
            style={{ color: 'var(--pg-text-muted)' }}
          >
            FX AMT
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={strip.fxAmount}
            onChange={(e) => onUpdateStrip({ fxAmount: Number(e.target.value) })}
            className="flex-1 h-1 accent-amber-500 cursor-pointer"
          />
          <span
            className="text-[10px] font-mono tabular-nums w-8 text-right"
            style={{ color: accentHex }}
          >
            {Math.round(strip.fxAmount * 100)}%
          </span>
        </div>
      </div>

      {/* Empty State (Clickable to open Classified FX Browser Overlay) */}
      {strip.fxSlots.length === 0 ? (
        <button
          type="button"
          onClick={() => {
            if (onOpenFxSelector) {
              onOpenFxSelector();
            } else {
              setInternalPickerOpen(true);
            }
          }}
          className="rounded p-4 text-center flex flex-col items-center gap-1.5 hover:bg-white/5 transition-colors cursor-pointer"
          style={{
            backgroundColor: 'var(--pg-canvas)',
            border: '1px dashed var(--pg-border-strong)',
            color: 'var(--pg-text-dim)',
          }}
        >
          <Sparkles size={15} style={{ color: accentHex }} />
          <span className="text-[11px] font-semibold" style={{ color: 'var(--pg-text)' }}>
            + Click to Insert DSP Effect on {trackLabel}
          </span>
          <span className="text-[9px] font-mono">
            Mastering · Filtering · Distortion · Echo (ms / Sync) · Modulation
          </span>
        </button>
      ) : (
        <div className="flex flex-col gap-1.5">
          {strip.fxSlots.map((slot, idx) => {
            const meta =
              MIXER_FX_CATALOG.find((m) => m.type === slot.type) ?? MIXER_FX_CATALOG[0];
            const effectiveMs = slot.sync
              ? syncDivToMs(slot.syncDiv ?? '1/4', bpm)
              : slot.timeMs ?? 250;

            return (
              <div
                key={slot.id}
                className="rounded p-2 flex flex-col gap-1.5"
                style={{
                  backgroundColor: 'var(--pg-canvas)',
                  border: `1px solid ${slot.enabled ? `${accentHex}66` : 'var(--pg-border)'}`,
                  opacity: slot.enabled ? 1 : 0.65,
                }}
              >
                {/* Slot Title Row */}
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => updateSlot(slot.id, { enabled: !slot.enabled })}
                      title={slot.enabled ? 'Bypass FX' : 'Enable FX'}
                      className="p-1 rounded"
                      style={{
                        backgroundColor: slot.enabled ? accentHex : 'var(--pg-panel)',
                        color: slot.enabled ? '#090b10' : 'var(--pg-text-dim)',
                        border: '1px solid var(--pg-border)',
                      }}
                    >
                      <Power size={10} />
                    </button>
                    <span
                      className="text-[10px] font-mono px-1 rounded shrink-0"
                      style={{
                        backgroundColor: 'var(--pg-panel)',
                        color: 'var(--pg-text-dim)',
                      }}
                    >
                      {idx + 1}
                    </span>
                    <span
                      className="text-[11px] font-semibold truncate"
                      style={{ color: 'var(--pg-text)' }}
                    >
                      {meta.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveSlot(idx, -1)}
                      title="Move Up"
                      className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
                      style={{ color: 'var(--pg-text-muted)' }}
                    >
                      <ArrowUp size={10} />
                    </button>
                    <button
                      type="button"
                      disabled={idx === strip.fxSlots.length - 1}
                      onClick={() => moveSlot(idx, 1)}
                      title="Move Down"
                      className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
                      style={{ color: 'var(--pg-text-muted)' }}
                    >
                      <ArrowDown size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSlot(slot.id)}
                      title="Remove FX Slot"
                      className="p-1 rounded hover:bg-white/10"
                      style={{ color: palette.colors.alert }}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>

                {/* Slot MIX */}
                <div className="flex items-center gap-2">
                  <span
                    className="text-[9px] font-mono w-10 shrink-0"
                    style={{ color: 'var(--pg-text-dim)' }}
                  >
                    MIX
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={slot.mix}
                    onChange={(e) => updateSlot(slot.id, { mix: Number(e.target.value) })}
                    className="flex-1 h-1 accent-amber-500 cursor-pointer"
                  />
                  <span
                    className="text-[9px] font-mono tabular-nums w-10 text-right"
                    style={{ color: 'var(--pg-text)' }}
                  >
                    {Math.round(slot.mix * 100)}%
                  </span>
                </div>

                {/* Time & Tempo Sync Section for Delay / Echo / AutoPan */}
                {meta.supportsTimeSync && (
                  <div
                    className="rounded p-1.5 flex flex-col gap-1"
                    style={{
                      backgroundColor: 'var(--pg-panel)',
                      border: '1px solid var(--pg-border)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <Clock size={10} style={{ color: palette.colors.tertiary }} />
                        <span
                          className="text-[9px] font-mono"
                          style={{ color: 'var(--pg-text-muted)' }}
                        >
                          TIME / SYNC
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateSlot(slot.id, { sync: !slot.sync })}
                        className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold"
                        style={{
                          backgroundColor: slot.sync
                            ? palette.colors.tertiary
                            : 'var(--pg-surface)',
                          color: slot.sync ? '#090b10' : 'var(--pg-text-muted)',
                          border: '1px solid var(--pg-border)',
                        }}
                      >
                        {slot.sync ? 'TEMPO SYNC' : 'FREE MS'}
                      </button>
                    </div>

                    {slot.sync ? (
                      <div className="flex items-center justify-between gap-2">
                        <select
                          value={slot.syncDiv ?? '1/4'}
                          onChange={(e) =>
                            updateSlot(slot.id, {
                              syncDiv: e.target.value as LfoSyncDivision,
                            })
                          }
                          className="flex-1 px-1.5 py-0.5 rounded text-[10px] font-mono outline-none"
                          style={{
                            backgroundColor: 'var(--pg-canvas)',
                            border: '1px solid var(--pg-border)',
                            color: 'var(--pg-text)',
                          }}
                        >
                          {SYNC_DIV_LIST.map((div) => (
                            <option key={div} value={div}>
                              {div} ({syncDivToMs(div, bpm).toFixed(1)} ms)
                            </option>
                          ))}
                        </select>
                        <span
                          className="text-[9px] font-mono tabular-nums shrink-0"
                          style={{ color: palette.colors.tertiary }}
                        >
                          {effectiveMs.toFixed(1)}ms
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="range"
                          min={1}
                          max={2000}
                          step={0.5}
                          value={slot.timeMs ?? 250}
                          onChange={(e) =>
                            updateSlot(slot.id, { timeMs: Number(e.target.value) })
                          }
                          className="flex-1 h-1 accent-cyan-400 cursor-pointer"
                        />
                        <input
                          type="number"
                          min={1}
                          max={2000}
                          step={0.5}
                          value={Number((slot.timeMs ?? 250).toFixed(1))}
                          onChange={(e) =>
                            updateSlot(slot.id, {
                              timeMs: Math.max(
                                1,
                                Math.min(2000, Number(e.target.value) || 1)
                              ),
                            })
                          }
                          className="w-14 px-1 py-0.5 rounded text-right text-[10px] font-mono tabular-nums outline-none"
                          style={{
                            backgroundColor: 'var(--pg-canvas)',
                            border: '1px solid var(--pg-border)',
                            color: 'var(--pg-text)',
                          }}
                        />
                        <span
                          className="text-[9px] font-mono"
                          style={{ color: 'var(--pg-text-dim)' }}
                        >
                          ms
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* FX Sub-Parameters */}
                <div className="flex flex-col gap-1">
                  {meta.paramLabels.map((param) => {
                    const val = slot.params[param.key] ?? 0.5;
                    const formatted = param.format
                      ? param.format(val)
                      : `${Math.round(val * 100)}%`;
                    return (
                      <div key={param.key} className="flex items-center gap-2">
                        <span
                          className="text-[9px] font-mono w-10 truncate shrink-0"
                          style={{ color: 'var(--pg-text-dim)' }}
                        >
                          {param.label}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={val}
                          onChange={(e) =>
                            updateSlotParam(slot.id, param.key, Number(e.target.value))
                          }
                          className="flex-1 h-1 accent-amber-500 cursor-pointer"
                        />
                        <span
                          className="text-[9px] font-mono tabular-nums w-11 text-right shrink-0"
                          style={{ color: 'var(--pg-text-muted)' }}
                        >
                          {formatted}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!onOpenFxSelector && (
        <FxCatalogOverlay
          open={internalPickerOpen}
          trackLabel={trackLabel}
          accentHex={accentHex}
          palette={palette}
          onSelectFx={addFxSlot}
          onClose={() => setInternalPickerOpen(false)}
        />
      )}
    </div>
  );
};
