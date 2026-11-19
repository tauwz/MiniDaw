import {
  LfoSyncDivision,
  MixerChannelStrip,
  MixerFxCategory,
  MixerFxSlot,
  MixerFxType,
  MixerTrackSend,
  MixerTrackState,
} from '../types/synth';

export interface MixerFxCatalogEntry {
  type: MixerFxType;
  category: MixerFxCategory;
  name: string;
  shortName: string;
  supportsTimeSync?: boolean;
  defaultParams: Record<string, number>;
  paramLabels: { key: string; label: string; format?: (v: number) => string }[];
}

export const MIXER_FX_CATEGORIES: { id: MixerFxCategory; label: string }[] = [
  { id: 'mastering', label: 'Mastering' },
  { id: 'filtering', label: 'Filtering' },
  { id: 'distortion', label: 'Distortion' },
  { id: 'time', label: 'Time & Echo' },
  { id: 'modulation', label: 'Modulation' },
];

export const MIXER_FX_CATALOG: MixerFxCatalogEntry[] = [
  // Mastering
  {
    type: 'busComp',
    category: 'mastering',
    name: 'Bus Glue Compressor',
    shortName: 'GlueCmp',
    defaultParams: { thresh: 0.55, ratio: 0.35, attack: 0.3, release: 0.35, makeup: 0.35 },
    paramLabels: [
      { key: 'thresh', label: 'THRESH', format: (v) => `${Math.round(-36 + v * 36)}dB` },
      { key: 'ratio', label: 'RATIO', format: (v) => `${(1 + v * 11).toFixed(1)}:1` },
      { key: 'attack', label: 'ATK', format: (v) => `${Math.round(1 + v * 79)}ms` },
      { key: 'makeup', label: 'GAIN', format: (v) => `+${(v * 12).toFixed(1)}dB` },
    ],
  },
  {
    type: 'stereoImager',
    category: 'mastering',
    name: 'Stereo Imager M/S',
    shortName: 'Imager',
    defaultParams: { width: 0.68, focusHz: 0.45, airGain: 0.55 },
    paramLabels: [
      { key: 'width', label: 'WIDTH', format: (v) => `${Math.round(v * 200)}%` },
      { key: 'focusHz', label: 'XO HZ', format: (v) => `${Math.round(80 + v * 800)}Hz` },
      { key: 'airGain', label: 'AIR', format: (v) => `${((v - 0.5) * 12).toFixed(1)}dB` },
    ],
  },
  // Filtering
  {
    type: 'svfFilter',
    category: 'filtering',
    name: 'Dual Filter (LP/HP/BP)',
    shortName: 'Filter',
    defaultParams: { cutoff: 0.65, res: 0.25, mode: 0.0 },
    paramLabels: [
      { key: 'cutoff', label: 'CUT', format: (v) => `${Math.round(35 * Math.pow(450, v))}Hz` },
      { key: 'res', label: 'RES', format: (v) => `${(0.5 + v * 14).toFixed(1)}` },
      { key: 'mode', label: 'MODE', format: (v) => (v < 0.33 ? 'LP' : v < 0.66 ? 'BP' : 'HP') },
    ],
  },
  {
    type: 'tiltEq',
    category: 'filtering',
    name: 'Analog Tilt EQ',
    shortName: 'TiltEQ',
    defaultParams: { tilt: 0.55, pivot: 0.45 },
    paramLabels: [
      { key: 'tilt', label: 'TILT', format: (v) => `${((v - 0.5) * 18).toFixed(1)}dB` },
      { key: 'pivot', label: 'PIVOT', format: (v) => `${Math.round(180 + v * 2400)}Hz` },
    ],
  },
  // Distortion
  {
    type: 'tapeSat',
    category: 'distortion',
    name: 'Warm Tape Saturator',
    shortName: 'TapeSat',
    defaultParams: { drive: 0.35, tone: 0.72 },
    paramLabels: [
      { key: 'drive', label: 'DRIVE', format: (v) => `${Math.round(v * 100)}%` },
      { key: 'tone', label: 'TONE', format: (v) => `${Math.round(900 + v * 15000)}Hz` },
    ],
  },
  {
    type: 'tubeDrive',
    category: 'distortion',
    name: 'Tube Overdrive',
    shortName: 'TubeOD',
    defaultParams: { drive: 0.45, crunch: 0.55, tone: 0.65 },
    paramLabels: [
      { key: 'drive', label: 'DRIVE', format: (v) => `${Math.round(v * 100)}%` },
      { key: 'crunch', label: 'CRUNCH', format: (v) => `${Math.round(v * 100)}%` },
      { key: 'tone', label: 'TONE', format: (v) => `${Math.round(800 + v * 14000)}Hz` },
    ],
  },
  {
    type: 'bitcrusher',
    category: 'distortion',
    name: 'Bitcrusher / Lo-Fi',
    shortName: 'Crush',
    defaultParams: { bits: 0.45, tone: 0.7 },
    paramLabels: [
      { key: 'bits', label: 'GRIT', format: (v) => `${Math.round(16 - v * 12)}bit` },
      { key: 'tone', label: 'LPF', format: (v) => `${Math.round(600 + v * 15000)}Hz` },
    ],
  },
  // Time-Based (ms + Tempo Sync)
  {
    type: 'echoDelay',
    category: 'time',
    name: 'Precision Echo Delay',
    shortName: 'Echo',
    supportsTimeSync: true,
    defaultParams: { feedback: 0.42, damp: 0.68, stereoSpread: 0.25 },
    paramLabels: [
      { key: 'feedback', label: 'FDBK', format: (v) => `${Math.round(v * 92)}%` },
      { key: 'damp', label: 'DAMP', format: (v) => `${Math.round(600 + v * 14000)}Hz` },
      { key: 'stereoSpread', label: 'SPREAD', format: (v) => `${Math.round(v * 100)}%` },
    ],
  },
  {
    type: 'dubDelay',
    category: 'time',
    name: 'Dub Tape Echo',
    shortName: 'DubEcho',
    supportsTimeSync: true,
    defaultParams: { feedback: 0.56, damp: 0.44, grit: 0.28 },
    paramLabels: [
      { key: 'feedback', label: 'FDBK', format: (v) => `${Math.round(v * 92)}%` },
      { key: 'damp', label: 'TONE', format: (v) => `${Math.round(450 + v * 9000)}Hz` },
      { key: 'grit', label: 'GRIT', format: (v) => `${Math.round(v * 100)}%` },
    ],
  },
  {
    type: 'spaceReverb',
    category: 'time',
    name: 'Space Hall Reverb',
    shortName: 'Reverb',
    supportsTimeSync: false,
    defaultParams: { decay: 0.52, damp: 0.65, preDelay: 0.15 },
    paramLabels: [
      { key: 'decay', label: 'SIZE', format: (v) => `${(0.3 + v * 3.2).toFixed(1)}s` },
      { key: 'damp', label: 'DAMP', format: (v) => `${Math.round(900 + v * 14000)}Hz` },
      { key: 'preDelay', label: 'PRE', format: (v) => `${Math.round(v * 90)}ms` },
    ],
  },
  // Modulation
  {
    type: 'chorus',
    category: 'modulation',
    name: 'Stereo Chorus',
    shortName: 'Chorus',
    defaultParams: { rate: 0.25, depth: 0.55 },
    paramLabels: [
      { key: 'rate', label: 'RATE', format: (v) => `${(0.15 + v * 5.5).toFixed(2)}Hz` },
      { key: 'depth', label: 'DEPTH', format: (v) => `${Math.round(v * 100)}%` },
    ],
  },
  {
    type: 'phaser',
    category: 'modulation',
    name: '4-Stage Phaser',
    shortName: 'Phaser',
    defaultParams: { rate: 0.28, depth: 0.65, feedback: 0.45 },
    paramLabels: [
      { key: 'rate', label: 'RATE', format: (v) => `${(0.1 + v * 6).toFixed(2)}Hz` },
      { key: 'depth', label: 'DEPTH', format: (v) => `${Math.round(v * 100)}%` },
      { key: 'feedback', label: 'FDBK', format: (v) => `${Math.round(v * 85)}%` },
    ],
  },
  {
    type: 'flanger',
    category: 'modulation',
    name: 'Jet Flanger',
    shortName: 'Flange',
    defaultParams: { rate: 0.2, depth: 0.6, feedback: 0.55 },
    paramLabels: [
      { key: 'rate', label: 'RATE', format: (v) => `${(0.08 + v * 4.5).toFixed(2)}Hz` },
      { key: 'depth', label: 'DEPTH', format: (v) => `${Math.round(v * 100)}%` },
      { key: 'feedback', label: 'FDBK', format: (v) => `${Math.round(v * 88)}%` },
    ],
  },
  {
    type: 'autoPan',
    category: 'modulation',
    name: 'Auto-Pan / Tremolo',
    shortName: 'AutoPan',
    supportsTimeSync: true,
    defaultParams: { rate: 0.32, depth: 0.75 },
    paramLabels: [
      { key: 'rate', label: 'RATE', format: (v) => `${(0.2 + v * 12).toFixed(2)}Hz` },
      { key: 'depth', label: 'DEPTH', format: (v) => `${Math.round(v * 100)}%` },
    ],
  },
];

export const SYNC_DIV_BEATS: Record<LfoSyncDivision, number> = {
  '4/1': 16,
  '2/1': 8,
  '1/1': 4,
  '1/2D': 3,
  '1/2': 2,
  '1/2T': 4 / 3,
  '1/4D': 1.5,
  '1/4': 1,
  '1/4T': 2 / 3,
  '1/8D': 0.75,
  '1/8': 0.5,
  '1/8T': 1 / 3,
  '1/16': 0.25,
  '1/16T': 1 / 6,
  '1/32': 0.125,
};

export function syncDivToMs(div: LfoSyncDivision = '1/4', bpm = 128): number {
  const beats = SYNC_DIV_BEATS[div] ?? 1;
  const beatMs = 60000 / Math.max(40, Math.min(240, bpm));
  return Math.max(1, Math.min(2000, beatMs * beats));
}

export function createDefaultMixerStrip(pan = 0.5): MixerChannelStrip {
  return {
    pan,
    stereoWidth: 0.5, // 100% normal stereo
    phaseDelayUs: 0.5, // 0 us
    fxAmount: 1.0,
    filterPos: 0.5, // center bypass
    filterMode: 'bipolar',
    filterSlope: 2,
    filterRes: 0.14,
    polarityInvert: false,
    fxSlots: [],
  };
}

export function getEffectiveTrackSends(track: MixerTrackState): MixerTrackSend[] {
  if (Array.isArray(track.sends)) {
    return track.sends;
  }
  return [{ targetIndex: 0, amount: 1 }];
}

export function wouldTrackSendCreateCycle(
  tracks: MixerTrackState[],
  fromIdx: number,
  toIdx: number
): boolean {
  if (fromIdx <= 0) return true; // Main Bus (0) cannot send to insert tracks
  if (toIdx === 0) return false; // Routing to Main Bus (0) is always acyclic
  if (fromIdx === toIdx) return true;

  const byIdx = new Map<number, MixerTrackState>();
  tracks.forEach((t) => byIdx.set(t.index, t));

  const visited = new Set<number>([toIdx]);
  const queue: number[] = [toIdx];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === fromIdx) return true;
    const tr = byIdx.get(cur);
    if (!tr) continue;
    for (const s of getEffectiveTrackSends(tr)) {
      if (s.targetIndex > 0 && !visited.has(s.targetIndex)) {
        if (s.targetIndex === fromIdx) return true;
        visited.add(s.targetIndex);
        queue.push(s.targetIndex);
      }
    }
  }
  return false;
}

export function createDefaultFxSlot(type: MixerFxType): MixerFxSlot {
  const meta = MIXER_FX_CATALOG.find((c) => c.type === type) ?? MIXER_FX_CATALOG[0];
  return {
    id: `fx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    enabled: true,
    mix: type === 'echoDelay' || type === 'dubDelay' || type === 'spaceReverb' ? 0.32 : 0.75,
    sync: type === 'echoDelay' || type === 'dubDelay',
    syncDiv: type === 'dubDelay' ? '1/8D' : '1/4',
    timeMs: type === 'dubDelay' ? 351 : 250,
    params: { ...meta.defaultParams },
  };
}

function makeSatCurve(amount: number, asym = 0): Float32Array<ArrayBuffer> {
  const n = 256;
  const buf = new ArrayBuffer(n * 4);
  const curve = new Float32Array(buf);
  const k = Math.max(0.1, amount);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1 + asym * 0.12;
    curve[i] = Math.tanh(x * (1 + k)) / Math.tanh(1 + k);
  }
  return curve;
}

function makeCrushCurve(bitsNorm: number): Float32Array<ArrayBuffer> {
  const n = 256;
  const buf = new ArrayBuffer(n * 4);
  const curve = new Float32Array(buf);
  const bits = Math.max(3, Math.round(16 - bitsNorm * 12));
  const levels = Math.pow(2, bits - 1);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.round(x * levels) / levels;
  }
  return curve;
}

const reverbBufferCache = new Map<string, AudioBuffer>();
function getImpulseBuffer(ctx: AudioContext, decaySec: number): AudioBuffer {
  const key = `${ctx.sampleRate}-${decaySec.toFixed(1)}`;
  const cached = reverbBufferCache.get(key);
  if (cached) return cached;
  const len = Math.max(1024, Math.min(ctx.sampleRate * 3.5, Math.round(ctx.sampleRate * decaySec)));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, 2.6);
      const n = Math.random() * 2 - 1;
      lp = lp * 0.45 + n * 0.55;
      data[i] = lp * env * 0.45;
    }
  }
  reverbBufferCache.set(key, buf);
  return buf;
}

interface FxNodeHandle {
  id: string;
  type: MixerFxType;
  input: GainNode;
  output: GainNode;
  update: (slot: MixerFxSlot, fxAmt: number, bpm: number, now: number) => void;
  dispose: () => void;
}

function buildFxNodeHandle(ctx: AudioContext, slot: MixerFxSlot): FxNodeHandle {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const cleanups: (() => void)[] = [];

  input.connect(dry);
  dry.connect(output);
  wet.connect(output);

  let updater: (s: MixerFxSlot, fxAmt: number, bpm: number, now: number) => void = () => {};

  const setWetDry = (s: MixerFxSlot, fxAmt: number, now: number) => {
    const w = s.enabled ? Math.max(0, Math.min(1, s.mix * fxAmt)) : 0;
    dry.gain.setTargetAtTime(1 - w * 0.55, now, 0.015);
    wet.gain.setTargetAtTime(w, now, 0.015);
  };

  switch (slot.type) {
    case 'busComp': {
      const comp = ctx.createDynamicsCompressor();
      const makeup = ctx.createGain();
      input.connect(comp);
      comp.connect(makeup);
      makeup.connect(wet);
      updater = (s, fxAmt, _bpm, now) => {
        setWetDry(s, fxAmt, now);
        comp.threshold.setTargetAtTime(-36 + (s.params.thresh ?? 0.55) * 36, now, 0.02);
        comp.ratio.setTargetAtTime(1 + (s.params.ratio ?? 0.35) * 11, now, 0.02);
        comp.attack.setTargetAtTime(0.001 + (s.params.attack ?? 0.3) * 0.079, now, 0.02);
        comp.release.setTargetAtTime(0.04 + (s.params.release ?? 0.35) * 0.4, now, 0.02);
        makeup.gain.setTargetAtTime(Math.pow(10, ((s.params.makeup ?? 0.35) * 12) / 20), now, 0.02);
      };
      break;
    }

    case 'stereoImager': {
      const split = ctx.createChannelSplitter(2);
      const merge = ctx.createChannelMerger(2);
      const midL = ctx.createGain();
      const midR = ctx.createGain();
      const sideL = ctx.createGain();
      const sideR = ctx.createGain();
      const air = ctx.createBiquadFilter();
      air.type = 'highshelf';
      air.frequency.value = 5500;
      input.connect(split);
      split.connect(midL, 0);
      split.connect(midR, 1);
      split.connect(sideL, 0);
      split.connect(sideR, 1);
      midL.connect(merge, 0, 0);
      midR.connect(merge, 0, 1);
      sideL.connect(merge, 0, 1);
      sideR.connect(merge, 0, 0);
      merge.connect(air);
      air.connect(wet);
      updater = (s, fxAmt, _bpm, now) => {
        setWetDry(s, fxAmt, now);
        const w = (s.params.width ?? 0.68) * 2; // 0..2
        const m = 0.5 + 0.5 * (1 - Math.abs(w - 1) * 0.25);
        const cross = (1 - w) * 0.45;
        midL.gain.setTargetAtTime(m, now, 0.02);
        midR.gain.setTargetAtTime(m, now, 0.02);
        sideL.gain.setTargetAtTime(cross, now, 0.02);
        sideR.gain.setTargetAtTime(cross, now, 0.02);
        air.gain.setTargetAtTime(((s.params.airGain ?? 0.55) - 0.5) * 12, now, 0.02);
      };
      break;
    }

    case 'svfFilter': {
      const flt = ctx.createBiquadFilter();
      input.connect(flt);
      flt.connect(wet);
      updater = (s, fxAmt, _bpm, now) => {
        setWetDry(s, fxAmt, now);
        const m = s.params.mode ?? 0;
        flt.type = m < 0.33 ? 'lowpass' : m < 0.66 ? 'bandpass' : 'highpass';
        flt.frequency.setTargetAtTime(35 * Math.pow(450, s.params.cutoff ?? 0.65), now, 0.02);
        flt.Q.setTargetAtTime(0.5 + (s.params.res ?? 0.25) * 14, now, 0.02);
      };
      break;
    }

    case 'tiltEq': {
      const low = ctx.createBiquadFilter();
      const high = ctx.createBiquadFilter();
      low.type = 'lowshelf';
      high.type = 'highshelf';
      input.connect(low);
      low.connect(high);
      high.connect(wet);
      updater = (s, fxAmt, _bpm, now) => {
        setWetDry(s, fxAmt, now);
        const pivot = 180 + (s.params.pivot ?? 0.45) * 2400;
        const db = ((s.params.tilt ?? 0.55) - 0.5) * 18;
        low.frequency.setTargetAtTime(pivot, now, 0.02);
        high.frequency.setTargetAtTime(pivot, now, 0.02);
        low.gain.setTargetAtTime(-db, now, 0.02);
        high.gain.setTargetAtTime(db, now, 0.02);
      };
      break;
    }

    case 'tapeSat':
    case 'tubeDrive': {
      const shaper = ctx.createWaveShaper();
      shaper.oversample = '2x';
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      input.connect(shaper);
      shaper.connect(tone);
      tone.connect(wet);
      let prevDrive = -1;
      updater = (s, fxAmt, _bpm, now) => {
        setWetDry(s, fxAmt, now);
        const d = s.params.drive ?? 0.38;
        if (Math.abs(d - prevDrive) > 0.01) {
          prevDrive = d;
          const asym = slot.type === 'tubeDrive' ? (s.params.crunch ?? 0.5) : 0;
          shaper.curve = makeSatCurve(d * (slot.type === 'tubeDrive' ? 14 : 8), asym);
        }
        tone.frequency.setTargetAtTime(800 + (s.params.tone ?? 0.68) * 15000, now, 0.02);
      };
      break;
    }

    case 'bitcrusher': {
      const shaper = ctx.createWaveShaper();
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      input.connect(shaper);
      shaper.connect(lpf);
      lpf.connect(wet);
      let prevBits = -1;
      updater = (s, fxAmt, _bpm, now) => {
        setWetDry(s, fxAmt, now);
        const b = s.params.bits ?? 0.45;
        if (Math.abs(b - prevBits) > 0.01) {
          prevBits = b;
          shaper.curve = makeCrushCurve(b);
        }
        lpf.frequency.setTargetAtTime(600 + (s.params.tone ?? 0.7) * 15000, now, 0.02);
      };
      break;
    }

    case 'echoDelay':
    case 'dubDelay': {
      const delayL = ctx.createDelay(2.5);
      const delayR = ctx.createDelay(2.5);
      const fbL = ctx.createGain();
      const fbR = ctx.createGain();
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      const split = ctx.createChannelSplitter(2);
      const merge = ctx.createChannelMerger(2);

      input.connect(split);
      split.connect(delayL, 0);
      split.connect(delayR, 1);
      delayL.connect(fbL);
      delayR.connect(fbR);
      fbL.connect(damp);
      damp.connect(delayR); // subtle ping-pong cross-feedback
      fbR.connect(delayL);
      delayL.connect(merge, 0, 0);
      delayR.connect(merge, 0, 1);
      merge.connect(wet);

      updater = (s, fxAmt, bpm, now) => {
        setWetDry(s, fxAmt, now);
        const ms = s.sync ? syncDivToMs(s.syncDiv, bpm) : (s.timeMs ?? 250);
        const sec = Math.max(0.001, Math.min(2.2, ms / 1000));
        const spread = s.params.stereoSpread ?? (slot.type === 'dubDelay' ? 0.14 : 0.25);
        delayL.delayTime.setTargetAtTime(sec, now, 0.025);
        delayR.delayTime.setTargetAtTime(Math.min(2.4, sec * (1 + spread * 0.12)), now, 0.025);
        const fb = Math.min(0.88, s.params.feedback ?? 0.45);
        fbL.gain.setTargetAtTime(fb, now, 0.02);
        fbR.gain.setTargetAtTime(fb, now, 0.02);
        damp.frequency.setTargetAtTime(500 + (s.params.damp ?? 0.65) * 13500, now, 0.02);
      };
      break;
    }

    case 'spaceReverb': {
      const pre = ctx.createDelay(0.25);
      const conv = ctx.createConvolver();
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      conv.buffer = getImpulseBuffer(ctx, 1.8);
      input.connect(pre);
      pre.connect(conv);
      conv.connect(damp);
      damp.connect(wet);
      let lastDecayBucket = 1.8;
      updater = (s, fxAmt, _bpm, now) => {
        setWetDry(s, fxAmt, now);
        pre.delayTime.setTargetAtTime(((s.params.preDelay ?? 0.15) * 90) / 1000, now, 0.02);
        damp.frequency.setTargetAtTime(900 + (s.params.damp ?? 0.65) * 14000, now, 0.02);
        const dec = 0.4 + (s.params.decay ?? 0.52) * 3.0;
        if (Math.abs(dec - lastDecayBucket) > 0.35) {
          lastDecayBucket = Number(dec.toFixed(1));
          conv.buffer = getImpulseBuffer(ctx, lastDecayBucket);
        }
      };
      break;
    }

    case 'chorus':
    case 'flanger': {
      const isFlange = slot.type === 'flanger';
      const delL = ctx.createDelay(0.1);
      const delR = ctx.createDelay(0.1);
      const fb = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGainL = ctx.createGain();
      const lfoGainR = ctx.createGain();
      const merge = ctx.createChannelMerger(2);
      lfo.type = 'sine';
      lfo.start();
      cleanups.push(() => {
        try {
          lfo.stop();
          lfo.disconnect();
        } catch {
          // ignore
        }
      });

      input.connect(delL);
      input.connect(delR);
      delL.connect(fb);
      fb.connect(delL);
      delL.connect(merge, 0, 0);
      delR.connect(merge, 0, 1);
      merge.connect(wet);
      lfo.connect(lfoGainL);
      lfo.connect(lfoGainR);
      lfoGainL.connect(delL.delayTime);
      lfoGainR.connect(delR.delayTime);

      updater = (s, fxAmt, _bpm, now) => {
        setWetDry(s, fxAmt, now);
        const rate = 0.08 + (s.params.rate ?? 0.24) * (isFlange ? 4.4 : 5.5);
        const depth = (s.params.depth ?? 0.55) * (isFlange ? 0.0022 : 0.0045);
        lfo.frequency.setTargetAtTime(rate, now, 0.02);
        delL.delayTime.setTargetAtTime(isFlange ? 0.0028 : 0.012, now, 0.02);
        delR.delayTime.setTargetAtTime(isFlange ? 0.0033 : 0.017, now, 0.02);
        lfoGainL.gain.setTargetAtTime(depth, now, 0.02);
        lfoGainR.gain.setTargetAtTime(-depth, now, 0.02);
        fb.gain.setTargetAtTime(isFlange ? (s.params.feedback ?? 0.55) * 0.8 : 0.12, now, 0.02);
      };
      break;
    }

    case 'phaser': {
      const stages = [0, 1, 2, 3].map(() => {
        const ap = ctx.createBiquadFilter();
        ap.type = 'allpass';
        ap.frequency.value = 800;
        return ap;
      });
      const fb = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.start();
      cleanups.push(() => {
        try {
          lfo.stop();
          lfo.disconnect();
        } catch {
          // ignore
        }
      });

      input.connect(stages[0]);
      stages[0].connect(stages[1]);
      stages[1].connect(stages[2]);
      stages[2].connect(stages[3]);
      stages[3].connect(wet);
      stages[3].connect(fb);
      fb.connect(stages[0]);
      stages.forEach((st) => lfoGain.connect(st.frequency));
      lfo.connect(lfoGain);

      updater = (s, fxAmt, _bpm, now) => {
        setWetDry(s, fxAmt, now);
        lfo.frequency.setTargetAtTime(0.1 + (s.params.rate ?? 0.28) * 6, now, 0.02);
        lfoGain.gain.setTargetAtTime(180 + (s.params.depth ?? 0.65) * 1600, now, 0.02);
        fb.gain.setTargetAtTime((s.params.feedback ?? 0.45) * 0.72, now, 0.02);
      };
      break;
    }

    case 'autoPan': {
      const panner = ctx.createStereoPanner();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.start();
      cleanups.push(() => {
        try {
          lfo.stop();
          lfo.disconnect();
        } catch {
          // ignore
        }
      });
      input.connect(panner);
      panner.connect(wet);
      lfo.connect(lfoGain);
      lfoGain.connect(panner.pan);
      updater = (s, fxAmt, bpm, now) => {
        setWetDry(s, fxAmt, now);
        const hz = s.sync
          ? 1000 / Math.max(40, syncDivToMs(s.syncDiv, bpm))
          : 0.2 + (s.params.rate ?? 0.32) * 12;
        lfo.frequency.setTargetAtTime(hz, now, 0.02);
        lfoGain.gain.setTargetAtTime(s.params.depth ?? 0.75, now, 0.02);
      };
      break;
    }
  }

  return {
    id: slot.id,
    type: slot.type,
    input,
    output,
    update: updater,
    dispose: () => {
      cleanups.forEach((fn) => fn());
      try {
        input.disconnect();
        dry.disconnect();
        wet.disconnect();
        output.disconnect();
      } catch {
        // ignore
      }
    },
  };
}

export class MixerStripAudioChain {
  private ctx: AudioContext;
  public readonly input: GainNode;
  public readonly output: GainNode;

  private flt1: BiquadFilterNode;
  private flt2: BiquadFilterNode;

  private phaseSplit: ChannelSplitterNode;
  private phaseDelayL: DelayNode;
  private phaseDelayR: DelayNode;
  private phaseMerge: ChannelMergerNode;

  // Native M/S Stereo Width Matrix (0% mono .. 100% normal .. 200% wide)
  private widthSplit: ChannelSplitterNode;
  private widthMerge: ChannelMergerNode;
  private wDirectL: GainNode;
  private wDirectR: GainNode;
  private wCrossLR: GainNode;
  private wCrossRL: GainNode;

  private fxIn: GainNode;
  private fxOut: GainNode;
  private fxHandles: FxNodeHandle[] = [];
  private fxSignature = '';

  private panner: StereoPannerNode;
  private faderGain: GainNode;
  private analyser: AnalyserNode;
  private meterBuf: Float32Array<ArrayBuffer> | null = null;
  private sendGains = new Map<number, { gain: GainNode; target: AudioNode }>();

  constructor(ctx: AudioContext, initialDestination?: AudioNode) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.flt1 = ctx.createBiquadFilter();
    this.flt2 = ctx.createBiquadFilter();
    this.flt1.type = 'allpass';
    this.flt2.type = 'allpass';

    this.phaseSplit = ctx.createChannelSplitter(2);
    this.phaseDelayL = ctx.createDelay(0.02);
    this.phaseDelayR = ctx.createDelay(0.02);
    this.phaseMerge = ctx.createChannelMerger(2);

    this.widthSplit = ctx.createChannelSplitter(2);
    this.widthMerge = ctx.createChannelMerger(2);
    this.wDirectL = ctx.createGain();
    this.wDirectR = ctx.createGain();
    this.wCrossLR = ctx.createGain();
    this.wCrossRL = ctx.createGain();

    this.fxIn = ctx.createGain();
    this.fxOut = ctx.createGain();

    this.panner = ctx.createStereoPanner();
    this.faderGain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.72;

    // Graph wiring
    this.input.connect(this.flt1);
    this.flt1.connect(this.flt2);
    this.flt2.connect(this.phaseSplit);

    this.phaseSplit.connect(this.phaseDelayL, 0);
    this.phaseSplit.connect(this.phaseDelayR, 1);
    this.phaseDelayL.connect(this.phaseMerge, 0, 0);
    this.phaseDelayR.connect(this.phaseMerge, 0, 1);

    this.phaseMerge.connect(this.widthSplit);
    this.widthSplit.connect(this.wDirectL, 0);
    this.widthSplit.connect(this.wDirectR, 1);
    this.widthSplit.connect(this.wCrossLR, 0);
    this.widthSplit.connect(this.wCrossRL, 1);
    this.wDirectL.connect(this.widthMerge, 0, 0);
    this.wCrossRL.connect(this.widthMerge, 0, 0);
    this.wDirectR.connect(this.widthMerge, 0, 1);
    this.wCrossLR.connect(this.widthMerge, 0, 1);

    this.widthMerge.connect(this.fxIn);
    this.fxIn.connect(this.fxOut); // updated dynamically when FX slots exist
    this.fxOut.connect(this.panner);
    this.panner.connect(this.faderGain);
    this.faderGain.connect(this.analyser);
    this.analyser.connect(this.output);
    if (initialDestination) {
      this.output.connect(initialDestination);
    }
  }

  public setSendDestinations(
    targets: { targetIndex: number; node: AudioNode; amount: number }[]
  ) {
    const now = this.ctx.currentTime;
    const nextIndices = new Set(targets.map((t) => t.targetIndex));

    for (const [idx, entry] of this.sendGains.entries()) {
      if (!nextIndices.has(idx)) {
        try {
          this.output.disconnect(entry.gain);
          entry.gain.disconnect();
        } catch {
          // ignore
        }
        this.sendGains.delete(idx);
      }
    }

    for (const t of targets) {
      const clampedAmt = Math.max(0, Math.min(1.5, t.amount));
      const existing = this.sendGains.get(t.targetIndex);
      if (existing && existing.target === t.node) {
        existing.gain.gain.setTargetAtTime(clampedAmt, now, 0.015);
      } else {
        if (existing) {
          try {
            this.output.disconnect(existing.gain);
            existing.gain.disconnect();
          } catch {
            // ignore
          }
        }
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(clampedAmt, now);
        this.output.connect(gain);
        gain.connect(t.node);
        this.sendGains.set(t.targetIndex, { gain, target: t.node });
      }
    }
  }

  public applyState(
    strip: MixerChannelStrip,
    volume: number,
    audible: boolean,
    bpm: number
  ) {
    const now = this.ctx.currentTime;

    // 1. Bipolar Filter (LP / HP / BP, 2-pole or 4-pole, Res)
    const q = 0.5 + Math.max(0, Math.min(1, strip.filterRes)) * 14;
    if (strip.filterMode === 'bp') {
      const hz = 45 * Math.pow(280, Math.max(0, Math.min(1, strip.filterPos)));
      this.flt1.type = 'bandpass';
      this.flt1.frequency.setTargetAtTime(hz, now, 0.015);
      this.flt1.Q.setTargetAtTime(q, now, 0.015);
      if (strip.filterSlope === 4) {
        this.flt2.type = 'bandpass';
        this.flt2.frequency.setTargetAtTime(hz, now, 0.015);
        this.flt2.Q.setTargetAtTime(q * 0.85, now, 0.015);
      } else {
        this.flt2.type = 'allpass';
      }
    } else if (strip.filterPos < 0.48) {
      const t = strip.filterPos / 0.48; // 0..1 (0 = 45Hz, 1 = 19kHz)
      const hz = 45 * Math.pow(420, t);
      this.flt1.type = 'lowpass';
      this.flt1.frequency.setTargetAtTime(hz, now, 0.015);
      this.flt1.Q.setTargetAtTime(q, now, 0.015);
      if (strip.filterSlope === 4) {
        this.flt2.type = 'lowpass';
        this.flt2.frequency.setTargetAtTime(hz, now, 0.015);
        this.flt2.Q.setTargetAtTime(q * 0.75, now, 0.015);
      } else {
        this.flt2.type = 'allpass';
      }
    } else if (strip.filterPos > 0.52) {
      const t = (strip.filterPos - 0.52) / 0.48; // 0..1 (0 = 25Hz, 1 = 12kHz)
      const hz = 25 * Math.pow(480, t);
      this.flt1.type = 'highpass';
      this.flt1.frequency.setTargetAtTime(hz, now, 0.015);
      this.flt1.Q.setTargetAtTime(q, now, 0.015);
      if (strip.filterSlope === 4) {
        this.flt2.type = 'highpass';
        this.flt2.frequency.setTargetAtTime(hz, now, 0.015);
        this.flt2.Q.setTargetAtTime(q * 0.75, now, 0.015);
      } else {
        this.flt2.type = 'allpass';
      }
    } else {
      this.flt1.type = 'allpass';
      this.flt2.type = 'allpass';
    }

    // 2. Microsecond Phase Delay (-1000..+1000 us)
    const us = ((strip.phaseDelayUs ?? 0.5) - 0.5) * 2000;
    this.phaseDelayL.delayTime.setTargetAtTime(us < 0 ? (-us) * 1e-6 : 0, now, 0.012);
    this.phaseDelayR.delayTime.setTargetAtTime(us > 0 ? us * 1e-6 : 0, now, 0.012);

    // 3. Stereo Width (0..200% M/S Matrix)
    const w = Math.max(0, Math.min(2, (strip.stereoWidth ?? 0.5) * 2));
    const directGain = 0.5 * (1 + w);
    const crossGain = 0.5 * (1 - w);
    this.wDirectL.gain.setTargetAtTime(directGain, now, 0.015);
    this.wDirectR.gain.setTargetAtTime(directGain, now, 0.015);
    this.wCrossLR.gain.setTargetAtTime(crossGain, now, 0.015);
    this.wCrossRL.gain.setTargetAtTime(crossGain, now, 0.015);

    // 4. FX Chain Slots
    const sig = strip.fxSlots.map((s) => `${s.id}:${s.type}`).join('|');
    if (sig !== this.fxSignature) {
      this.rebuildFxChain(strip.fxSlots);
      this.fxSignature = sig;
    }
    const fxAmt = Math.max(0, Math.min(1, strip.fxAmount ?? 1));
    strip.fxSlots.forEach((slot, idx) => {
      this.fxHandles[idx]?.update(slot, fxAmt, bpm, now);
    });

    // 5. Pan & Fader + Polarity Invert
    this.panner.pan.setTargetAtTime((strip.pan - 0.5) * 2, now, 0.015);
    const pol = strip.polarityInvert ? -1 : 1;
    this.faderGain.gain.setTargetAtTime(audible ? volume * pol : 0, now, 0.015);
  }

  private rebuildFxChain(slots: MixerFxSlot[]) {
    try {
      this.fxIn.disconnect();
    } catch {
      // ignore
    }
    this.fxHandles.forEach((h) => h.dispose());
    this.fxHandles = [];

    if (slots.length === 0) {
      this.fxIn.connect(this.fxOut);
      return;
    }

    let prev: AudioNode = this.fxIn;
    for (const s of slots) {
      const handle = buildFxNodeHandle(this.ctx, s);
      this.fxHandles.push(handle);
      prev.connect(handle.input);
      prev = handle.output;
    }
    prev.connect(this.fxOut);
  }

  public getPeak(): number {
    if (!this.meterBuf || this.meterBuf.length !== this.analyser.fftSize) {
      this.meterBuf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    }
    this.analyser.getFloatTimeDomainData(this.meterBuf);
    let pk = 0;
    for (let i = 0; i < this.meterBuf.length; i++) {
      const a = Math.abs(this.meterBuf[i]);
      if (a > pk) pk = a;
    }
    return Math.min(1.2, pk);
  }

  public dispose() {
    this.fxHandles.forEach((h) => h.dispose());
    this.fxHandles = [];
    this.sendGains.forEach((entry) => {
      try {
        entry.gain.disconnect();
      } catch {
        // ignore
      }
    });
    this.sendGains.clear();
    try {
      this.input.disconnect();
      this.output.disconnect();
    } catch {
      // ignore
    }
  }
}
