import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, RotateCcw, Trash2, X } from 'lucide-react';
import {
  ComponentLfoConfig,
  LfoSyncDivision,
  SynthModule,
  ThemePalette,
} from '../types/synth';
import { resolveAccentHex } from '../data/themes';
import {
  DEFAULT_COMPONENT_LFO,
  LFO_SYNC_DIVISIONS,
  LFO_WAVE_OPTIONS,
  evalLfoSample,
  evalTensionCurve,
  formatLfoAmountPct,
  lfoEffectiveHz,
  normalizedToSyncDiv,
  resolveEffectiveLfo,
  solveTensionFromMidpoint,
  syncDivToNormalized,
} from '../audio/lfoMath';
import { RotaryMiniWheel } from './controllers/RotaryMiniWheel';

interface ModulationOverlayProps {
  module: SynthModule;
  allModules: SynthModule[];
  palette: ThemePalette;
  bpm: number;
  onUpdateLfo: (lfo: ComponentLfoConfig) => void;
  onDeleteModulation: () => void;
  onClose: () => void;
}

export const ModulationOverlay: React.FC<ModulationOverlayProps> = ({
  module,
  allModules,
  palette,
  bpm,
  onUpdateLfo,
  onDeleteModulation,
  onClose,
}) => {
  const accentHex = resolveAccentHex(module.accent, palette);
  const rawLfo: ComponentLfoConfig = {
    ...DEFAULT_COMPONENT_LFO,
    ...(module.lfo ?? {}),
  };

  const moduleLookup = useMemo(() => {
    const map = new Map<string, SynthModule>();
    allModules.forEach((m) => map.set(m.id, m));
    return map;
  }, [allModules]);

  const lfo = useMemo(
    () => resolveEffectiveLfo(rawLfo, moduleLookup),
    [rawLfo, moduleLookup]
  );

  const linkableWheels = useMemo(
    () =>
      allModules.filter(
        (m) =>
          m.id !== module.id &&
          (m.type === 'knob' || m.type === 'fader' || m.type === 'ribbon')
      ),
    [allModules, module.id]
  );

  const curveSvgRef = useRef<SVGSVGElement>(null);
  const [draggingCurve, setDraggingCurve] = useState(false);
  const [nowSec, setNowSec] = useState(0);

  // Smooth live preview animation inside the overlay
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      setNowSec((t - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patchLfo = (patch: Partial<ComponentLfoConfig>) => {
    onUpdateLfo({
      ...rawLfo,
      ...patch,
    });
  };

  // Interactive transfer curve SVG (180 x 140)
  const CW = 180;
  const CH = 140;
  const cPad = 14;
  const cInnerW = CW - cPad * 2;
  const cInnerH = CH - cPad * 2;

  const { curvePath, curveMidX, curveMidY } = useMemo(() => {
    const pts: string[] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps; // 0..1
      const yNorm = evalTensionCurve(u, lfo.curveTension);
      const x = cPad + u * cInnerW;
      const y = CH - cPad - yNorm * cInnerH;
      pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    const midYNorm = evalTensionCurve(0.5, lfo.curveTension);
    return {
      curvePath: pts.join(' '),
      curveMidX: cPad + 0.5 * cInnerW,
      curveMidY: CH - cPad - midYNorm * cInnerH,
    };
  }, [lfo.curveTension, cInnerW, cInnerH]);

  const updateCurveFromPointer = (clientY: number) => {
    const svg = curveSvgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ny = (clientY - rect.top) / Math.max(1, rect.height);
    const svgY = ny * CH;
    const yStart = CH - cPad;
    const yEnd = cPad;
    const prog = (svgY - yStart) / (yEnd - yStart);
    patchLfo({
      enabled: true,
      curveTension: solveTensionFromMidpoint(prog),
    });
  };

  // Live LFO sample & dot on transfer curve
  const liveRawSample = evalLfoSample({ ...lfo, enabled: true }, nowSec, bpm);
  const liveU = Math.abs(liveRawSample);
  const liveY = evalTensionCurve(liveU, lfo.curveTension);
  const dotX = cPad + liveU * cInnerW;
  const dotY = CH - cPad - liveY * cInnerH;

  // FL LFO Waveform Preview (260 x 96) with adaptive cycle span + unscaled reference wave
  const LW = 260;
  const LH = 96;
  const { lfoWavePath, lfoGhostPath, lfoSpanSec, lfoSignedAmt } = useMemo(() => {
    const samples = 180;
    const midY = LH * 0.5;
    const ampPx = LH * 0.4;
    const hz = lfoEffectiveHz(lfo, bpm);
    const delSec = Math.max(0, lfo.predelay) * 1.4;
    const attSec = Math.max(0.005, lfo.attack * 1.6);
    const spanSec = Math.max(1.2, Math.min(8, delSec + attSec * 0.5 + 3.0 / Math.max(0.25, hz)));
    const previewCfg: ComponentLfoConfig = { ...lfo, enabled: true };
    const signedAmt = (lfo.amount - 0.5) * 2;
    const activePts: string[] = [];
    const ghostPts: string[] = [];
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const x = 8 + u * (LW - 16);
      const rawVal = evalLfoSample(previewCfg, u * spanSec, bpm);
      const yGhost = midY - rawVal * ampPx;
      const yActive = midY - rawVal * signedAmt * ampPx;
      ghostPts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${yGhost.toFixed(1)}`);
      activePts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${yActive.toFixed(1)}`);
    }
    return {
      lfoWavePath: activePts.join(' '),
      lfoGhostPath: ghostPts.join(' '),
      lfoSpanSec: spanSec,
      lfoSignedAmt: signedAmt,
    };
  }, [lfo, bpm]);

  const livePhaseSec = nowSec % lfoSpanSec;
  const livePlayheadX = 8 + (livePhaseSec / lfoSpanSec) * (LW - 16);
  const livePlayheadVal =
    evalLfoSample({ ...lfo, enabled: true }, livePhaseSec, bpm) * lfoSignedAmt;
  const livePlayheadY = LH * 0.5 - livePlayheadVal * (LH * 0.4);

  const amtLinkedMod = rawLfo.amountSourceId ? moduleLookup.get(rawLfo.amountSourceId) : undefined;
  const spdLinkedMod = rawLfo.speedSourceId ? moduleLookup.get(rawLfo.speedSourceId) : undefined;
  const attLinkedMod = rawLfo.attackSourceId ? moduleLookup.get(rawLfo.attackSourceId) : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(8, 10, 14, 0.42)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Modulation for ${module.label}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[660px] rounded-lg shadow-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'rgba(20, 23, 31, 0.86)',
          backdropFilter: 'blur(14px)',
          border: `1px solid ${accentHex}66`,
          color: 'var(--pg-text)',
        }}
      >
        {/* Header */}
        <div
          className="px-4 py-2.5 flex items-center justify-between gap-3"
          style={{
            backgroundColor: 'rgba(13, 15, 20, 0.65)',
            borderBottom: '1px solid var(--pg-border)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Activity size={15} style={{ color: accentHex }} />
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">
                {module.label} · LFO Modulation
              </div>
              <div className="text-[10px] font-mono" style={{ color: 'var(--pg-text-muted)' }}>
                Tip: Hold right-click and drag up/down directly on any wheel or slider for fast -/+ LFO depth
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                const nextOn = !lfo.enabled;
                patchLfo({
                  enabled: nextOn,
                  amount:
                    nextOn && Math.abs(rawLfo.amount - 0.5) < 0.02
                      ? 0.78
                      : rawLfo.amount,
                });
              }}
              className="px-2.5 py-1 rounded text-[11px] font-semibold whitespace-nowrap"
              style={{
                backgroundColor: lfo.enabled ? accentHex : 'var(--pg-canvas)',
                color: lfo.enabled ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
                border: '1px solid var(--pg-border)',
              }}
            >
              {lfo.enabled ? 'LFO Active' : 'Bypassed'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:opacity-80"
              style={{ color: 'var(--pg-text-muted)' }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body: Left Curve Editor + Right FL Studio LFO Controller */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Adjustable Curve Section */}
          <div className="md:col-span-5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold" style={{ color: 'var(--pg-text)' }}>
                Response Curve (Exp / Log)
              </span>
              <button
                type="button"
                onClick={() => patchLfo({ curveTension: 0 })}
                className="flex items-center gap-1 text-[10px] font-mono hover:opacity-100 opacity-75"
                style={{ color: 'var(--pg-text-muted)' }}
                title="Reset curve to linear"
              >
                <RotateCcw size={10} />
                <span>Linear</span>
              </button>
            </div>

            <div
              className="rounded-md overflow-hidden"
              style={{
                backgroundColor: 'rgba(11, 13, 18, 0.72)',
                border: '1px solid var(--pg-border)',
              }}
              title="Drag center handle up/down to bend curve exponentially/logarithmically (double-click to reset)"
            >
              <svg
                ref={curveSvgRef}
                viewBox={`0 0 ${CW} ${CH}`}
                className="w-full h-[148px] block cursor-ns-resize select-none"
                onPointerMove={(e) => {
                  if (!draggingCurve) return;
                  updateCurveFromPointer(e.clientY);
                }}
                onPointerUp={(e) => {
                  if (!draggingCurve) return;
                  setDraggingCurve(false);
                  try {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  } catch {
                    // ignore
                  }
                }}
                onPointerCancel={() => setDraggingCurve(false)}
              >
                {/* Reference Diagonal & Grid */}
                <line x1={cPad} y1={CH - cPad} x2={CW - cPad} y2={cPad} stroke="var(--pg-border)" strokeWidth="1" strokeDasharray="3 3" />
                <line x1={cPad} y1={CH * 0.5} x2={CW - cPad} y2={CH * 0.5} stroke="var(--pg-border)" strokeWidth="0.6" />
                <line x1={CW * 0.5} y1={cPad} x2={CW * 0.5} y2={CH - cPad} stroke="var(--pg-border)" strokeWidth="0.6" />

                <path d={curvePath} fill="none" stroke={accentHex} strokeWidth="2.4" strokeLinecap="round" />

                {/* Full-Line Hover/Drag Hit Path for Exponential/Log Curve */}
                <path
                  d={curvePath}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="16"
                  className="cursor-ns-resize"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDraggingCurve(true);
                    updateCurveFromPointer(e.clientY);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    patchLfo({ curveTension: 0 });
                  }}
                />

                {/* Live LFO Output Dot */}
                {lfo.enabled && (
                  <circle cx={dotX} cy={dotY} r="3.5" fill={accentHex} opacity="0.85" />
                )}

                {/* Draggable Midpoint Tension Handle */}
                <circle
                  cx={curveMidX}
                  cy={curveMidY}
                  r="6"
                  fill="var(--pg-surface)"
                  stroke={accentHex}
                  strokeWidth="2.2"
                  className="cursor-ns-resize"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDraggingCurve(true);
                    updateCurveFromPointer(e.clientY);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    patchLfo({ curveTension: 0 });
                  }}
                />
              </svg>
            </div>

            {/* Live FL LFO Waveform Preview */}
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] font-semibold" style={{ color: 'var(--pg-text)' }}>
                LFO Envelope Preview
              </span>
              <span className="text-[10px] font-mono tabular-nums" style={{ color: accentHex }}>
                {formatLfoAmountPct(lfo.amount)}
              </span>
            </div>
            <div
              className="rounded-md overflow-hidden"
              style={{
                backgroundColor: 'rgba(11, 13, 18, 0.72)',
                border: '1px solid var(--pg-border)',
              }}
            >
              <svg viewBox={`0 0 ${LW} ${LH}`} className="w-full h-[96px] block">
                <line x1="8" y1={LH * 0.5} x2={LW - 8} y2={LH * 0.5} stroke="var(--pg-border)" strokeWidth="0.8" strokeDasharray="3 3" />
                <path
                  d={lfoGhostPath}
                  fill="none"
                  stroke={accentHex}
                  strokeOpacity={Math.abs(lfoSignedAmt) < 0.03 ? '0.5' : '0.2'}
                  strokeWidth="1.4"
                  strokeDasharray={Math.abs(lfoSignedAmt) < 0.03 ? '4 2' : undefined}
                  strokeLinejoin="round"
                />
                {Math.abs(lfoSignedAmt) >= 0.01 && (
                  <path
                    d={lfoWavePath}
                    fill="none"
                    stroke={lfo.enabled ? accentHex : 'var(--pg-text-muted)'}
                    strokeWidth="2.2"
                    strokeLinejoin="round"
                  />
                )}
                {lfo.enabled && (
                  <circle cx={livePlayheadX} cy={livePlayheadY} r="3.5" fill={accentHex} />
                )}
              </svg>
            </div>
          </div>

          {/* FL Studio LFO Controller Parameters */}
          <div className="md:col-span-7 flex flex-col gap-3">
            {/* Waveform Selector */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold" style={{ color: 'var(--pg-text)' }}>
                  LFO Waveform
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => patchLfo({ tempoSync: !lfo.tempoSync })}
                    className="px-2 py-0.5 rounded text-[10px] font-mono"
                    style={{
                      backgroundColor: lfo.tempoSync ? accentHex : 'var(--pg-canvas)',
                      color: lfo.tempoSync ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
                      border: '1px solid var(--pg-border)',
                    }}
                  >
                    {lfo.tempoSync ? 'Tempo Sync' : 'Free Hz'}
                  </button>
                  {lfo.tempoSync && (
                    <select
                      value={lfo.syncDiv}
                      onChange={(e) =>
                        patchLfo({ syncDiv: e.target.value as LfoSyncDivision })
                      }
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono outline-none"
                      style={{
                        backgroundColor: 'var(--pg-canvas)',
                        border: '1px solid var(--pg-border)',
                        color: 'var(--pg-text)',
                      }}
                    >
                      {LFO_SYNC_DIVISIONS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.id}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => patchLfo({ global: !lfo.global })}
                    className="px-2 py-0.5 rounded text-[10px] font-mono"
                    style={{
                      backgroundColor: lfo.global ? 'var(--pg-panel)' : 'var(--pg-canvas)',
                      color: lfo.global ? accentHex : 'var(--pg-text-muted)',
                      border: '1px solid var(--pg-border)',
                    }}
                    title="Global continuous vs Note-retriggered"
                  >
                    {lfo.global ? 'Global' : 'Retrig'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1">
                {LFO_WAVE_OPTIONS.map((w) => {
                  const active = lfo.wave === w.id;
                  const autoAmt = Math.abs(rawLfo.amount - 0.5) < 0.02 ? 0.78 : rawLfo.amount;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => patchLfo({ enabled: true, wave: w.id, amount: autoAmt })}
                      className="px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors"
                      style={{
                        backgroundColor: active ? accentHex : 'rgba(13, 15, 20, 0.7)',
                        color: active ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
                        border: `1px solid ${active ? accentHex : 'var(--pg-border)'}`,
                      }}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rotary Wheels: DEL, ATT (Attack LFO), Bipolar AMT (-/+), FREQ (Hz/Sync), Bipolar CRV */}
            <div className="grid grid-cols-5 gap-2">
              <RotaryMiniWheel
                size="md"
                label="DEL"
                value={lfo.predelay}
                accentHex={accentHex}
                readout={`${Math.round(lfo.predelay * 1400)}ms`}
                defaultValue={0}
                onChange={(v) => patchLfo({ enabled: true, predelay: v })}
              />
              <RotaryMiniWheel
                size="md"
                label="ATT"
                value={lfo.attack}
                accentHex={accentHex}
                readout={`${Math.round(lfo.attack * 1600)}ms`}
                defaultValue={0.08}
                disabled={Boolean(attLinkedMod)}
                linkedLabel={attLinkedMod?.label}
                onChange={(v) => patchLfo({ enabled: true, attack: v })}
              />
              <RotaryMiniWheel
                size="md"
                label="AMT"
                value={lfo.amount}
                bipolar
                bipolarHints
                accentHex={accentHex}
                readout={formatLfoAmountPct(lfo.amount)}
                defaultValue={0.5}
                disabled={Boolean(amtLinkedMod)}
                linkedLabel={amtLinkedMod?.label}
                onChange={(v) =>
                  patchLfo({
                    enabled: Math.abs(v - 0.5) > 0.005,
                    amount: v,
                  })
                }
              />
              <RotaryMiniWheel
                size="md"
                label="FREQ"
                value={lfo.tempoSync ? syncDivToNormalized(lfo.syncDiv) : lfo.speed}
                accentHex={accentHex}
                readout={
                  lfo.tempoSync
                    ? lfo.syncDiv
                    : `${lfoEffectiveHz(lfo, bpm).toFixed(2)}Hz`
                }
                defaultValue={0.32}
                disabled={Boolean(spdLinkedMod)}
                linkedLabel={spdLinkedMod?.label}
                onChange={(v) =>
                  patchLfo({
                    enabled: true,
                    speed: v,
                    ...(lfo.tempoSync ? { syncDiv: normalizedToSyncDiv(v) } : {}),
                  })
                }
              />
              <RotaryMiniWheel
                size="md"
                label="CRV"
                value={((lfo.curveTension ?? 0) + 1) * 0.5}
                bipolar
                bipolarHints
                accentHex={accentHex}
                readout={`${Math.round((lfo.curveTension ?? 0) * 100)}%`}
                defaultValue={0.5}
                onChange={(v) =>
                  patchLfo({
                    enabled: true,
                    curveTension: Number((v * 2 - 1).toFixed(3)),
                  })
                }
              />
            </div>

            {/* External Wheel Control Links (Bipolar AMT, FREQ in Hz/Sync, LFO Attack) */}
            <div
              className="rounded-md p-2.5 flex flex-col gap-2"
              style={{
                backgroundColor: 'rgba(13, 15, 20, 0.65)',
                border: '1px solid var(--pg-border)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold" style={{ color: 'var(--pg-text)' }}>
                  Control LFO From Another Wheel
                </span>
                <span className="text-[10px] font-mono" style={{ color: accentHex }}>
                  {lfo.tempoSync
                    ? `${lfo.syncDiv} · ${lfoEffectiveHz(lfo, bpm).toFixed(2)} Hz`
                    : `${lfoEffectiveHz(lfo, bpm).toFixed(2)} Hz`}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono" style={{ color: 'var(--pg-text-muted)' }}>
                    AMT (− / +) Wheel
                  </span>
                  <select
                    value={rawLfo.amountSourceId ?? ''}
                    onChange={(e) =>
                      patchLfo({
                        enabled: true,
                        amountSourceId: e.target.value || undefined,
                      })
                    }
                    className="px-1.5 py-1 rounded text-[11px] outline-none"
                    style={{
                      backgroundColor: 'var(--pg-canvas)',
                      border: '1px solid var(--pg-border)',
                      color: 'var(--pg-text)',
                    }}
                  >
                    <option value="">Internal Wheel</option>
                    {linkableWheels.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono" style={{ color: 'var(--pg-text-muted)' }}>
                    FREQ (Hz / Sync) Wheel
                  </span>
                  <select
                    value={rawLfo.speedSourceId ?? ''}
                    onChange={(e) =>
                      patchLfo({
                        enabled: true,
                        speedSourceId: e.target.value || undefined,
                      })
                    }
                    className="px-1.5 py-1 rounded text-[11px] outline-none"
                    style={{
                      backgroundColor: 'var(--pg-canvas)',
                      border: '1px solid var(--pg-border)',
                      color: 'var(--pg-text)',
                    }}
                  >
                    <option value="">Internal Wheel</option>
                    {linkableWheels.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono" style={{ color: 'var(--pg-text-muted)' }}>
                    ATT (Attack LFO) Wheel
                  </span>
                  <select
                    value={rawLfo.attackSourceId ?? ''}
                    onChange={(e) =>
                      patchLfo({
                        enabled: true,
                        attackSourceId: e.target.value || undefined,
                      })
                    }
                    className="px-1.5 py-1 rounded text-[11px] outline-none"
                    style={{
                      backgroundColor: 'var(--pg-canvas)',
                      border: '1px solid var(--pg-border)',
                      color: 'var(--pg-text)',
                    }}
                  >
                    <option value="">Internal Wheel</option>
                    {linkableWheels.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className="px-4 py-2.5 flex items-center justify-between gap-2"
          style={{
            backgroundColor: 'rgba(13, 15, 20, 0.65)',
            borderTop: '1px solid var(--pg-border)',
          }}
        >
          <button
            type="button"
            onClick={() => {
              onDeleteModulation();
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap"
            style={{
              backgroundColor: 'rgba(20, 22, 28, 0.85)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-alert)',
            }}
          >
            <Trash2 size={13} />
            <span>Del Modulation</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-semibold whitespace-nowrap"
            style={{
              backgroundColor: accentHex,
              color: 'var(--pg-primary-text)',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
