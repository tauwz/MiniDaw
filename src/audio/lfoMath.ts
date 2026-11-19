import { ComponentLfoConfig, LfoSyncDivision, LfoWave, SynthModule } from '../types/synth';

export const DEFAULT_COMPONENT_LFO: ComponentLfoConfig = {
  enabled: false,
  wave: 'sine',
  predelay: 0,
  attack: 0.08,
  amount: 0.5, // 0.5 = 0 bipolar
  speed: 0.32,
  tempoSync: false,
  syncDiv: '1/4',
  global: true,
  curveTension: 0,
};

export const LFO_WAVE_OPTIONS: { id: LfoWave; label: string; short: string }[] = [
  { id: 'sine', label: 'Sine', short: 'Sin' },
  { id: 'triangle', label: 'Triangle', short: 'Tri' },
  { id: 'square', label: 'Square', short: 'Sq' },
  { id: 'saw', label: 'Saw Down', short: 'Saw' },
  { id: 'rampUp', label: 'Ramp Up', short: 'Ramp' },
  { id: 'smoothRandom', label: 'Smooth Random', short: 'SmRnd' },
  { id: 'sampleHold', label: 'Sample & Hold', short: 'S&H' },
  { id: 'expPulse', label: 'Exp Pulse', short: 'Pulse' },
];

export const LFO_SYNC_DIVISIONS: { id: LfoSyncDivision; beats: number }[] = [
  { id: '4/1', beats: 16 },
  { id: '2/1', beats: 8 },
  { id: '1/1', beats: 4 },
  { id: '1/2D', beats: 3 },
  { id: '1/2', beats: 2 },
  { id: '1/2T', beats: 4 / 3 },
  { id: '1/4D', beats: 1.5 },
  { id: '1/4', beats: 1 },
  { id: '1/4T', beats: 2 / 3 },
  { id: '1/8D', beats: 0.75 },
  { id: '1/8', beats: 0.5 },
  { id: '1/8T', beats: 1 / 3 },
  { id: '1/16', beats: 0.25 },
  { id: '1/16T', beats: 1 / 6 },
  { id: '1/32', beats: 0.125 },
];

export function syncDivToNormalized(div: LfoSyncDivision): number {
  const idx = LFO_SYNC_DIVISIONS.findIndex((d) => d.id === div);
  if (idx < 0) return 0.5;
  return idx / Math.max(1, LFO_SYNC_DIVISIONS.length - 1);
}

export function normalizedToSyncDiv(norm: number): LfoSyncDivision {
  const clamped = Math.max(0, Math.min(1, norm));
  const idx = Math.round(clamped * (LFO_SYNC_DIVISIONS.length - 1));
  return LFO_SYNC_DIVISIONS[idx]?.id ?? '1/4';
}

/**
 * Exponential / logarithmic segment tension mapper.
 * u in [0, 1], tension in [-1, 1] (0 = linear).
 * At u = 0.5, outputs m = 0.5^(1 + t*3.2) for t>=0 and 1 - 0.5^(1 + |t|*3.2) for t<0.
 */
export function evalTensionCurve(u: number, tension = 0): number {
  const x = Math.max(0, Math.min(1, u));
  const t = Math.max(-1, Math.min(1, tension));
  if (Math.abs(t) < 0.005) return x;
  if (t > 0) {
    const k = 1 + t * 3.2;
    return Math.pow(x, k);
  }
  const k = 1 + -t * 3.2;
  return 1 - Math.pow(1 - x, k);
}

/**
 * Inverse midpoint solver: given screen progress m in (0, 1) at u = 0.5, returns tension in [-1, 1].
 */
export function solveTensionFromMidpoint(m: number): number {
  const clamped = Math.max(0.06, Math.min(0.94, m));
  if (Math.abs(clamped - 0.5) < 0.008) return 0;
  if (clamped < 0.5) {
    const k = Math.log2(1 / clamped);
    return Math.max(0, Math.min(1, (k - 1) / 3.2));
  }
  const k = Math.log2(1 / (1 - clamped));
  return -Math.max(0, Math.min(1, (k - 1) / 3.2));
}

export function lfoSpeedToHz(speed: number): number {
  const s = Math.max(0, Math.min(1, speed));
  return 0.06 * Math.pow(360, s); // 0.06 Hz .. 21.6 Hz
}

export function lfoEffectiveHz(lfo: ComponentLfoConfig, bpm: number): number {
  if (!lfo.tempoSync) return lfoSpeedToHz(lfo.speed);
  const div = LFO_SYNC_DIVISIONS.find((d) => d.id === lfo.syncDiv) ?? LFO_SYNC_DIVISIONS[7];
  const beatSec = 60 / Math.max(40, Math.min(240, bpm || 120));
  return 1 / (beatSec * div.beats);
}

export function formatLfoFreqLabel(lfo: ComponentLfoConfig, bpm: number): string {
  const hz = lfoEffectiveHz(lfo, bpm);
  if (lfo.tempoSync) {
    return `${lfo.syncDiv} (${hz >= 10 ? hz.toFixed(1) : hz.toFixed(2)}Hz)`;
  }
  return hz >= 10 ? `${hz.toFixed(1)}Hz` : `${hz.toFixed(2)}Hz`;
}

export function resolveEffectiveLfo(
  lfo: ComponentLfoConfig,
  moduleLookup: Map<string, SynthModule>
): ComponentLfoConfig {
  let next = lfo;
  const amtSrc = lfo.amountSourceId ? moduleLookup.get(lfo.amountSourceId) : undefined;
  const spdSrc = lfo.speedSourceId ? moduleLookup.get(lfo.speedSourceId) : undefined;
  const attSrc = lfo.attackSourceId ? moduleLookup.get(lfo.attackSourceId) : undefined;

  if (amtSrc || spdSrc || attSrc) {
    next = { ...lfo };
    if (amtSrc) {
      next.amount = Math.max(0, Math.min(1, amtSrc.values.primary ?? 0.5));
    }
    if (spdSrc) {
      const sp = Math.max(0, Math.min(1, spdSrc.values.primary ?? 0.32));
      next.speed = sp;
      if (next.tempoSync) {
        next.syncDiv = normalizedToSyncDiv(sp);
      }
    }
    if (attSrc) {
      next.attack = Math.max(0, Math.min(1, attSrc.values.primary ?? 0.08));
    }
  }
  return next;
}

function hashStep(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1;
}

export function evalRawLfoWave(wave: LfoWave, totalCycles: number): number {
  const phase = ((totalCycles % 1) + 1) % 1;
  switch (wave) {
    case 'sine':
      return Math.sin(phase * Math.PI * 2);
    case 'triangle':
      return 1 - 4 * Math.abs(Math.round(phase - 0.25) - (phase - 0.25));
    case 'square':
      return phase < 0.5 ? 1 : -1;
    case 'saw':
      return 1 - 2 * phase;
    case 'rampUp':
      return 2 * phase - 1;
    case 'sampleHold': {
      const step = Math.floor(totalCycles);
      return hashStep(step);
    }
    case 'smoothRandom': {
      const step = Math.floor(totalCycles);
      const frac = totalCycles - step;
      const smooth = frac * frac * (3 - 2 * frac);
      const a = hashStep(step);
      const b = hashStep(step + 1);
      return a + (b - a) * smooth;
    }
    case 'expPulse': {
      const p = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
      return Math.pow(p, 2.6) * 2 - 1;
    }
    default:
      return Math.sin(phase * Math.PI * 2);
  }
}

/**
 * Evaluates full FL-style LFO output in [-1, +1], including DEL, ATT, Wave, and Curve Tension.
 */
export function evalLfoSample(
  lfo: ComponentLfoConfig,
  elapsedSec: number,
  bpm: number
): number {
  if (!lfo.enabled) return 0;
  const delSec = Math.max(0, lfo.predelay) * 1.4;
  if (elapsedSec < delSec) return 0;

  const activeTime = elapsedSec - delSec;
  const attSec = Math.max(0.005, lfo.attack * 1.6);
  const envMul = Math.min(1, activeTime / attSec);

  const hz = lfoEffectiveHz(lfo, bpm);
  const cycles = activeTime * hz;
  const raw = evalRawLfoWave(lfo.wave, cycles);
  const shaped =
    Math.sign(raw) * evalTensionCurve(Math.abs(raw), lfo.curveTension ?? 0);

  return shaped * envMul;
}

export function isLfoModActive(lfo?: ComponentLfoConfig): boolean {
  return Boolean(lfo && lfo.enabled && Math.abs(lfo.amount - 0.5) > 0.005);
}

export function formatLfoAmountPct(amount: number): string {
  const pct = Math.round((amount - 0.5) * 200);
  if (pct === 0) return '0%';
  return `${pct > 0 ? '+' : ''}${pct}%`;
}
