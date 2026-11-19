import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AdsrEnvelopeValues,
  AdsrTarget,
  ComponentLfoConfig,
  LfoSyncDivision,
  ModuleValues,
  SynthModule,
} from '../../types/synth';
import { DEFAULT_ADSR_ENVELOPES, DEFAULT_ADSR_LFOS } from '../../audio/threeXOscWorklet';
import {
  LFO_SYNC_DIVISIONS,
  LFO_WAVE_OPTIONS,
  evalLfoSample,
  evalTensionCurve,
  formatLfoAmountPct,
  lfoEffectiveHz,
  normalizedToSyncDiv,
  solveTensionFromMidpoint,
  syncDivToNormalized,
} from '../../audio/lfoMath';
import { RotaryMiniWheel } from './RotaryMiniWheel';

interface AdsrModuleProps {
  module: SynthModule;
  accentHex: string;
  bpm?: number;
  onValueChange: (values: Partial<ModuleValues>) => void;
}

const TARGET_TABS: { id: AdsrTarget; label: string }[] = [
  { id: 'amp', label: 'Amp' },
  { id: 'pan', label: 'Pan' },
  { id: 'filter', label: 'Filter' },
  { id: 'res', label: 'Res' },
  { id: 'pitch', label: 'Pitch' },
];

type DragHandle =
  | 'attack'
  | 'decaySustain'
  | 'release'
  | 'attackTension'
  | 'decayTension'
  | 'releaseTension';

export const AdsrModule: React.FC<AdsrModuleProps> = ({
  module,
  accentHex,
  bpm = 128,
  onValueChange,
}) => {
  const activeTarget: AdsrTarget = module.values.adsrTarget ?? 'amp';
  const [subTab, setSubTab] = useState<'env' | 'lfo'>('env');

  const envelopes: Record<AdsrTarget, AdsrEnvelopeValues> = {
    amp: {
      ...DEFAULT_ADSR_ENVELOPES.amp,
      ...(module.values.adsrEnvelopes?.amp ?? module.values.adsr ?? {}),
    },
    pan: { ...DEFAULT_ADSR_ENVELOPES.pan, ...(module.values.adsrEnvelopes?.pan ?? {}) },
    filter: { ...DEFAULT_ADSR_ENVELOPES.filter, ...(module.values.adsrEnvelopes?.filter ?? {}) },
    res: { ...DEFAULT_ADSR_ENVELOPES.res, ...(module.values.adsrEnvelopes?.res ?? {}) },
    pitch: { ...DEFAULT_ADSR_ENVELOPES.pitch, ...(module.values.adsrEnvelopes?.pitch ?? {}) },
  };

  const lfos: Record<AdsrTarget, ComponentLfoConfig> = {
    amp: { ...DEFAULT_ADSR_LFOS.amp, ...(module.values.adsrLfos?.amp ?? {}) },
    pan: { ...DEFAULT_ADSR_LFOS.pan, ...(module.values.adsrLfos?.pan ?? {}) },
    filter: { ...DEFAULT_ADSR_LFOS.filter, ...(module.values.adsrLfos?.filter ?? {}) },
    res: { ...DEFAULT_ADSR_LFOS.res, ...(module.values.adsrLfos?.res ?? {}) },
    pitch: { ...DEFAULT_ADSR_LFOS.pitch, ...(module.values.adsrLfos?.pitch ?? {}) },
  };

  const adsr = envelopes[activeTarget];
  const lfo = lfos[activeTarget];
  const amount = adsr.amount ?? (activeTarget === 'amp' ? 1 : 0.5);
  const attTension = adsr.attackTension ?? 0;
  const decTension = adsr.decayTension ?? 0;
  const relTension = adsr.releaseTension ?? 0;

  const svgRef = useRef<SVGSVGElement>(null);
  const [dragNode, setDragNode] = useState<DragHandle | null>(null);
  const [lfoClockSec, setLfoClockSec] = useState(0);

  useEffect(() => {
    if (subTab !== 'lfo' || !lfo.enabled) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      setLfoClockSec((t - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [subTab, lfo.enabled]);

  const commitEnvelope = (nextEnv: AdsrEnvelopeValues, primaryHint?: number) => {
    const nextEnvelopes = {
      ...envelopes,
      [activeTarget]: nextEnv,
    };
    onValueChange({
      primary: primaryHint ?? module.values.primary,
      adsrTarget: activeTarget,
      adsr: activeTarget === 'amp' ? nextEnv : envelopes.amp,
      adsrEnvelopes: nextEnvelopes,
      adsrLfos: lfos,
    });
  };

  const commitLfo = (nextLfo: ComponentLfoConfig) => {
    const nextLfos = {
      ...lfos,
      [activeTarget]: nextLfo,
    };
    onValueChange({
      adsrTarget: activeTarget,
      adsrEnvelopes: envelopes,
      adsrLfos: nextLfos,
    });
  };

  // SVG viewBox 260 x 104
  const W = 260;
  const H = 104;
  const padX = 10;
  const padY = 10;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const ax = padX + adsr.attack * (innerW * 0.32);
  const ay = padY;
  const dx = ax + Math.max(10, adsr.decay * (innerW * 0.32));
  const sy = padY + (1 - adsr.sustain) * innerH;
  const sustainEndX = Math.max(dx + 16, W - padX - adsr.release * (innerW * 0.34));
  const rx = W - padX;
  const ry = H - padY;

  // Build sampled path + individual segment hit paths with exponential/logarithmic edge curves
  const {
    pathD,
    fillD,
    attPathD,
    decPathD,
    relPathD,
    attMid,
    decMid,
    relMid,
  } = useMemo(() => {
    const steps = 18;
    const allPts: string[] = [`M ${padX.toFixed(1)} ${ry.toFixed(1)}`];
    const attPts: string[] = [`M ${padX.toFixed(1)} ${ry.toFixed(1)}`];
    const decPts: string[] = [`M ${ax.toFixed(1)} ${ay.toFixed(1)}`];
    const relPts: string[] = [`M ${sustainEndX.toFixed(1)} ${sy.toFixed(1)}`];

    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const x = padX + (ax - padX) * u;
      const y = ry + (ay - ry) * evalTensionCurve(u, attTension);
      const cmd = `L ${x.toFixed(1)} ${y.toFixed(1)}`;
      allPts.push(cmd);
      attPts.push(cmd);
    }
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const x = ax + (dx - ax) * u;
      const y = ay + (sy - ay) * evalTensionCurve(u, decTension);
      const cmd = `L ${x.toFixed(1)} ${y.toFixed(1)}`;
      allPts.push(cmd);
      decPts.push(cmd);
    }
    allPts.push(`L ${sustainEndX.toFixed(1)} ${sy.toFixed(1)}`);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const x = sustainEndX + (rx - sustainEndX) * u;
      const y = sy + (ry - sy) * evalTensionCurve(u, relTension);
      const cmd = `L ${x.toFixed(1)} ${y.toFixed(1)}`;
      allPts.push(cmd);
      relPts.push(cmd);
    }

    const line = allPts.join(' ');
    const fill = `${line} L ${padX.toFixed(1)} ${ry.toFixed(1)} Z`;

    return {
      pathD: line,
      fillD: fill,
      attPathD: attPts.join(' '),
      decPathD: decPts.join(' '),
      relPathD: relPts.join(' '),
      attMid: {
        x: (padX + ax) * 0.5,
        y: ry + (ay - ry) * evalTensionCurve(0.5, attTension),
      },
      decMid: {
        x: (ax + dx) * 0.5,
        y: ay + (sy - ay) * evalTensionCurve(0.5, decTension),
      },
      relMid: {
        x: (sustainEndX + rx) * 0.5,
        y: sy + (ry - sy) * evalTensionCurve(0.5, relTension),
      },
    };
  }, [ax, ay, dx, sy, sustainEndX, rx, ry, attTension, decTension, relTension]);

  const updateFromPointer = (clientX: number, clientY: number, node: DragHandle) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const ny = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
    const svgY = ny * H;

    if (node === 'attack') {
      const nextA = Math.max(0.01, Math.min(1, nx / 0.32));
      commitEnvelope({ ...adsr, attack: nextA }, nextA);
    } else if (node === 'decaySustain') {
      const nextS = Math.max(0.02, Math.min(1, 1 - ny));
      const aFrac = adsr.attack * 0.32;
      const nextD = Math.max(0.03, Math.min(1, (nx - aFrac) / 0.32));
      commitEnvelope({ ...adsr, decay: nextD, sustain: nextS }, nextD);
    } else if (node === 'release') {
      const nextR = Math.max(0.03, Math.min(1, (1 - nx) / 0.35));
      commitEnvelope({ ...adsr, release: nextR }, nextR);
    } else if (node === 'attackTension') {
      const denom = ay - ry;
      const prog = Math.abs(denom) > 2 ? (svgY - ry) / denom : 0.5;
      commitEnvelope({ ...adsr, attackTension: solveTensionFromMidpoint(prog) });
    } else if (node === 'decayTension') {
      const denom = sy - ay;
      const prog = Math.abs(denom) > 2 ? (svgY - ay) / denom : 0.5;
      commitEnvelope({ ...adsr, decayTension: solveTensionFromMidpoint(prog) });
    } else if (node === 'releaseTension') {
      const denom = ry - sy;
      const prog = Math.abs(denom) > 2 ? (svgY - sy) / denom : 0.5;
      commitEnvelope({ ...adsr, releaseTension: solveTensionFromMidpoint(prog) });
    }
  };

  const startDrag = (node: DragHandle, e: React.PointerEvent<SVGElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragNode(node);
  };

  const moveDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragNode) return;
    updateFromPointer(e.clientX, e.clientY, dragNode);
  };

  const endDrag = () => {
    setDragNode(null);
  };

  const formatAmountLabel = () => {
    const signed = Math.round((amount - 0.5) * 200);
    if (activeTarget === 'pitch') {
      const st = Math.round((amount - 0.5) * 48);
      return `${st > 0 ? '+' : ''}${st}st`;
    }
    return `${signed > 0 ? '+' : ''}${signed}%`;
  };

  // FL LFO waveform preview points for the LFO sub-tab (always visible shape + scaled output)
  const { lfoPreviewPath, lfoGhostPath, lfoSpanSec, lfoSignedAmt } = useMemo(() => {
    const samples = 160;
    const w = 240;
    const h = 58;
    const midY = h * 0.5;
    const ampPx = h * 0.4;
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
      const x = 6 + u * (w - 12);
      const rawVal = evalLfoSample(previewCfg, u * spanSec, bpm);
      const yGhost = midY - rawVal * ampPx;
      const yActive = midY - rawVal * signedAmt * ampPx;
      ghostPts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${yGhost.toFixed(1)}`);
      activePts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${yActive.toFixed(1)}`);
    }
    return {
      lfoPreviewPath: activePts.join(' '),
      lfoGhostPath: ghostPts.join(' '),
      lfoSpanSec: spanSec,
      lfoSignedAmt: signedAmt,
    };
  }, [lfo, bpm]);

  const lfoPhaseSec = lfoClockSec % lfoSpanSec;
  const lfoDotX = 6 + (lfoPhaseSec / lfoSpanSec) * (240 - 12);
  const lfoDotVal =
    evalLfoSample({ ...lfo, enabled: true }, lfoPhaseSec, bpm) * lfoSignedAmt;
  const lfoDotY = 29 - lfoDotVal * (58 * 0.4);

  return (
    <div className="touch-surface flex flex-col w-full h-full gap-1 select-none">
      {/* Top Row: Destination Tabs + ENV/LFO Switch + Quick AMT */}
      <div
        className="flex items-center justify-between gap-1 shrink-0"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-0.5 flex-1 min-w-0">
          {TARGET_TABS.map((t) => {
            const selected = activeTarget === t.id;
            const envAmt = envelopes[t.id].amount ?? (t.id === 'amp' ? 1 : 0.5);
            const isModActive =
              t.id === 'amp' ||
              Math.abs(envAmt - 0.5) > 0.03 ||
              (lfos[t.id].enabled && Math.abs(lfos[t.id].amount - 0.5) > 0.02);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  onValueChange({
                    adsrTarget: t.id,
                    adsrEnvelopes: envelopes,
                    adsrLfos: lfos,
                  })
                }
                className="flex-1 py-0.5 px-1 rounded text-[10px] font-semibold whitespace-nowrap transition-colors flex items-center justify-center gap-1"
                style={{
                  backgroundColor: selected ? accentHex : 'var(--pg-canvas)',
                  color: selected ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
                  border: `1px solid ${selected ? accentHex : 'var(--pg-border)'}`,
                }}
              >
                {isModActive && !selected && (
                  <span
                    className="w-1 h-1 rounded-full shrink-0"
                    style={{ backgroundColor: accentHex }}
                  />
                )}
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* ENV / LFO Mode Toggle */}
        <div
          className="flex items-center rounded p-0.5 gap-0.5 shrink-0"
          style={{ backgroundColor: 'var(--pg-canvas)', border: '1px solid var(--pg-border)' }}
        >
          <button
            type="button"
            onClick={() => setSubTab('env')}
            className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
            style={{
              backgroundColor: subTab === 'env' ? accentHex : 'transparent',
              color: subTab === 'env' ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
            }}
          >
            ENV
          </button>
          <button
            type="button"
            onClick={() => setSubTab('lfo')}
            className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
            style={{
              backgroundColor: subTab === 'lfo' ? accentHex : 'transparent',
              color: subTab === 'lfo' ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
            }}
          >
            LFO
          </button>
        </div>
      </div>

      {subTab === 'env' ? (
        <>
          {/* Interactive ADSR Curve Canvas with Exp Tension Midpoints */}
          <div
            className="flex-1 rounded overflow-hidden min-h-0 flex items-center justify-center"
            style={{ backgroundColor: 'var(--pg-canvas)', border: '1px solid var(--pg-border)' }}
            title="Drag vertices for A/D/S/R · Drag edge midpoints vertically for Exp/Log curve (double-click to reset linear)"
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="w-full h-full"
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <line x1={padX} y1={H * 0.5} x2={rx} y2={H * 0.5} stroke="var(--pg-border)" strokeWidth="0.6" strokeDasharray="3 3" />
              <line x1={padX} y1={ry} x2={rx} y2={ry} stroke="var(--pg-border)" strokeWidth="1" />

              <path d={fillD} fill={accentHex} fillOpacity="0.18" />
              <path d={pathD} fill="none" stroke={accentHex} strokeWidth="2.1" strokeLinejoin="round" />

              {/* Full-Edge Hover/Drag Hit Paths for Exponential Curve Tension */}
              <path
                d={attPathD}
                fill="none"
                stroke="transparent"
                strokeWidth="14"
                className="cursor-ns-resize"
                onPointerDown={(e) => startDrag('attackTension', e)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  commitEnvelope({ ...adsr, attackTension: 0 });
                }}
              />
              <path
                d={decPathD}
                fill="none"
                stroke="transparent"
                strokeWidth="14"
                className="cursor-ns-resize"
                onPointerDown={(e) => startDrag('decayTension', e)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  commitEnvelope({ ...adsr, decayTension: 0 });
                }}
              />
              <path
                d={relPathD}
                fill="none"
                stroke="transparent"
                strokeWidth="14"
                className="cursor-ns-resize"
                onPointerDown={(e) => startDrag('releaseTension', e)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  commitEnvelope({ ...adsr, releaseTension: 0 });
                }}
              />

              {/* Attack Edge Tension Midpoint */}
              <circle
                cx={attMid.x}
                cy={attMid.y}
                r="3.8"
                fill="var(--pg-canvas)"
                stroke={accentHex}
                strokeWidth="1.5"
                className="cursor-ns-resize opacity-85 hover:opacity-100"
                onPointerDown={(e) => startDrag('attackTension', e)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  commitEnvelope({ ...adsr, attackTension: 0 });
                }}
              />
              {/* Decay Edge Tension Midpoint */}
              <circle
                cx={decMid.x}
                cy={decMid.y}
                r="3.8"
                fill="var(--pg-canvas)"
                stroke={accentHex}
                strokeWidth="1.5"
                className="cursor-ns-resize opacity-85 hover:opacity-100"
                onPointerDown={(e) => startDrag('decayTension', e)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  commitEnvelope({ ...adsr, decayTension: 0 });
                }}
              />
              {/* Release Edge Tension Midpoint */}
              <circle
                cx={relMid.x}
                cy={relMid.y}
                r="3.8"
                fill="var(--pg-canvas)"
                stroke={accentHex}
                strokeWidth="1.5"
                className="cursor-ns-resize opacity-85 hover:opacity-100"
                onPointerDown={(e) => startDrag('releaseTension', e)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  commitEnvelope({ ...adsr, releaseTension: 0 });
                }}
              />

              {/* Attack peak handle */}
              <circle
                cx={ax}
                cy={ay}
                r="5.5"
                fill="var(--pg-surface)"
                stroke={accentHex}
                strokeWidth="2"
                className="cursor-ew-resize"
                onPointerDown={(e) => startDrag('attack', e)}
              />
              {/* Decay / Sustain handle */}
              <circle
                cx={dx}
                cy={sy}
                r="5.5"
                fill="var(--pg-surface)"
                stroke={accentHex}
                strokeWidth="2"
                className="cursor-move"
                onPointerDown={(e) => startDrag('decaySustain', e)}
              />
              {/* Release knee handle */}
              <circle
                cx={sustainEndX}
                cy={sy}
                r="5.5"
                fill="var(--pg-surface)"
                stroke={accentHex}
                strokeWidth="2"
                className="cursor-ew-resize"
                onPointerDown={(e) => startDrag('release', e)}
              />
            </svg>
          </div>

          {/* Rotary Wheels for ALL Env Parameters (A, D, S, R + Bipolar AMT) */}
          <div
            className="grid grid-cols-5 gap-1 shrink-0"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <RotaryMiniWheel
              label="ATT"
              value={adsr.attack}
              accentHex={accentHex}
              readout={`${Math.round(adsr.attack * 100)}`}
              defaultValue={DEFAULT_ADSR_ENVELOPES[activeTarget].attack}
              onChange={(v) => commitEnvelope({ ...adsr, attack: Math.max(0.001, v) }, v)}
            />
            <RotaryMiniWheel
              label="DEC"
              value={adsr.decay}
              accentHex={accentHex}
              readout={`${Math.round(adsr.decay * 100)}`}
              defaultValue={DEFAULT_ADSR_ENVELOPES[activeTarget].decay}
              onChange={(v) => commitEnvelope({ ...adsr, decay: Math.max(0.01, v) }, v)}
            />
            <RotaryMiniWheel
              label="SUS"
              value={adsr.sustain}
              accentHex={accentHex}
              readout={`${Math.round(adsr.sustain * 100)}`}
              defaultValue={DEFAULT_ADSR_ENVELOPES[activeTarget].sustain}
              onChange={(v) => commitEnvelope({ ...adsr, sustain: v }, v)}
            />
            <RotaryMiniWheel
              label="REL"
              value={adsr.release}
              accentHex={accentHex}
              readout={`${Math.round(adsr.release * 100)}`}
              defaultValue={DEFAULT_ADSR_ENVELOPES[activeTarget].release}
              onChange={(v) => commitEnvelope({ ...adsr, release: Math.max(0.01, v) }, v)}
            />
            <RotaryMiniWheel
              label="AMT"
              value={amount}
              bipolar
              bipolarHints
              accentHex={accentHex}
              readout={formatAmountLabel()}
              defaultValue={activeTarget === 'amp' ? 1.0 : 0.5}
              onChange={(v) => commitEnvelope({ ...adsr, amount: v })}
            />
          </div>
        </>
      ) : (
        /* FL Studio Destination LFO Controller View */
        <div
          className="flex-1 min-h-0 flex flex-col gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Wave Selector + Enable + Sync + Global */}
          <div className="flex items-center justify-between gap-1 shrink-0">
            <div className="flex items-center gap-0.5 flex-wrap">
              {LFO_WAVE_OPTIONS.map((w) => {
                const active = lfo.wave === w.id;
                const autoAmt = Math.abs(lfo.amount - 0.5) < 0.02 ? 0.78 : lfo.amount;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => commitLfo({ ...lfo, enabled: true, wave: w.id, amount: autoAmt })}
                    className="px-1.5 py-0.5 rounded text-[9px] font-medium whitespace-nowrap"
                    style={{
                      backgroundColor: active ? accentHex : 'var(--pg-canvas)',
                      color: active ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
                      border: `1px solid ${active ? accentHex : 'var(--pg-border)'}`,
                    }}
                  >
                    {w.short}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => commitLfo({ ...lfo, tempoSync: !lfo.tempoSync })}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono"
                style={{
                  backgroundColor: lfo.tempoSync ? accentHex : 'var(--pg-canvas)',
                  color: lfo.tempoSync ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
                  border: '1px solid var(--pg-border)',
                }}
              >
                {lfo.tempoSync ? lfo.syncDiv : `${lfoEffectiveHz(lfo, bpm).toFixed(1)}Hz`}
              </button>
              {lfo.tempoSync && (
                <select
                  value={lfo.syncDiv}
                  onChange={(e) =>
                    commitLfo({ ...lfo, syncDiv: e.target.value as LfoSyncDivision })
                  }
                  className="px-1 py-0.5 rounded text-[9px] font-mono outline-none"
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
                onClick={() => commitLfo({ ...lfo, global: !lfo.global })}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono"
                style={{
                  backgroundColor: lfo.global ? 'var(--pg-panel)' : 'var(--pg-canvas)',
                  color: lfo.global ? accentHex : 'var(--pg-text-muted)',
                  border: '1px solid var(--pg-border)',
                }}
                title="Global free-running vs Note-Retriggered"
              >
                {lfo.global ? 'GLB' : 'TRG'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextOn = !lfo.enabled;
                  commitLfo({
                    ...lfo,
                    enabled: nextOn,
                    amount:
                      nextOn && Math.abs(lfo.amount - 0.5) < 0.02 ? 0.78 : lfo.amount,
                  });
                }}
                className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                style={{
                  backgroundColor: lfo.enabled ? accentHex : 'var(--pg-canvas)',
                  color: lfo.enabled ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
                  border: '1px solid var(--pg-border)',
                }}
              >
                {lfo.enabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Live LFO Waveform Preview */}
          <div
            className="flex-1 min-h-[52px] rounded overflow-hidden relative"
            style={{ backgroundColor: 'var(--pg-canvas)', border: '1px solid var(--pg-border)' }}
          >
            <svg viewBox="0 0 240 58" preserveAspectRatio="none" className="w-full h-full block">
              <line x1="6" y1="29" x2="234" y2="29" stroke="var(--pg-border)" strokeWidth="0.7" strokeDasharray="3 3" />
              <path
                d={lfoGhostPath}
                fill="none"
                stroke={accentHex}
                strokeOpacity={Math.abs(lfoSignedAmt) < 0.03 ? '0.45' : '0.2'}
                strokeWidth="1.25"
                strokeDasharray={Math.abs(lfoSignedAmt) < 0.03 ? '3 2' : undefined}
                strokeLinejoin="round"
              />
              {Math.abs(lfoSignedAmt) >= 0.01 && (
                <path
                  d={lfoPreviewPath}
                  fill="none"
                  stroke={lfo.enabled ? accentHex : 'var(--pg-text-muted)'}
                  strokeWidth="2.1"
                  strokeLinejoin="round"
                />
              )}
              {lfo.enabled && (
                <circle cx={lfoDotX} cy={lfoDotY} r="3" fill={accentHex} />
              )}
            </svg>
          </div>

          {/* DEL, ATT, Bipolar AMT, FREQ (Hz/Sync), Bipolar CRV Rotary Wheels */}
          <div className="grid grid-cols-5 gap-1 shrink-0">
            <RotaryMiniWheel
              label="DEL"
              value={lfo.predelay}
              accentHex={accentHex}
              readout={`${Math.round(lfo.predelay * 100)}`}
              defaultValue={0}
              onChange={(v) => commitLfo({ ...lfo, enabled: true, predelay: v })}
            />
            <RotaryMiniWheel
              label="ATT"
              value={lfo.attack}
              accentHex={accentHex}
              readout={`${Math.round(lfo.attack * 1600)}ms`}
              defaultValue={0.08}
              onChange={(v) => commitLfo({ ...lfo, enabled: true, attack: v })}
            />
            <RotaryMiniWheel
              label="AMT"
              value={lfo.amount}
              bipolar
              bipolarHints
              accentHex={accentHex}
              readout={formatLfoAmountPct(lfo.amount)}
              defaultValue={0.5}
              onChange={(v) =>
                commitLfo({
                  ...lfo,
                  enabled: Math.abs(v - 0.5) > 0.005,
                  amount: v,
                })
              }
            />
            <RotaryMiniWheel
              label="FREQ"
              value={lfo.tempoSync ? syncDivToNormalized(lfo.syncDiv) : lfo.speed}
              accentHex={accentHex}
              readout={lfo.tempoSync ? lfo.syncDiv : `${lfoEffectiveHz(lfo, bpm).toFixed(2)}Hz`}
              defaultValue={0.35}
              onChange={(v) =>
                commitLfo({
                  ...lfo,
                  enabled: true,
                  speed: v,
                  ...(lfo.tempoSync ? { syncDiv: normalizedToSyncDiv(v) } : {}),
                })
              }
            />
            <RotaryMiniWheel
              label="CRV"
              value={((lfo.curveTension ?? 0) + 1) * 0.5}
              bipolar
              bipolarHints
              accentHex={accentHex}
              readout={`${Math.round((lfo.curveTension ?? 0) * 100)}%`}
              defaultValue={0.5}
              onChange={(v) =>
                commitLfo({
                  ...lfo,
                  enabled: true,
                  curveTension: Number((v * 2 - 1).toFixed(3)),
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
};
