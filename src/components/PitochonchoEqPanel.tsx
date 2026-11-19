import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Maximize2, Sparkles, X } from 'lucide-react';
import {
  EQ_MAX_HZ,
  EQ_MIN_HZ,
  PitochonchoEqBand,
  PitochonchoEqState,
  PitochonchoTelemetry,
  biquadPeakingDbAt,
  freqToNormX,
  hzToNoteLabel,
  normXToFreq,
} from '../audio/pitochonchoEq';
import { synthEngine } from '../audio/synthEngine';
import { ThemePalette } from '../types/synth';
import { RotaryMiniWheel } from './controllers/RotaryMiniWheel';

interface PitochonchoEqPanelProps {
  eqState: PitochonchoEqState;
  audioEnabled: boolean;
  palette: ThemePalette;
  onChangeEq: (next: PitochonchoEqState) => void;
}

const HARMONIC_STEPS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8];
const GRID_FREQS = [50, 100, 250, 500, 1000, 2000, 5000, 10000];
const DB_RANGE = 15; // +-15 dB display

function formatHz(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(2)}k` : `${Math.round(hz)}Hz`;
}

export const PitochonchoEqPanel: React.FC<PitochonchoEqPanelProps> = ({
  eqState,
  audioEnabled,
  palette,
  onChangeEq,
}) => {
  const [selectedBand, setSelectedBand] = useState<number>(0);
  const [expanded, setExpanded] = useState(false);
  const [telemetry, setTelemetry] = useState<PitochonchoTelemetry>(() =>
    synthEngine.getPitochonchoTelemetry()
  );

  const bandColors = useMemo(
    () => [
      palette.colors.primary,
      palette.colors.secondary,
      palette.colors.tertiary,
      '#f472b6',
    ],
    [palette]
  );

  useEffect(() => {
    let rafId = 0;
    let lastTick = 0;
    const poll = (now: number) => {
      if (now - lastTick >= 40) {
        lastTick = now;
        setTelemetry(synthEngine.getPitochonchoTelemetry());
      }
      rafId = window.requestAnimationFrame(poll);
    };
    rafId = window.requestAnimationFrame(poll);
    return () => window.cancelAnimationFrame(rafId);
  }, [audioEnabled, eqState.enabled]);

  const updateBand = (bandIdx: number, patch: Partial<PitochonchoEqBand>) => {
    const nextBands = eqState.bands.map((b, i) =>
      i === bandIdx ? { ...b, ...patch } : b
    ) as PitochonchoEqState['bands'];
    onChangeEq({ ...eqState, bands: nextBands });
  };

  const activeBand = eqState.bands[selectedBand] ?? eqState.bands[0];
  const activeColor = bandColors[selectedBand] ?? palette.colors.primary;
  const activeTele = telemetry.bands[selectedBand];

  return (
    <>
      <div
        className="rounded p-2 flex flex-col gap-2"
        style={{
          backgroundColor: 'var(--pg-canvas)',
          border: `1px solid ${eqState.enabled ? `${palette.colors.secondary}66` : 'var(--pg-border)'}`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 min-w-0">
            <Activity
              size={12}
              style={{ color: eqState.enabled ? palette.colors.secondary : 'var(--pg-text-dim)' }}
              className="shrink-0"
            />
            <span
              className="text-[10px] font-bold tracking-wide uppercase truncate"
              style={{ color: 'var(--pg-text)' }}
              title="Minimum-phase 4-node dynamic harmonic equalizer (zero linear-phase FFT)"
            >
              Pitochoncho DynEQ
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() =>
                onChangeEq({ ...eqState, autoTrackHarmonics: !eqState.autoTrackHarmonics })
              }
              title="Auto-track Fundamental (F0) & Harmonics (2x, 3x, 4x) in real time"
              className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-0.5"
              style={{
                backgroundColor: eqState.autoTrackHarmonics
                  ? `${palette.colors.primary}28`
                  : 'var(--pg-panel)',
                color: eqState.autoTrackHarmonics ? palette.colors.primary : 'var(--pg-text-dim)',
                border: `1px solid ${eqState.autoTrackHarmonics ? `${palette.colors.primary}77` : 'var(--pg-border)'}`,
              }}
            >
              <Sparkles size={9} />
              <span>F0</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeEq({ ...eqState, enabled: !eqState.enabled })}
              className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold"
              style={{
                backgroundColor: eqState.enabled ? palette.colors.secondary : 'var(--pg-panel)',
                color: eqState.enabled ? '#090b10' : 'var(--pg-text-muted)',
                border: '1px solid var(--pg-border)',
              }}
            >
              {eqState.enabled ? 'ON' : 'OFF'}
            </button>

            <button
              type="button"
              onClick={() => setExpanded(true)}
              title="Open Large Pitochoncho Dynamic EQ View"
              className="p-0.5 rounded hover:bg-white/10"
              style={{ color: 'var(--pg-text-muted)' }}
            >
              <Maximize2 size={11} />
            </button>
          </div>
        </div>

        {/* Tracked Fundamental Badge */}
        <div
          className="flex items-center justify-between text-[9px] font-mono px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: 'var(--pg-panel)',
            border: '1px solid var(--pg-border)',
          }}
        >
          <span style={{ color: 'var(--pg-text-dim)' }}>
            {eqState.autoTrackHarmonics ? 'TRACKED F0' : 'MANUAL MODE'}
          </span>
          <span style={{ color: palette.colors.primary }}>
            {hzToNoteLabel(telemetry.fundamentalHz)} · {formatHz(telemetry.fundamentalHz)}
          </span>
        </div>

        {/* Interactive Graphic Curve (Compact) */}
        <EqGraphicCanvas
          height={108}
          eqState={eqState}
          telemetry={telemetry}
          selectedBand={selectedBand}
          bandColors={bandColors}
          palette={palette}
          onSelectBand={setSelectedBand}
          onUpdateBand={updateBand}
        />

        {/* 4 Node Selector Pills */}
        <div className="grid grid-cols-4 gap-1">
          {eqState.bands.map((band, idx) => {
            const col = bandColors[idx];
            const tele = telemetry.bands[idx];
            const isSel = idx === selectedBand;
            const liveFreq = tele?.freqHz ?? band.freqHz;
            return (
              <button
                key={band.id}
                type="button"
                onClick={() => setSelectedBand(idx)}
                onDoubleClick={() => updateBand(idx, { enabled: !band.enabled })}
                title="Click to edit · Double-click to toggle band"
                className="px-1 py-1 rounded text-center transition-colors"
                style={{
                  backgroundColor: isSel ? `${col}22` : 'var(--pg-panel)',
                  border: `1px solid ${isSel ? col : 'var(--pg-border)'}`,
                  opacity: band.enabled ? 1 : 0.45,
                }}
              >
                <div className="text-[9px] font-mono font-bold truncate" style={{ color: col }}>
                  {eqState.autoTrackHarmonics ? `${band.harmonicMult}×` : `N${idx + 1}`}
                </div>
                <div
                  className="text-[8px] font-mono tabular-nums truncate"
                  style={{ color: 'var(--pg-text-muted)' }}
                >
                  {formatHz(liveFreq)}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Node Quick Controls */}
        <div
          className="rounded p-1.5 flex flex-col gap-1.5"
          style={{
            backgroundColor: 'var(--pg-panel)',
            border: '1px solid var(--pg-border)',
          }}
        >
          <div className="flex items-center justify-between text-[9px] font-mono">
            <span className="font-bold" style={{ color: activeColor }}>
              {activeBand.label} · {formatHz(activeTele?.freqHz ?? activeBand.freqHz)}
            </span>
            <span
              className="tabular-nums"
              style={{
                color:
                  Math.abs(activeTele?.dynamicDeltaDb ?? 0) > 0.2
                    ? activeColor
                    : 'var(--pg-text-dim)',
              }}
            >
              DYN {(activeTele?.dynamicDeltaDb ?? 0) >= 0 ? '+' : ''}
              {(activeTele?.dynamicDeltaDb ?? 0).toFixed(1)}dB
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <RotaryMiniWheel
              size="sm"
              label="GAIN"
              bipolar
              value={(activeBand.gainDb + 15) / 30}
              accentHex={activeColor}
              readout={`${activeBand.gainDb >= 0 ? '+' : ''}${activeBand.gainDb.toFixed(1)}dB`}
              defaultValue={0.5}
              onChange={(v) =>
                updateBand(selectedBand, { gainDb: Number((-15 + v * 30).toFixed(1)) })
              }
            />
            <RotaryMiniWheel
              size="sm"
              label="DYN RNG"
              bipolar
              value={(activeBand.dynRangeDb + 15) / 30}
              accentHex={palette.colors.secondary}
              readout={`${activeBand.dynRangeDb >= 0 ? '+' : ''}${activeBand.dynRangeDb.toFixed(1)}dB`}
              defaultValue={0.5}
              onChange={(v) =>
                updateBand(selectedBand, { dynRangeDb: Number((-15 + v * 30).toFixed(1)) })
              }
            />
            <RotaryMiniWheel
              size="sm"
              label="THRESH"
              value={(activeBand.thresholdDb + 54) / 48}
              accentHex={palette.colors.primary}
              readout={`${Math.round(activeBand.thresholdDb)}dB`}
              defaultValue={26 / 48}
              onChange={(v) =>
                updateBand(selectedBand, { thresholdDb: Math.round(-54 + v * 48) })
              }
            />
            <RotaryMiniWheel
              size="sm"
              label="Q"
              value={(activeBand.q - 0.5) / 9.5}
              accentHex={activeColor}
              readout={activeBand.q.toFixed(1)}
              defaultValue={2 / 9.5}
              onChange={(v) =>
                updateBand(selectedBand, { q: Number((0.5 + v * 9.5).toFixed(1)) })
              }
            />
          </div>
        </div>
      </div>

      {/* Expanded Precision Popout Modal */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(6, 8, 13, 0.78)', backdropFilter: 'blur(4px)' }}
          onClick={() => setExpanded(false)}
        >
          <div
            className="w-full max-w-4xl rounded-lg overflow-hidden shadow-2xl flex flex-col"
            style={{
              backgroundColor: 'var(--pg-surface)',
              border: '1px solid var(--pg-border-strong)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2"
              style={{
                backgroundColor: 'var(--pg-panel)',
                borderBottom: '1px solid var(--pg-border-strong)',
              }}
            >
              <div className="flex items-center gap-2">
                <Activity size={15} style={{ color: palette.colors.secondary }} />
                <div>
                  <div className="text-xs font-bold" style={{ color: 'var(--pg-text)' }}>
                    Pitochoncho Graphic Dynamic Equalizer · Minimum-Phase (Non-Linear)
                  </div>
                  <div className="text-[10px] font-mono" style={{ color: 'var(--pg-text-dim)' }}>
                    4× Native Biquad IIR · Note-Tracked F0 ({hzToNoteLabel(telemetry.fundamentalHz)}{' '}
                    {formatHz(telemetry.fundamentalHz)}) · Drag nodes, Shift+Drag X for Dyn Range, Wheel for Q
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onChangeEq({ ...eqState, autoTrackHarmonics: !eqState.autoTrackHarmonics })
                  }
                  className="px-2.5 py-1 rounded text-[11px] font-mono font-semibold flex items-center gap-1"
                  style={{
                    backgroundColor: eqState.autoTrackHarmonics
                      ? `${palette.colors.primary}28`
                      : 'var(--pg-canvas)',
                    color: eqState.autoTrackHarmonics
                      ? palette.colors.primary
                      : 'var(--pg-text-muted)',
                    border: `1px solid ${eqState.autoTrackHarmonics ? palette.colors.primary : 'var(--pg-border)'}`,
                  }}
                >
                  <Sparkles size={11} />
                  <span>{eqState.autoTrackHarmonics ? 'Auto Harmonics ON' : 'Manual Freq'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeEq({ ...eqState, enabled: !eqState.enabled })}
                  className="px-2.5 py-1 rounded text-[11px] font-mono font-bold"
                  style={{
                    backgroundColor: eqState.enabled ? palette.colors.secondary : 'var(--pg-canvas)',
                    color: eqState.enabled ? '#090b10' : 'var(--pg-text-muted)',
                    border: '1px solid var(--pg-border)',
                  }}
                >
                  {eqState.enabled ? 'EQ ACTIVE' : 'BYPASSED'}
                </button>

                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="p-1 rounded hover:bg-white/10"
                  style={{ color: 'var(--pg-text-muted)' }}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Large Graphic Curve */}
            <div className="p-4 flex flex-col gap-3">
              <EqGraphicCanvas
                height={230}
                eqState={eqState}
                telemetry={telemetry}
                selectedBand={selectedBand}
                bandColors={bandColors}
                palette={palette}
                showLabels
                onSelectBand={setSelectedBand}
                onUpdateBand={updateBand}
              />

              {/* Attack / Release Timing Row */}
              <div
                className="px-3 py-2 rounded flex flex-wrap items-center justify-between gap-4"
                style={{
                  backgroundColor: 'var(--pg-panel)',
                  border: '1px solid var(--pg-border)',
                }}
              >
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-[10px] font-mono">
                    <span style={{ color: 'var(--pg-text-muted)' }}>ATTACK</span>
                    <input
                      type="range"
                      min={4}
                      max={120}
                      value={eqState.attackMs}
                      onChange={(e) =>
                        onChangeEq({ ...eqState, attackMs: Number(e.target.value) })
                      }
                      className="w-24 accent-amber-500 h-1"
                    />
                    <span className="w-10 tabular-nums" style={{ color: palette.colors.primary }}>
                      {eqState.attackMs}ms
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-[10px] font-mono">
                    <span style={{ color: 'var(--pg-text-muted)' }}>RELEASE</span>
                    <input
                      type="range"
                      min={25}
                      max={600}
                      step={5}
                      value={eqState.releaseMs}
                      onChange={(e) =>
                        onChangeEq({ ...eqState, releaseMs: Number(e.target.value) })
                      }
                      className="w-24 accent-amber-500 h-1"
                    />
                    <span className="w-11 tabular-nums" style={{ color: palette.colors.secondary }}>
                      {eqState.releaseMs}ms
                    </span>
                  </label>
                </div>

                <span className="text-[10px] font-mono" style={{ color: 'var(--pg-text-dim)' }}>
                  4× Minimum-Phase Biquads · Double-click node to flatten gain
                </span>
              </div>

              {/* 4 Band Columns */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {eqState.bands.map((band, idx) => {
                  const col = bandColors[idx];
                  const tele = telemetry.bands[idx];
                  const isSel = idx === selectedBand;
                  return (
                    <div
                      key={band.id}
                      onClick={() => setSelectedBand(idx)}
                      className="rounded p-2.5 flex flex-col gap-2 cursor-pointer"
                      style={{
                        backgroundColor: isSel ? 'var(--pg-panel)' : 'var(--pg-canvas)',
                        border: `1px solid ${isSel ? col : 'var(--pg-border)'}`,
                        opacity: band.enabled ? 1 : 0.55,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono font-bold" style={{ color: col }}>
                          {band.label}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateBand(idx, { enabled: !band.enabled });
                          }}
                          className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold"
                          style={{
                            backgroundColor: band.enabled ? col : 'var(--pg-surface)',
                            color: band.enabled ? '#090b10' : 'var(--pg-text-dim)',
                          }}
                        >
                          {band.enabled ? 'ON' : 'OFF'}
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span style={{ color: 'var(--pg-text-muted)' }}>
                          {formatHz(tele?.freqHz ?? band.freqHz)}
                        </span>
                        <span style={{ color: col }}>
                          Dyn {(tele?.dynamicDeltaDb ?? 0) >= 0 ? '+' : ''}
                          {(tele?.dynamicDeltaDb ?? 0).toFixed(1)}dB
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <RotaryMiniWheel
                          size="sm"
                          label="GAIN"
                          bipolar
                          value={(band.gainDb + 15) / 30}
                          accentHex={col}
                          readout={`${band.gainDb >= 0 ? '+' : ''}${band.gainDb.toFixed(1)}`}
                          defaultValue={0.5}
                          onChange={(v) =>
                            updateBand(idx, { gainDb: Number((-15 + v * 30).toFixed(1)) })
                          }
                        />
                        <RotaryMiniWheel
                          size="sm"
                          label="DYN"
                          bipolar
                          value={(band.dynRangeDb + 15) / 30}
                          accentHex={palette.colors.secondary}
                          readout={`${band.dynRangeDb >= 0 ? '+' : ''}${band.dynRangeDb.toFixed(1)}`}
                          defaultValue={0.5}
                          onChange={(v) =>
                            updateBand(idx, { dynRangeDb: Number((-15 + v * 30).toFixed(1)) })
                          }
                        />
                        <RotaryMiniWheel
                          size="sm"
                          label="THRESH"
                          value={(band.thresholdDb + 54) / 48}
                          accentHex={palette.colors.primary}
                          readout={`${Math.round(band.thresholdDb)}dB`}
                          defaultValue={26 / 48}
                          onChange={(v) =>
                            updateBand(idx, { thresholdDb: Math.round(-54 + v * 48) })
                          }
                        />
                        {eqState.autoTrackHarmonics ? (
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            <span className="text-[8px] font-mono" style={{ color: 'var(--pg-text-dim)' }}>
                              MULT
                            </span>
                            <select
                              value={band.harmonicMult}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                updateBand(idx, { harmonicMult: Number(e.target.value) })
                              }
                              className="w-full px-1 py-0.5 rounded text-[10px] font-mono text-center outline-none"
                              style={{
                                backgroundColor: 'var(--pg-surface)',
                                border: '1px solid var(--pg-border)',
                                color: col,
                              }}
                            >
                              {HARMONIC_STEPS.map((m) => (
                                <option key={m} value={m}>
                                  {m}× F0
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <RotaryMiniWheel
                            size="sm"
                            label="FREQ"
                            value={freqToNormX(band.freqHz)}
                            accentHex={col}
                            readout={formatHz(band.freqHz)}
                            defaultValue={freqToNormX(250)}
                            onChange={(v) =>
                              updateBand(idx, { freqHz: Math.round(normXToFreq(v)) })
                            }
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

interface EqGraphicCanvasProps {
  height: number;
  eqState: PitochonchoEqState;
  telemetry: PitochonchoTelemetry;
  selectedBand: number;
  bandColors: string[];
  palette: ThemePalette;
  showLabels?: boolean;
  onSelectBand: (idx: number) => void;
  onUpdateBand: (idx: number, patch: Partial<PitochonchoEqBand>) => void;
}

const EqGraphicCanvas: React.FC<EqGraphicCanvasProps> = ({
  height,
  eqState,
  telemetry,
  selectedBand,
  bandColors,
  palette,
  showLabels = false,
  onSelectBand,
  onUpdateBand,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    bandIdx: number;
    startX: number;
    startY: number;
    startGain: number;
    startDyn: number;
    startFreq: number;
  } | null>(null);

  const viewW = showLabels ? 720 : 280;
  const viewH = height;

  const gainToY = (db: number) => {
    const norm = (DB_RANGE - Math.max(-DB_RANGE, Math.min(DB_RANGE, db))) / (DB_RANGE * 2);
    return 8 + norm * (viewH - 16);
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      const svg = svgRef.current;
      if (!d || !svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) return;

      const dxNorm = (e.clientX - d.startX) / rect.width;
      const dyDb = -((e.clientY - d.startY) / rect.height) * (DB_RANGE * 2);

      if (e.shiftKey) {
        const nextDyn = Math.max(-15, Math.min(15, Number((d.startDyn + dyDb).toFixed(1))));
        onUpdateBand(d.bandIdx, { dynRangeDb: nextDyn });
        return;
      }

      const nextGain = Math.max(-15, Math.min(15, Number((d.startGain + dyDb).toFixed(1))));
      if (eqState.autoTrackHarmonics) {
        const currentHz = Math.max(
          EQ_MIN_HZ,
          Math.min(EQ_MAX_HZ, normXToFreq(freqToNormX(d.startFreq) + dxNorm))
        );
        const f0 = Math.max(28, telemetry.fundamentalHz);
        const rawMult = currentHz / f0;
        let closest = HARMONIC_STEPS[0];
        let bestDist = Infinity;
        for (const m of HARMONIC_STEPS) {
          const dist = Math.abs(m - rawMult);
          if (dist < bestDist) {
            bestDist = dist;
            closest = m;
          }
        }
        onUpdateBand(d.bandIdx, { gainDb: nextGain, harmonicMult: closest });
      } else {
        const nextHz = Math.round(
          normXToFreq(freqToNormX(d.startFreq) + dxNorm)
        );
        onUpdateBand(d.bandIdx, { gainDb: nextGain, freqHz: nextHz });
      }
    };

    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [eqState.autoTrackHarmonics, telemetry.fundamentalHz, onUpdateBand]);

  // Precompute static & total minimum-phase response paths across 96 log points
  const { staticPath, totalPath, totalFillPath, bandPaths } = useMemo(() => {
    const N = 96;
    const staticPts: string[] = [];
    const totalPts: string[] = [];
    const eachBandPts: string[][] = [[], [], [], []];

    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const x = t * viewW;
      const probeHz = normXToFreq(t);

      let sumStaticDb = 0;
      let sumTotalDb = 0;

      for (let bIdx = 0; bIdx < 4; bIdx++) {
        const band = eqState.bands[bIdx];
        const tele = telemetry.bands[bIdx];
        const fc = tele?.freqHz ?? band.freqHz;
        const statG = eqState.enabled && band.enabled ? band.gainDb : 0;
        const totG = eqState.enabled && band.enabled ? (tele?.totalGainDb ?? band.gainDb) : 0;

        const dbS = biquadPeakingDbAt(probeHz, fc, statG, band.q);
        const dbT = biquadPeakingDbAt(probeHz, fc, totG, band.q);
        sumStaticDb += dbS;
        sumTotalDb += dbT;
        eachBandPts[bIdx].push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${gainToY(dbT).toFixed(1)}`);
      }

      staticPts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${gainToY(sumStaticDb).toFixed(1)}`);
      totalPts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${gainToY(sumTotalDb).toFixed(1)}`);
    }

    const zeroY = gainToY(0).toFixed(1);
    const totalLine = totalPts.join(' ');
    return {
      staticPath: staticPts.join(' '),
      totalPath: totalLine,
      totalFillPath: `${totalLine} L${viewW},${zeroY} L0,${zeroY} Z`,
      bandPaths: eachBandPts.map((pts) => `${pts.join(' ')} L${viewW},${zeroY} L0,${zeroY} Z`),
    };
  }, [eqState, telemetry.bands, viewW, viewH]);

  const zeroY = gainToY(0);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${viewW} ${viewH}`}
      className="w-full rounded overflow-hidden touch-none select-none cursor-crosshair"
      style={{
        height: `${height}px`,
        backgroundColor: '#0c0f16',
        border: '1px solid var(--pg-border)',
      }}
    >
      {/* Log-Frequency Grid Lines */}
      {GRID_FREQS.map((f) => {
        const x = freqToNormX(f) * viewW;
        return (
          <g key={f}>
            <line
              x1={x}
              y1={0}
              x2={x}
              y2={viewH}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
            {showLabels && (
              <text
                x={x + 3}
                y={viewH - 4}
                fontSize={9}
                fontFamily="monospace"
                fill="rgba(255,255,255,0.35)"
              >
                {f >= 1000 ? `${f / 1000}k` : f}
              </text>
            )}
          </g>
        );
      })}

      {/* Gain Grid (+7.5 / 0 / -7.5 dB) */}
      <line
        x1={0}
        y1={gainToY(7.5)}
        x2={viewW}
        y2={gainToY(7.5)}
        stroke="rgba(255,255,255,0.04)"
        strokeDasharray="3 3"
      />
      <line
        x1={0}
        y1={zeroY}
        x2={viewW}
        y2={zeroY}
        stroke="rgba(255,255,255,0.16)"
        strokeDasharray="4 3"
      />
      <line
        x1={0}
        y1={gainToY(-7.5)}
        x2={viewW}
        y2={gainToY(-7.5)}
        stroke="rgba(255,255,255,0.04)"
        strokeDasharray="3 3"
      />

      {/* Live Spectrum Bars */}
      {telemetry.spectrumLog.map((amp, i) => {
        if (amp <= 0.01) return null;
        const bw = viewW / telemetry.spectrumLog.length;
        const bh = amp * (viewH - 8);
        return (
          <rect
            key={i}
            x={i * bw}
            y={viewH - bh}
            width={Math.max(1.5, bw - 1)}
            height={bh}
            fill="rgba(148, 163, 184, 0.16)"
          />
        );
      })}

      {/* Per-Band Minimum-Phase Bell Fills */}
      {bandPaths.map((d, idx) => (
        <path
          key={idx}
          d={d}
          fill={bandColors[idx]}
          fillOpacity={eqState.bands[idx].enabled && eqState.enabled ? 0.12 : 0.03}
        />
      ))}

      {/* Static Base Curve Ghost */}
      <path
        d={staticPath}
        fill="none"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth={1.1}
        strokeDasharray="3 3"
      />

      {/* Combined Dynamic Total Curve */}
      <path d={totalFillPath} fill={palette.colors.secondary} fillOpacity={0.1} />
      <path
        d={totalPath}
        fill="none"
        stroke={eqState.enabled ? '#f8fafc' : 'rgba(255,255,255,0.35)'}
        strokeWidth={showLabels ? 2.2 : 1.7}
      />

      {/* 4 Draggable Harmonic / Dynamic Nodes */}
      {eqState.bands.map((band, idx) => {
        const tele = telemetry.bands[idx];
        const col = bandColors[idx];
        const freqHz = tele?.freqHz ?? band.freqHz;
        const x = freqToNormX(freqHz) * viewW;
        const staticY = gainToY(band.gainDb);
        const dynamicY = gainToY(tele?.totalGainDb ?? band.gainDb);
        const minExcursionY = gainToY(band.gainDb + band.dynRangeDb);
        const isSel = idx === selectedBand;

        return (
          <g key={band.id} opacity={band.enabled ? 1 : 0.4}>
            {/* Harmonic frequency vertical guide */}
            <line
              x1={x}
              y1={4}
              x2={x}
              y2={viewH - 4}
              stroke={col}
              strokeOpacity={isSel ? 0.45 : 0.18}
              strokeDasharray="2 2"
            />

            {/* Dynamic range span bar */}
            {Math.abs(band.dynRangeDb) > 0.2 && (
              <line
                x1={x}
                y1={staticY}
                x2={x}
                y2={minExcursionY}
                stroke={col}
                strokeOpacity={0.35}
                strokeWidth={2}
                strokeLinecap="round"
              />
            )}

            {/* Live dynamic bounce indicator */}
            {eqState.enabled && band.enabled && Math.abs((tele?.dynamicDeltaDb ?? 0)) > 0.15 && (
              <>
                <line
                  x1={x}
                  y1={staticY}
                  x2={x}
                  y2={dynamicY}
                  stroke="#ffffff"
                  strokeWidth={1.6}
                />
                <circle cx={x} cy={dynamicY} r={showLabels ? 4 : 3} fill="#ffffff" />
              </>
            )}

            {/* Main Draggable Static Node Handle */}
            <circle
              cx={x}
              cy={staticY}
              r={showLabels ? (isSel ? 8 : 6.5) : isSel ? 6 : 4.8}
              fill={col}
              stroke={isSel ? '#ffffff' : '#0b0e14'}
              strokeWidth={isSel ? 2 : 1.4}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectBand(idx);
                dragRef.current = {
                  bandIdx: idx,
                  startX: e.clientX,
                  startY: e.clientY,
                  startGain: band.gainDb,
                  startDyn: band.dynRangeDb,
                  startFreq: freqHz,
                };
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onUpdateBand(idx, { gainDb: 0 });
              }}
              onWheel={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const delta = e.deltaY < 0 ? 0.3 : -0.3;
                onUpdateBand(idx, {
                  q: Math.max(0.5, Math.min(10, Number((band.q + delta).toFixed(1)))),
                });
              }}
            />

            <text
              x={x}
              y={staticY - (showLabels ? 11 : 8)}
              textAnchor="middle"
              fontSize={showLabels ? 10 : 8}
              fontWeight="bold"
              fontFamily="monospace"
              fill={col}
              className="pointer-events-none"
            >
              {eqState.autoTrackHarmonics ? `${band.harmonicMult}×` : `${idx + 1}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
