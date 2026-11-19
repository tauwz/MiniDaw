import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronRight,
  Maximize2,
  Minimize2,
  Plus,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Unlink,
} from 'lucide-react';
import {
  MixerChannelStrip,
  MixerFxType,
  MixerTrackState,
  StudioChannel,
  ThemePalette,
} from '../types/synth';
import { MasterLimiterState, synthEngine } from '../audio/synthEngine';
import { PitochonchoEqState } from '../audio/pitochonchoEq';
import {
  MIXER_FX_CATALOG,
  createDefaultFxSlot,
  getEffectiveTrackSends,
  wouldTrackSendCreateCycle,
} from '../audio/mixerFxEngine';
import { resolveAccentHex } from '../data/themes';
import { RotaryMiniWheel } from './controllers/RotaryMiniWheel';
import { PitochonchoEqPanel } from './PitochonchoEqPanel';
import { FxCatalogOverlay, MixerFxRack } from './MixerFxRack';

interface MasterMixerPanelProps {
  channels: StudioChannel[];
  tracks: MixerTrackState[];
  masterMixer: MixerChannelStrip;
  masterMuted: boolean;
  selectedChannelId: string;
  masterGain: number;
  masterLimiter: MasterLimiterState;
  pitoEq: PitochonchoEqState;
  bpm: number;
  audioEnabled: boolean;
  mixerWidthPx: number;
  palette: ThemePalette;
  onSelectChannel: (channelId: string) => void;
  onUpdateChannel: (channelId: string, patch: Partial<StudioChannel>) => void;
  onUpdateMasterMixer: (patch: Partial<MixerChannelStrip>) => void;
  onToggleMasterMuted: () => void;
  onUpdateTrack: (trackIndex: number, patch: Partial<MixerTrackState>) => void;
  onAddTrack: () => void;
  onDeleteTrack: (trackIndex: number) => void;
  onRequestMixerWidth?: (targetWidthPx: number) => void;
  onChangeMasterGain: (v: number) => void;
  onChangeMasterLimiter: (patch: Partial<MasterLimiterState>) => void;
  onChangePitoEq: (next: PitochonchoEqState) => void;
  onCollapse?: () => void;
}

interface VerticalStripFaderProps {
  value: number; // 0..1.25 (or 0..1 for master)
  max?: number;
  defaultValue?: number;
  peak: number;
  accentHex: string;
  alertHex: string;
  secondaryHex: string;
  onChange: (v: number) => void;
}

const VerticalStripFader: React.FC<VerticalStripFaderProps> = ({
  value,
  max = 1.25,
  defaultValue = 0.85,
  peak,
  accentHex,
  alertHex,
  secondaryHex,
  onChange,
}) => {
  const railRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const updateFromClientY = (clientY: number) => {
    const el = railRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rel = 1 - (clientY - rect.top) / Math.max(1, rect.height);
    onChange(Math.max(0, Math.min(max, Number((rel * max).toFixed(3)))));
  };

  const norm = Math.max(0, Math.min(1, value / max));
  const peakPct = Math.min(100, Math.round(Math.pow(Math.max(0, peak), 0.55) * 100));

  return (
    <div className="flex items-stretch justify-center gap-1.5 h-[96px] py-1">
      {/* Live Vertical Peak Meter */}
      <div
        className="w-2 h-full rounded-sm overflow-hidden flex flex-col justify-end"
        style={{
          backgroundColor: 'var(--pg-canvas)',
          border: '1px solid var(--pg-border)',
        }}
        title="Post-fader Peak Level"
      >
        <div
          className="w-full transition-[height] duration-75"
          style={{
            height: `${peakPct}%`,
            background:
              peakPct > 92
                ? alertHex
                : peakPct > 74
                  ? accentHex
                  : secondaryHex,
          }}
        />
      </div>

      {/* Calibrated Vertical Fader Rail */}
      <div
        ref={railRef}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          updateFromClientY(e.clientY);
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          updateFromClientY(e.clientY);
        }}
        onPointerUp={(e) => {
          if (!dragging) return;
          setDragging(false);
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
        }}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onChange(defaultValue);
        }}
        title="Drag fader · Double-click to reset 0 dB"
        className="relative w-6 h-full flex items-center justify-center cursor-ns-resize select-none"
      >
        <div
          className="w-1.5 h-full rounded-full overflow-hidden relative"
          style={{
            backgroundColor: 'var(--pg-canvas)',
            border: '1px solid var(--pg-border)',
          }}
        >
          <div
            className="absolute bottom-0 inset-x-0 rounded-full"
            style={{
              height: `${norm * 100}%`,
              backgroundColor: accentHex,
              opacity: 0.72,
            }}
          />
        </div>
        {/* Fader Cap */}
        <div
          className="absolute left-1/2 w-5 h-2.5 rounded-[2px] flex items-center justify-center pointer-events-none shadow-sm"
          style={{
            bottom: `${norm * 100}%`,
            transform: 'translate(-50%, 50%)',
            backgroundColor: 'var(--pg-panel)',
            border: `1.5px solid ${dragging ? accentHex : 'var(--pg-border-strong)'}`,
          }}
        >
          <div className="w-3 h-[1.5px] rounded-full" style={{ backgroundColor: accentHex }} />
        </div>
      </div>
    </div>
  );
};

function formatStripFilterLabel(strip: MixerChannelStrip): string {
  if (strip.filterMode === 'bp') {
    const hz = Math.round(45 * Math.pow(280, Math.max(0, Math.min(1, strip.filterPos))));
    return `BP ${hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : hz}`;
  }
  if (strip.filterPos < 0.48) {
    const hz = Math.round(45 * Math.pow(420, strip.filterPos / 0.48));
    return `LP ${hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : hz}`;
  }
  if (strip.filterPos > 0.52) {
    const hz = Math.round(25 * Math.pow(480, (strip.filterPos - 0.52) / 0.48));
    return `HP ${hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : hz}`;
  }
  return 'FLAT';
}

export const MasterMixerPanel: React.FC<MasterMixerPanelProps> = ({
  channels,
  tracks,
  masterMixer,
  masterMuted,
  selectedChannelId,
  masterGain,
  masterLimiter,
  pitoEq,
  bpm,
  audioEnabled,
  mixerWidthPx,
  palette,
  onSelectChannel: _onSelectChannel,
  onUpdateChannel,
  onUpdateMasterMixer,
  onToggleMasterMuted,
  onUpdateTrack,
  onAddTrack,
  onDeleteTrack,
  onRequestMixerWidth,
  onChangeMasterGain,
  onChangeMasterLimiter,
  onChangePitoEq,
  onCollapse,
}) => {
  const [selectedTrackIdx, setSelectedTrackIdx] = useState<number>(0); // 0 = Main
  const [routeFocusMode, setRouteFocusMode] = useState<'to' | 'from'>('to');
  const [narrowTab, setNarrowTab] = useState<'console' | 'fx' | 'master'>('console');
  const [rackTab, setRackTab] = useState<'fx' | 'master'>('fx');
  const [fxOverlayTarget, setFxOverlayTarget] = useState<{
    trackIndex: number;
    replaceSlotId?: string;
  } | null>(null);
  const [trackPeaks, setTrackPeaks] = useState<Record<number, number>>({});
  const [masterMeter, setMasterMeter] = useState<{ peak: number; gainReductionDb: number }>({
    peak: 0,
    gainReductionDb: 0,
  });

  useEffect(() => {
    if (!audioEnabled) {
      setTrackPeaks({});
      setMasterMeter({ peak: 0, gainReductionDb: 0 });
      return;
    }
    let rafId = 0;
    let lastTick = 0;
    const poll = (now: number) => {
      if (now - lastTick >= 45) {
        lastTick = now;
        setMasterMeter(synthEngine.getMasterMeter());
        setTrackPeaks(synthEngine.getMixerTrackPeaks());
      }
      rafId = window.requestAnimationFrame(poll);
    };
    rafId = window.requestAnimationFrame(poll);
    return () => window.cancelAnimationFrame(rafId);
  }, [audioEnabled]);

  // Keep selectedTrackIdx valid if tracks change
  useEffect(() => {
    if (selectedTrackIdx !== 0 && !tracks.some((t) => t.index === selectedTrackIdx)) {
      setSelectedTrackIdx(0);
    }
  }, [tracks, selectedTrackIdx]);

  const isWideMode = mixerWidthPx >= 520;
  const grAbsDb = Math.min(18, Math.abs(masterMeter.gainReductionDb));
  const grPct = Math.min(100, Math.round((grAbsDb / 12) * 100));

  const activeTrackObj =
    selectedTrackIdx === 0 ? null : tracks.find((t) => t.index === selectedTrackIdx) ?? null;
  const activeStrip: MixerChannelStrip = activeTrackObj ? activeTrackObj.strip : masterMixer;
  const activeTrackLabel = activeTrackObj
    ? `Ch ${activeTrackObj.index} · ${activeTrackObj.name}`
    : 'Main Bus (M)';
  const activeTrackAccent = activeTrackObj
    ? resolveAccentHex(activeTrackObj.accent, palette)
    : palette.colors.primary;
  const selectedRackChannel =
    channels.find((c) => c.id === selectedChannelId) ?? channels[0] ?? null;
  const effectiveFocusMode: 'to' | 'from' =
    selectedTrackIdx === 0 ? 'to' : routeFocusMode;

  const toggleTrackSend = (fromIdx: number, toIdx: number, exclusive = false) => {
    const tr = tracks.find((t) => t.index === fromIdx);
    if (!tr || wouldTrackSendCreateCycle(tracks, fromIdx, toIdx)) return;
    const current = getEffectiveTrackSends(tr);
    if (exclusive) {
      onUpdateTrack(fromIdx, { sends: [{ targetIndex: toIdx, amount: 1 }] });
      return;
    }
    const exists = current.some((s) => s.targetIndex === toIdx);
    const next = exists
      ? current.filter((s) => s.targetIndex !== toIdx)
      : [...current, { targetIndex: toIdx, amount: current.length === 0 ? 1 : 0.75 }];
    onUpdateTrack(fromIdx, { sends: next });
  };

  const updateTrackSendAmount = (fromIdx: number, toIdx: number, amount: number) => {
    const tr = tracks.find((t) => t.index === fromIdx);
    if (!tr) return;
    const current = getEffectiveTrackSends(tr);
    const clamped = Math.max(0, Math.min(1.25, Number(amount.toFixed(3))));
    const exists = current.some((s) => s.targetIndex === toIdx);
    const next = exists
      ? current.map((s) => (s.targetIndex === toIdx ? { ...s, amount: clamped } : s))
      : [...current, { targetIndex: toIdx, amount: clamped }];
    onUpdateTrack(fromIdx, { sends: next });
  };

  const handleUpdateSelectedStrip = (patch: Partial<MixerChannelStrip>) => {
    if (selectedTrackIdx === 0 || !activeTrackObj) {
      onUpdateMasterMixer(patch);
    } else {
      onUpdateTrack(activeTrackObj.index, {
        strip: { ...activeTrackObj.strip, ...patch },
      });
    }
  };

  const handleSelectFxFromOverlay = (fxType: MixerFxType) => {
    if (!fxOverlayTarget) return;
    const { trackIndex, replaceSlotId } = fxOverlayTarget;
    const newSlot = createDefaultFxSlot(fxType);

    if (trackIndex === 0) {
      const nextSlots = replaceSlotId
        ? masterMixer.fxSlots.map((s) => (s.id === replaceSlotId ? newSlot : s))
        : [...masterMixer.fxSlots, newSlot];
      onUpdateMasterMixer({ fxSlots: nextSlots });
    } else {
      const tr = tracks.find((t) => t.index === trackIndex);
      if (tr) {
        const nextSlots = replaceSlotId
          ? tr.strip.fxSlots.map((s) => (s.id === replaceSlotId ? newSlot : s))
          : [...tr.strip.fxSlots, newSlot];
        onUpdateTrack(trackIndex, {
          strip: { ...tr.strip, fxSlots: nextSlots },
        });
      }
    }

    setSelectedTrackIdx(trackIndex);
    setRackTab('fx');
    if (!isWideMode) {
      setNarrowTab('fx');
    }
    setFxOverlayTarget(null);
  };

  const overlayTrackObj =
    fxOverlayTarget && fxOverlayTarget.trackIndex > 0
      ? tracks.find((t) => t.index === fxOverlayTarget.trackIndex) ?? null
      : null;
  const overlayTrackLabel = overlayTrackObj
    ? `Ch ${overlayTrackObj.index} · ${overlayTrackObj.name}`
    : 'Main Bus (M)';
  const overlayTrackAccent = overlayTrackObj
    ? resolveAccentHex(overlayTrackObj.accent, palette)
    : palette.colors.primary;

  const renderChannelStrip = (opts: {
    trackIndex: number; // 0 = Main
    title: string;
    subtitle: string;
    accentHex: string;
    volume: number;
    maxVol: number;
    defaultVol: number;
    muted: boolean;
    solo?: boolean;
    canSolo?: boolean;
    canDelete?: boolean;
    peak: number;
    strip: MixerChannelStrip;
    routedNames: string[];
    onVolumeChange: (v: number) => void;
    onToggleMute: () => void;
    onToggleSolo?: () => void;
    onDelete?: () => void;
    onPatchStrip: (patch: Partial<MixerChannelStrip>) => void;
  }) => {
    const isSel = selectedTrackIdx === opts.trackIndex;
    const dbLabel =
      opts.volume <= 0.005 ? '-inf' : `${(20 * Math.log10(opts.volume / opts.defaultVol)).toFixed(1)}dB`;
    const usSigned = Math.round(((opts.strip.phaseDelayUs ?? 0.5) - 0.5) * 2000);
    const stereoPct = Math.round((opts.strip.stereoWidth ?? 0.5) * 200);

    return (
      <div
        key={`strip-${opts.trackIndex}`}
        onClick={() => setSelectedTrackIdx(opts.trackIndex)}
        className="w-[112px] shrink-0 h-full rounded flex flex-col p-1.5 gap-1.5 cursor-pointer transition-colors overflow-y-auto"
        style={{
          backgroundColor: isSel ? 'var(--pg-panel)' : 'var(--pg-canvas)',
          border: `1.5px solid ${isSel ? opts.accentHex : 'var(--pg-border)'}`,
        }}
      >
        {/* Strip Header */}
        <div className="flex items-center justify-between gap-1 shrink-0">
          <span
            className="px-1 py-0.5 rounded text-[9px] font-mono font-bold"
            style={{
              backgroundColor: `${opts.accentHex}24`,
              color: opts.accentHex,
            }}
          >
            {opts.trackIndex === 0 ? 'M' : `CH ${opts.trackIndex}`}
          </span>
          <span
            className="text-[9px] font-mono tabular-nums"
            style={{ color: 'var(--pg-text-dim)' }}
          >
            {dbLabel}
          </span>
          {opts.canDelete && opts.onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                opts.onDelete?.();
              }}
              title="Remove Insert Channel"
              className="p-0.5 rounded hover:bg-white/10"
              style={{ color: palette.colors.alert }}
            >
              <Trash2 size={9} />
            </button>
          )}
        </div>

        <div className="shrink-0">
          <div
            className="text-[10px] font-semibold truncate leading-tight"
            style={{ color: 'var(--pg-text)' }}
            title={opts.title}
          >
            {opts.title}
          </div>
          <div
            className="text-[8px] font-mono truncate"
            style={{ color: 'var(--pg-text-dim)' }}
            title={opts.routedNames.join(', ') || opts.subtitle}
          >
            {opts.routedNames.length > 0 ? `${opts.routedNames.length} rack ch` : opts.subtitle}
          </div>
        </div>

        {/* Classic Mute / Solo / Polarity Row */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={opts.onToggleMute}
            title={opts.muted ? 'Unmute' : 'Mute'}
            className="flex-1 py-0.5 rounded text-[9px] font-mono font-bold"
            style={{
              backgroundColor: opts.muted ? palette.colors.alert : 'var(--pg-surface)',
              color: opts.muted ? '#ffffff' : 'var(--pg-text-muted)',
              border: '1px solid var(--pg-border)',
            }}
          >
            M
          </button>
          {opts.canSolo && opts.onToggleSolo && (
            <button
              type="button"
              onClick={opts.onToggleSolo}
              title="Solo"
              className="flex-1 py-0.5 rounded text-[9px] font-mono font-bold"
              style={{
                backgroundColor: opts.solo ? palette.colors.primary : 'var(--pg-surface)',
                color: opts.solo ? '#090b10' : 'var(--pg-text-muted)',
                border: '1px solid var(--pg-border)',
              }}
            >
              S
            </button>
          )}
          <button
            type="button"
            onClick={() => opts.onPatchStrip({ polarityInvert: !opts.strip.polarityInvert })}
            title="Invert Phase Polarity (Ø)"
            className="flex-1 py-0.5 rounded text-[9px] font-mono font-bold"
            style={{
              backgroundColor: opts.strip.polarityInvert
                ? palette.colors.tertiary
                : 'var(--pg-surface)',
              color: opts.strip.polarityInvert ? '#090b10' : 'var(--pg-text-muted)',
              border: '1px solid var(--pg-border)',
            }}
          >
            Ø
          </button>
        </div>

        {/* Fader + Peak Meter */}
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <VerticalStripFader
            value={opts.volume}
            max={opts.maxVol}
            defaultValue={opts.defaultVol}
            peak={opts.peak}
            accentHex={opts.accentHex}
            alertHex={palette.colors.alert}
            secondaryHex={palette.colors.secondary}
            onChange={opts.onVolumeChange}
          />
        </div>

        {/* Pan, Stereo Width, Microsecond Phase Delay, FX Amount */}
        <div
          className="grid grid-cols-2 gap-1 shrink-0 pt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <RotaryMiniWheel
            size="sm"
            label="PAN"
            value={opts.strip.pan}
            bipolar
            accentHex={opts.accentHex}
            readout={`${Math.round((opts.strip.pan - 0.5) * 200)}`}
            defaultValue={0.5}
            onChange={(v) => opts.onPatchStrip({ pan: v })}
          />
          <RotaryMiniWheel
            size="sm"
            label="STEREO"
            value={opts.strip.stereoWidth}
            bipolar
            accentHex={palette.colors.tertiary}
            readout={`${stereoPct}%`}
            defaultValue={0.5}
            onChange={(v) => opts.onPatchStrip({ stereoWidth: v })}
          />
          <RotaryMiniWheel
            size="sm"
            label="PHASE"
            value={opts.strip.phaseDelayUs}
            bipolar
            accentHex={palette.colors.quaternary}
            readout={`${usSigned > 0 ? '+' : ''}${usSigned}µs`}
            defaultValue={0.5}
            onChange={(v) => opts.onPatchStrip({ phaseDelayUs: v })}
          />
          <RotaryMiniWheel
            size="sm"
            label="FX AMT"
            value={opts.strip.fxAmount}
            accentHex={palette.colors.primary}
            readout={`${Math.round(opts.strip.fxAmount * 100)}%`}
            defaultValue={1.0}
            onChange={(v) => opts.onPatchStrip({ fxAmount: v })}
          />
        </div>

        {/* Bipolar Filter (LP/HP vs BP, 2-pole vs 4-pole, Small RES Wheel) */}
        <div
          className="rounded p-1 flex flex-col gap-1 shrink-0"
          style={{
            backgroundColor: 'var(--pg-surface)',
            border: '1px solid var(--pg-border)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-0.5">
            <button
              type="button"
              onClick={() =>
                opts.onPatchStrip({
                  filterMode: opts.strip.filterMode === 'bp' ? 'bipolar' : 'bp',
                })
              }
              title="Toggle Bipolar LP/HP vs Bandpass"
              className="px-1 py-0.5 rounded text-[8px] font-mono font-bold flex-1"
              style={{
                backgroundColor:
                  opts.strip.filterMode === 'bp'
                    ? palette.colors.tertiary
                    : 'var(--pg-canvas)',
                color:
                  opts.strip.filterMode === 'bp' ? '#090b10' : 'var(--pg-text-muted)',
                border: '1px solid var(--pg-border)',
              }}
            >
              {opts.strip.filterMode === 'bp' ? 'BP' : 'LP/HP'}
            </button>
            <button
              type="button"
              onClick={() =>
                opts.onPatchStrip({
                  filterSlope: opts.strip.filterSlope === 4 ? 2 : 4,
                })
              }
              title="Toggle 2-Pole (12dB) / 4-Pole (24dB)"
              className="px-1 py-0.5 rounded text-[8px] font-mono font-bold"
              style={{
                backgroundColor:
                  opts.strip.filterSlope === 4 ? opts.accentHex : 'var(--pg-canvas)',
                color:
                  opts.strip.filterSlope === 4 ? '#090b10' : 'var(--pg-text-muted)',
                border: '1px solid var(--pg-border)',
              }}
            >
              {opts.strip.filterSlope}P
            </button>
          </div>

          <div className="grid grid-cols-2 gap-0.5 items-center">
            <RotaryMiniWheel
              size="sm"
              label={opts.strip.filterMode === 'bp' ? 'FREQ' : 'FILT'}
              value={opts.strip.filterPos}
              bipolar={opts.strip.filterMode !== 'bp'}
              accentHex={opts.accentHex}
              readout={formatStripFilterLabel(opts.strip)}
              defaultValue={0.5}
              onChange={(v) => opts.onPatchStrip({ filterPos: v })}
            />
            <RotaryMiniWheel
              size="sm"
              label="RES"
              value={opts.strip.filterRes}
              accentHex={palette.colors.alert}
              readout={`${(0.5 + opts.strip.filterRes * 14).toFixed(1)}`}
              defaultValue={0.14}
              onChange={(v) => opts.onPatchStrip({ filterRes: v })}
            />
          </div>
        </div>

        {/* FX Slots Pills on Strip */}
        <div className="flex flex-col gap-0.5 shrink-0 mt-auto">
          {opts.strip.fxSlots.slice(0, 4).map((slot) => {
            const meta = MIXER_FX_CATALOG.find((m) => m.type === slot.type);
            return (
              <div key={slot.id} className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTrackIdx(opts.trackIndex);
                    setRackTab('fx');
                    if (!isWideMode) setNarrowTab('fx');
                  }}
                  className="flex-1 min-w-0 px-1 py-0.5 rounded text-[8px] font-mono truncate text-left flex items-center justify-between"
                  style={{
                    backgroundColor: slot.enabled ? `${opts.accentHex}22` : 'var(--pg-surface)',
                    color: slot.enabled ? opts.accentHex : 'var(--pg-text-dim)',
                    border: `1px solid ${slot.enabled ? `${opts.accentHex}55` : 'var(--pg-border)'}`,
                  }}
                  title={`${meta?.name ?? slot.type} (${Math.round(slot.mix * 100)}%) — Click to edit`}
                >
                  <span className="truncate">{meta?.shortName ?? slot.type}</span>
                  <span>{slot.enabled ? '●' : '○'}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTrackIdx(opts.trackIndex);
                    setFxOverlayTarget({ trackIndex: opts.trackIndex, replaceSlotId: slot.id });
                  }}
                  title="Replace effect in this slot"
                  className="px-1 py-0.5 rounded text-[8px] font-mono hover:bg-white/10"
                  style={{
                    backgroundColor: 'var(--pg-surface)',
                    color: 'var(--pg-text-dim)',
                    border: '1px solid var(--pg-border)',
                  }}
                >
                  ▾
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedTrackIdx(opts.trackIndex);
              setFxOverlayTarget({ trackIndex: opts.trackIndex });
            }}
            title="Open Classified DSP Effects Menu"
            className="w-full py-0.5 rounded text-[8px] font-mono font-semibold hover:bg-white/10"
            style={{
              backgroundColor: 'var(--pg-surface)',
              color: opts.accentHex,
              border: `1px dashed ${opts.accentHex}66`,
            }}
          >
            + FX Slot{opts.strip.fxSlots.length > 0 ? ` (${opts.strip.fxSlots.length})` : ''}
          </button>
        </div>

        {/* Dynamic Focus Send / Route Dock (no static sends — routes to/from focused track) */}
        {(() => {
          const stripIdx = opts.trackIndex;
          const incomingCount = tracks.filter(
            (t) =>
              t.index !== stripIdx &&
              getEffectiveTrackSends(t).some((s) => s.targetIndex === stripIdx)
          ).length;

          if (isSel) {
            const trkObj =
              stripIdx > 0 ? tracks.find((t) => t.index === stripIdx) ?? null : null;
            const outSends = trkObj ? getEffectiveTrackSends(trkObj) : [];
            return (
              <div
                className="rounded p-1 flex flex-col gap-0.5 shrink-0"
                style={{
                  backgroundColor: `${opts.accentHex}16`,
                  border: `1px solid ${opts.accentHex}66`,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between text-[8px] font-mono font-bold">
                  <span style={{ color: opts.accentHex }}>FOCUS</span>
                  <span style={{ color: 'var(--pg-text-dim)' }}>IN {incomingCount}</span>
                </div>
                {stripIdx === 0 ? (
                  <div
                    className="text-[8px] font-mono truncate"
                    style={{ color: 'var(--pg-text-muted)' }}
                  >
                    Master Bus Out
                  </div>
                ) : (
                  <div
                    className="text-[8px] font-mono truncate"
                    style={{
                      color:
                        outSends.length === 0 ? palette.colors.alert : 'var(--pg-text-muted)',
                    }}
                    title={
                      outSends.length === 0
                        ? 'Unrouted — enable a destination strip'
                        : `Sending to ${outSends
                            .map((s) => (s.targetIndex === 0 ? 'M' : `CH ${s.targetIndex}`))
                            .join(', ')}`
                    }
                  >
                    {outSends.length === 0
                      ? 'OUT: NONE'
                      : `OUT→${outSends
                          .map((s) => (s.targetIndex === 0 ? 'M' : s.targetIndex))
                          .join(',')}`}
                  </div>
                )}
              </div>
            );
          }

          // Other strip relative to currently focused channel
          if (effectiveFocusMode === 'to') {
            if (stripIdx === 0) {
              const focusedTrk = tracks.find((t) => t.index === selectedTrackIdx);
              const feedsMain = focusedTrk
                ? getEffectiveTrackSends(focusedTrk).some((s) => s.targetIndex === 0)
                : false;
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTrackSend(selectedTrackIdx, 0, false);
                  }}
                  title={
                    feedsMain
                      ? `CH ${selectedTrackIdx} is routed to Main Bus — click to detach`
                      : `Route CH ${selectedTrackIdx} to Main Bus`
                  }
                  className="rounded p-1 flex items-center justify-between text-[8px] font-mono shrink-0 hover:brightness-110"
                  style={{
                    backgroundColor: feedsMain ? `${palette.colors.primary}18` : 'var(--pg-surface)',
                    border: `1px solid ${feedsMain ? `${palette.colors.primary}66` : 'var(--pg-border)'}`,
                    color: feedsMain ? palette.colors.primary : 'var(--pg-text-dim)',
                  }}
                >
                  <span>MAIN OUT</span>
                  <span>{feedsMain ? `← CH ${selectedTrackIdx}` : `+ CH ${selectedTrackIdx}`}</span>
                </button>
              );
            }

            const fromIdx = stripIdx;
            const toIdx = selectedTrackIdx;
            const trkObj = tracks.find((t) => t.index === fromIdx);
            const sends = trkObj ? getEffectiveTrackSends(trkObj) : [];
            const activeSend = sends.find((s) => s.targetIndex === toIdx);
            const isCycle = wouldTrackSendCreateCycle(tracks, fromIdx, toIdx);
            const focusShort = toIdx === 0 ? 'M' : `CH ${toIdx}`;

            return (
              <div
                className="rounded p-1 flex flex-col gap-1 shrink-0"
                style={{
                  backgroundColor: activeSend ? `${activeTrackAccent}18` : 'var(--pg-surface)',
                  border: `1px solid ${activeSend ? `${activeTrackAccent}88` : 'var(--pg-border)'}`,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {activeSend ? (
                  <>
                    <div className="flex items-center justify-between gap-0.5">
                      <span
                        className="text-[8px] font-mono font-bold truncate"
                        style={{ color: activeTrackAccent }}
                        title={`CH ${fromIdx} sending to ${focusShort}`}
                      >
                        → {focusShort}
                      </span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {sends.length > 1 && (
                          <button
                            type="button"
                            onClick={() => toggleTrackSend(fromIdx, toIdx, true)}
                            title={`Route CH ${fromIdx} exclusively to ${focusShort} (detach other outputs)`}
                            className="px-1 rounded text-[7px] font-mono font-bold hover:brightness-110"
                            style={{
                              backgroundColor: 'var(--pg-canvas)',
                              color: 'var(--pg-text-muted)',
                              border: '1px solid var(--pg-border)',
                            }}
                          >
                            ONLY
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleTrackSend(fromIdx, toIdx, false)}
                          title={`Disconnect send from CH ${fromIdx} to ${focusShort}`}
                          className="p-0.5 rounded hover:bg-white/10"
                          style={{ color: palette.colors.alert }}
                        >
                          <Unlink size={8} />
                        </button>
                      </div>
                    </div>
                    <RotaryMiniWheel
                      size="sm"
                      label="SEND"
                      value={activeSend.amount / 1.25}
                      accentHex={activeTrackAccent}
                      readout={`${Math.round(activeSend.amount * 100)}%`}
                      defaultValue={1 / 1.25}
                      onChange={(v) => updateTrackSendAmount(fromIdx, toIdx, v * 1.25)}
                    />
                  </>
                ) : (
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={isCycle}
                      onClick={() => toggleTrackSend(fromIdx, toIdx, false)}
                      title={
                        isCycle
                          ? 'Cannot create feedback loop'
                          : `Send CH ${fromIdx} to focused ${focusShort}`
                      }
                      className="flex-1 py-0.5 px-1 rounded text-[8px] font-mono font-semibold flex items-center justify-center gap-0.5 disabled:opacity-40 hover:brightness-110"
                      style={{
                        backgroundColor: 'var(--pg-canvas)',
                        color: isCycle ? 'var(--pg-text-dim)' : activeTrackAccent,
                        border: '1px solid var(--pg-border)',
                      }}
                    >
                      <ArrowRight size={8} />
                      <span>{isCycle ? 'Loop' : focusShort}</span>
                    </button>
                    {!isCycle && (
                      <button
                        type="button"
                        onClick={() => toggleTrackSend(fromIdx, toIdx, true)}
                        title={`Move CH ${fromIdx} exclusively to ${focusShort}`}
                        className="px-1 py-0.5 rounded text-[7px] font-mono font-bold hover:brightness-110"
                        style={{
                          backgroundColor: 'var(--pg-canvas)',
                          color: 'var(--pg-text-muted)',
                          border: '1px solid var(--pg-border)',
                        }}
                      >
                        ONLY
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }

          // effectiveFocusMode === 'from' (selectedTrackIdx > 0 sends TO this stripIdx)
          const fromIdx = selectedTrackIdx;
          const toIdx = stripIdx;
          const focusedTrk = tracks.find((t) => t.index === fromIdx);
          const sends = focusedTrk ? getEffectiveTrackSends(focusedTrk) : [];
          const activeSend = sends.find((s) => s.targetIndex === toIdx);
          const isCycle = wouldTrackSendCreateCycle(tracks, fromIdx, toIdx);
          const fromShort = `CH ${fromIdx}`;

          return (
            <div
              className="rounded p-1 flex flex-col gap-1 shrink-0"
              style={{
                backgroundColor: activeSend ? `${activeTrackAccent}18` : 'var(--pg-surface)',
                border: `1px solid ${activeSend ? `${activeTrackAccent}88` : 'var(--pg-border)'}`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {activeSend ? (
                <>
                  <div className="flex items-center justify-between gap-0.5">
                    <span
                      className="text-[8px] font-mono font-bold truncate"
                      style={{ color: activeTrackAccent }}
                    >
                      {fromShort} →
                    </span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {sends.length > 1 && (
                        <button
                          type="button"
                          onClick={() => toggleTrackSend(fromIdx, toIdx, true)}
                          title={`Send ${fromShort} exclusively here`}
                          className="px-1 rounded text-[7px] font-mono font-bold hover:brightness-110"
                          style={{
                            backgroundColor: 'var(--pg-canvas)',
                            color: 'var(--pg-text-muted)',
                            border: '1px solid var(--pg-border)',
                          }}
                        >
                          ONLY
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleTrackSend(fromIdx, toIdx, false)}
                        title={`Disconnect ${fromShort} send`}
                        className="p-0.5 rounded hover:bg-white/10"
                        style={{ color: palette.colors.alert }}
                      >
                        <Unlink size={8} />
                      </button>
                    </div>
                  </div>
                  <RotaryMiniWheel
                    size="sm"
                    label="SEND"
                    value={activeSend.amount / 1.25}
                    accentHex={activeTrackAccent}
                    readout={`${Math.round(activeSend.amount * 100)}%`}
                    defaultValue={1 / 1.25}
                    onChange={(v) => updateTrackSendAmount(fromIdx, toIdx, v * 1.25)}
                  />
                </>
              ) : (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    disabled={isCycle}
                    onClick={() => toggleTrackSend(fromIdx, toIdx, false)}
                    title={
                      isCycle
                        ? 'Cannot create feedback loop'
                        : `Send ${fromShort} to ${toIdx === 0 ? 'Main Bus' : `CH ${toIdx}`}`
                    }
                    className="flex-1 py-0.5 px-1 rounded text-[8px] font-mono font-semibold flex items-center justify-center gap-0.5 disabled:opacity-40 hover:brightness-110"
                    style={{
                      backgroundColor: 'var(--pg-canvas)',
                      color: isCycle ? 'var(--pg-text-dim)' : activeTrackAccent,
                      border: '1px solid var(--pg-border)',
                    }}
                  >
                    <ArrowRight size={8} />
                    <span>{isCycle ? 'Loop' : `Send ${fromShort}`}</span>
                  </button>
                  {!isCycle && (
                    <button
                      type="button"
                      onClick={() => toggleTrackSend(fromIdx, toIdx, true)}
                      title={`Route ${fromShort} exclusively here`}
                      className="px-1 py-0.5 rounded text-[7px] font-mono font-bold hover:brightness-110"
                      style={{
                        backgroundColor: 'var(--pg-canvas)',
                        color: 'var(--pg-text-muted)',
                        border: '1px solid var(--pg-border)',
                      }}
                    >
                      ONLY
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  const renderMasterProcessors = () => (
    <div className="flex flex-col gap-2">
      {/* Master Brickwall Limiter */}
      <div
        className="rounded p-2 flex flex-col gap-2"
        style={{
          backgroundColor: 'var(--pg-canvas)',
          border: '1px solid var(--pg-border-strong)',
        }}
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            <ShieldCheck
              size={12}
              style={{
                color: masterLimiter.enabled
                  ? palette.colors.secondary
                  : 'var(--pg-text-dim)',
              }}
            />
            <span className="text-[10px] font-semibold" style={{ color: 'var(--pg-text)' }}>
              Master Limiter
            </span>
          </div>
          <button
            type="button"
            onClick={() => onChangeMasterLimiter({ enabled: !masterLimiter.enabled })}
            className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold"
            style={{
              backgroundColor: masterLimiter.enabled
                ? palette.colors.secondary
                : 'var(--pg-surface)',
              color: masterLimiter.enabled ? '#090b10' : 'var(--pg-text-muted)',
              border: '1px solid var(--pg-border)',
            }}
          >
            {masterLimiter.enabled ? 'ACTIVE' : 'OFF'}
          </button>
        </div>

        {/* Gain Reduction Meter */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between text-[9px] font-mono">
            <span style={{ color: 'var(--pg-text-dim)' }}>GAIN RED</span>
            <span
              className="tabular-nums"
              style={{
                color: grAbsDb > 0.3 ? palette.colors.primary : 'var(--pg-text-muted)',
              }}
            >
              {grAbsDb > 0.05 ? `-${grAbsDb.toFixed(1)} dB` : '0.0 dB'}
            </span>
          </div>
          <div
            className="h-1.5 w-full rounded-sm overflow-hidden flex justify-end"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
            }}
          >
            <div
              className="h-full transition-[width] duration-75"
              style={{
                width: `${grPct}%`,
                backgroundColor: palette.colors.primary,
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <RotaryMiniWheel
            size="sm"
            label="THRESH"
            value={(masterLimiter.thresholdDb + 24) / 24}
            accentHex={palette.colors.secondary}
            readout={`${masterLimiter.thresholdDb.toFixed(1)}dB`}
            defaultValue={22 / 24}
            onChange={(v) =>
              onChangeMasterLimiter({
                thresholdDb: Number((-24 + v * 24).toFixed(1)),
              })
            }
          />
          <RotaryMiniWheel
            size="sm"
            label="CEILING"
            value={(masterLimiter.ceilingDb + 6) / 6}
            accentHex={palette.colors.primary}
            readout={`${masterLimiter.ceilingDb.toFixed(1)}dB`}
            defaultValue={5.7 / 6}
            onChange={(v) =>
              onChangeMasterLimiter({
                ceilingDb: Number((-6 + v * 6).toFixed(1)),
              })
            }
          />
          <RotaryMiniWheel
            size="sm"
            label="DRIVE"
            value={masterLimiter.driveDb / 12}
            accentHex={palette.colors.tertiary}
            readout={`+${masterLimiter.driveDb.toFixed(1)}dB`}
            defaultValue={0}
            onChange={(v) =>
              onChangeMasterLimiter({
                driveDb: Number((v * 12).toFixed(1)),
              })
            }
          />
          <RotaryMiniWheel
            size="sm"
            label="RELEASE"
            value={(masterLimiter.releaseMs - 15) / 285}
            accentHex={palette.colors.secondary}
            readout={`${Math.round(masterLimiter.releaseMs)}ms`}
            defaultValue={60 / 285}
            onChange={(v) =>
              onChangeMasterLimiter({
                releaseMs: Math.round(15 + v * 285),
              })
            }
          />
        </div>
      </div>

      {/* Pitochoncho 4-Node Minimum-Phase Dynamic Harmonic Equalizer */}
      <PitochonchoEqPanel
        eqState={pitoEq}
        audioEnabled={audioEnabled}
        palette={palette}
        onChangeEq={onChangePitoEq}
      />
    </div>
  );

  const renderStripsArea = () => (
    <div className="flex-1 min-w-0 h-full flex overflow-hidden">
      {/* Pinned Leftmost Main Bus Channel (Track 0) */}
      <div
        className="p-1.5 shrink-0 h-full flex"
        style={{
          backgroundColor: 'var(--pg-surface)',
          borderRight: '1px solid var(--pg-border-strong)',
        }}
      >
        {renderChannelStrip({
          trackIndex: 0,
          title: 'Main Bus',
          subtitle: masterLimiter.enabled ? 'Limit · DynEQ' : 'Master Out',
          accentHex: palette.colors.primary,
          volume: masterGain,
          maxVol: 1,
          defaultVol: 0.78,
          muted: masterMuted,
          canSolo: false,
          canDelete: false,
          peak: masterMeter.peak,
          strip: masterMixer,
          routedNames: channels.filter((c) => (c.mixerTrack ?? 0) === 0).map((c) => c.name),
          onVolumeChange: onChangeMasterGain,
          onToggleMute: onToggleMasterMuted,
          onPatchStrip: onUpdateMasterMixer,
        })}
      </div>

      {/* Scrollable Insert Channels Extending to the Right of Main */}
      <div className="flex-1 min-w-0 h-full overflow-x-auto p-1.5 flex items-stretch gap-1.5">
        {tracks.map((trk) => {
          const linked = channels.filter((c) => (c.mixerTrack ?? 0) === trk.index);
          const accentHex = resolveAccentHex(trk.accent, palette);
          return renderChannelStrip({
            trackIndex: trk.index,
            title: trk.name,
            subtitle: `Track ${trk.index}`,
            accentHex,
            volume: trk.volume,
            maxVol: 1.25,
            defaultVol: 0.85,
            muted: trk.muted,
            solo: trk.solo,
            canSolo: true,
            canDelete: tracks.length > 1,
            peak: trackPeaks[trk.index] ?? 0,
            strip: trk.strip,
            routedNames: linked.map((c) => c.name),
            onVolumeChange: (v) => onUpdateTrack(trk.index, { volume: v }),
            onToggleMute: () => onUpdateTrack(trk.index, { muted: !trk.muted }),
            onToggleSolo: () => onUpdateTrack(trk.index, { solo: !trk.solo }),
            onDelete: () => onDeleteTrack(trk.index),
            onPatchStrip: (patch) =>
              onUpdateTrack(trk.index, { strip: { ...trk.strip, ...patch } }),
          });
        })}

        {/* Quick Add Channel Column to the Right */}
        <button
          type="button"
          onClick={() => {
            onAddTrack();
            if (mixerWidthPx < 620) {
              onRequestMixerWidth?.(Math.min(760, mixerWidthPx + 116));
            }
          }}
          title="Add Mixer Insert Channel to the right"
          className="w-12 shrink-0 rounded flex flex-col items-center justify-center gap-1 hover:bg-white/5 transition-colors"
          style={{
            backgroundColor: 'var(--pg-canvas)',
            border: '1px dashed var(--pg-border-strong)',
            color: 'var(--pg-text-muted)',
          }}
        >
          <Plus size={14} style={{ color: palette.colors.primary }} />
          <span className="text-[9px] font-mono">Add Ch</span>
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="w-full h-full flex flex-col min-h-0 overflow-hidden select-none"
      style={{ backgroundColor: 'var(--pg-surface)' }}
    >
      {/* Console Header */}
      <div
        className="px-2.5 py-1.5 flex items-center justify-between gap-1.5 shrink-0"
        style={{
          backgroundColor: 'var(--pg-panel)',
          borderBottom: '1px solid var(--pg-border)',
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Sliders size={12} style={{ color: palette.colors.primary }} className="shrink-0" />
          <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--pg-text)' }}>
            Mixer Console
          </span>
          <span
            className="text-[9px] font-mono px-1 rounded shrink-0"
            style={{
              backgroundColor: 'var(--pg-canvas)',
              color: 'var(--pg-text-dim)',
              border: '1px solid var(--pg-border)',
            }}
          >
            M+{tracks.length}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              onAddTrack();
              onRequestMixerWidth?.(Math.max(mixerWidthPx + 114, 560));
            }}
            title="Add Mixer Channel to the right of Main (expands mixer left)"
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold"
            style={{
              backgroundColor: 'var(--pg-canvas)',
              color: palette.colors.primary,
              border: '1px solid var(--pg-border)',
            }}
          >
            <Plus size={10} />
            <span>Ch</span>
          </button>

          {onRequestMixerWidth && (
            <button
              type="button"
              onClick={() => onRequestMixerWidth(mixerWidthPx >= 640 ? 286 : 740)}
              title={
                mixerWidthPx >= 640
                  ? 'Compact Mixer Width'
                  : 'Expand Mixer Leftward for Full Multi-Channel & FX View'
              }
              className="p-1 rounded hover:bg-white/10"
              style={{ color: 'var(--pg-text-muted)' }}
            >
              {mixerWidthPx >= 640 ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
            </button>
          )}

          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse Mixer"
              className="p-0.5 rounded hover:bg-white/10"
              style={{ color: 'var(--pg-text-muted)' }}
            >
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Focus-Based Dynamic Send & Routing Bar */}
      <div
        className="px-2 py-1 flex flex-wrap items-center justify-between gap-1.5 shrink-0"
        style={{
          backgroundColor: 'var(--pg-canvas)',
          borderBottom: '1px solid var(--pg-border)',
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0"
            style={{
              backgroundColor: `${activeTrackAccent}22`,
              color: activeTrackAccent,
              border: `1px solid ${activeTrackAccent}55`,
            }}
          >
            Focus: {selectedTrackIdx === 0 ? 'M' : `CH ${selectedTrackIdx}`}
          </span>

          {selectedRackChannel && (
            (selectedRackChannel.mixerTrack ?? 0) === selectedTrackIdx ? (
              <span
                className="text-[9px] font-mono truncate"
                style={{ color: 'var(--pg-text-dim)' }}
                title={`Channel Rack "${selectedRackChannel.name}" is routed here`}
              >
                In ← {selectedRackChannel.name}
              </span>
            ) : (
              <button
                type="button"
                onClick={() =>
                  onUpdateChannel(selectedRackChannel.id, { mixerTrack: selectedTrackIdx })
                }
                title={`Route focused Channel Rack instrument "${selectedRackChannel.name}" to ${activeTrackLabel}`}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold flex items-center gap-1 hover:brightness-110 shrink-0"
                style={{
                  backgroundColor: 'var(--pg-panel)',
                  color: activeTrackAccent,
                  border: `1px dashed ${activeTrackAccent}77`,
                }}
              >
                <ArrowRight size={9} />
                <span className="truncate max-w-[110px]">
                  {selectedRackChannel.name} → Focus
                </span>
              </button>
            )
          )}
        </div>

        {/* Dynamic Send Direction Mode */}
        <div
          className="flex items-center rounded overflow-hidden shrink-0"
          style={{ border: '1px solid var(--pg-border)' }}
        >
          <button
            type="button"
            onClick={() => setRouteFocusMode('to')}
            title="Route any channel strip TO the currently focused channel"
            className="px-1.5 py-0.5 text-[9px] font-mono font-semibold"
            style={{
              backgroundColor:
                effectiveFocusMode === 'to' ? `${activeTrackAccent}28` : 'var(--pg-panel)',
              color: effectiveFocusMode === 'to' ? activeTrackAccent : 'var(--pg-text-dim)',
            }}
          >
            → To Focus
          </button>
          <button
            type="button"
            disabled={selectedTrackIdx === 0}
            onClick={() => setRouteFocusMode('from')}
            title={
              selectedTrackIdx === 0
                ? 'Select an insert channel (CH 1..N) to send out to other strips'
                : 'Send currently focused channel OUT to any strip'
            }
            className="px-1.5 py-0.5 text-[9px] font-mono font-semibold disabled:opacity-40"
            style={{
              backgroundColor:
                effectiveFocusMode === 'from' ? `${activeTrackAccent}28` : 'var(--pg-panel)',
              color: effectiveFocusMode === 'from' ? activeTrackAccent : 'var(--pg-text-dim)',
            }}
          >
            From Focus →
          </button>
        </div>
      </div>

      {/* Narrow Mode Sub-View Switcher (< 520px) */}
      {!isWideMode && (
        <div
          className="px-2 py-1 flex items-center gap-1 shrink-0"
          style={{
            backgroundColor: 'var(--pg-canvas)',
            borderBottom: '1px solid var(--pg-border)',
          }}
        >
          {(
            [
              { id: 'console', label: 'Strips' },
              { id: 'fx', label: `FX (${activeStrip.fxSlots.length})` },
              { id: 'master', label: 'Limit · DynEQ' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setNarrowTab(t.id)}
              className="flex-1 py-0.5 rounded text-[10px] font-semibold"
              style={{
                backgroundColor:
                  narrowTab === t.id ? `${palette.colors.primary}22` : 'var(--pg-panel)',
                color: narrowTab === t.id ? palette.colors.primary : 'var(--pg-text-muted)',
                border: `1px solid ${narrowTab === t.id ? palette.colors.primary : 'var(--pg-border)'}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      {isWideMode ? (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {renderStripsArea()}

          {/* Docked FX Chain + Master Limiter / DynEQ Rack */}
          <div
            className="w-[244px] shrink-0 h-full flex flex-col overflow-hidden"
            style={{
              backgroundColor: 'var(--pg-panel)',
              borderLeft: '1px solid var(--pg-border-strong)',
            }}
          >
            <div
              className="p-1.5 flex items-center gap-1 shrink-0"
              style={{ borderBottom: '1px solid var(--pg-border)' }}
            >
              <button
                type="button"
                onClick={() => setRackTab('fx')}
                className="flex-1 py-1 rounded text-[10px] font-semibold flex items-center justify-center gap-1"
                style={{
                  backgroundColor:
                    rackTab === 'fx' ? `${activeTrackAccent}24` : 'var(--pg-canvas)',
                  color: rackTab === 'fx' ? activeTrackAccent : 'var(--pg-text-muted)',
                  border: `1px solid ${rackTab === 'fx' ? activeTrackAccent : 'var(--pg-border)'}`,
                }}
              >
                <Sparkles size={10} />
                <span>FX Chain ({activeStrip.fxSlots.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setRackTab('master')}
                className="flex-1 py-1 rounded text-[10px] font-semibold flex items-center justify-center gap-1"
                style={{
                  backgroundColor:
                    rackTab === 'master' ? `${palette.colors.secondary}24` : 'var(--pg-canvas)',
                  color:
                    rackTab === 'master' ? palette.colors.secondary : 'var(--pg-text-muted)',
                  border: `1px solid ${
                    rackTab === 'master' ? palette.colors.secondary : 'var(--pg-border)'
                  }`,
                }}
              >
                <ShieldCheck size={10} />
                <span>Limit · DynEQ</span>
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              {rackTab === 'fx' ? (
                <MixerFxRack
                  trackLabel={activeTrackLabel}
                  accentHex={activeTrackAccent}
                  strip={activeStrip}
                  bpm={bpm}
                  palette={palette}
                  onUpdateStrip={handleUpdateSelectedStrip}
                  onOpenFxSelector={() => setFxOverlayTarget({ trackIndex: selectedTrackIdx })}
                />
              ) : (
                renderMasterProcessors()
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {narrowTab === 'console' && renderStripsArea()}
          {narrowTab === 'fx' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              <MixerFxRack
                trackLabel={activeTrackLabel}
                accentHex={activeTrackAccent}
                strip={activeStrip}
                bpm={bpm}
                palette={palette}
                onUpdateStrip={handleUpdateSelectedStrip}
                onOpenFxSelector={() => setFxOverlayTarget({ trackIndex: selectedTrackIdx })}
              />
            </div>
          )}
          {narrowTab === 'master' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              {renderMasterProcessors()}
            </div>
          )}
        </div>
      )}

      {/* Classified DSP Effects Overlay Menu */}
      <FxCatalogOverlay
        open={fxOverlayTarget !== null}
        trackLabel={overlayTrackLabel}
        accentHex={overlayTrackAccent}
        palette={palette}
        onSelectFx={handleSelectFxFromOverlay}
        onClose={() => setFxOverlayTarget(null)}
      />
    </div>
  );
};
