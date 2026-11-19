import {
  AdsrEnvelopeValues,
  AdsrTarget,
  ComponentLfoConfig,
  FilterType,
  NoiseType,
  ThreeXOscOscState,
  ThreeXOscParams,
} from '../types/synth';
import { DEFAULT_COMPONENT_LFO } from './lfoMath';

export type { ThreeXOscOscState, ThreeXOscParams };

export const FILTER_TYPE_OPTIONS: { id: FilterType; label: string; value: number }[] = [
  { id: 'lp2', label: 'LP2', value: 0 },
  { id: 'lp4', label: 'LP4', value: 1 / 6 },
  { id: 'hp2', label: 'HP2', value: 2 / 6 },
  { id: 'hp4', label: 'HP4', value: 3 / 6 },
  { id: 'bp', label: 'BP', value: 4 / 6 },
  { id: 'comb', label: 'COMB', value: 5 / 6 },
  { id: 'kick', label: 'KICK', value: 1 },
];

export const NOISE_TYPE_OPTIONS: { id: NoiseType; label: string; value: number }[] = [
  { id: 'white', label: 'WHITE', value: 0 },
  { id: 'pink', label: 'PINK', value: 1 / 5 },
  { id: 'brown', label: 'BROWN', value: 2 / 5 },
  { id: 'blue', label: 'BLUE', value: 3 / 5 },
  { id: 'velvet', label: 'VELVET', value: 4 / 5 },
  { id: 'metallic', label: '808 MET', value: 1 },
];

export const THREE_X_OSC_WAVE_NAMES = [
  'Sine',
  'Triangle',
  'Square',
  'Saw',
  'Rounded Saw',
  'Noise',
  'Custom',
] as const;

export const DEFAULT_ADSR_ENVELOPES: Record<AdsrTarget, AdsrEnvelopeValues> = {
  amp: {
    attack: 0.015,
    decay: 0.35,
    sustain: 0.72,
    release: 0.25,
    amount: 1.0,
    attackTension: 0,
    decayTension: 0,
    releaseTension: 0,
  },
  pan: {
    attack: 0.04,
    decay: 0.42,
    sustain: 0.5,
    release: 0.3,
    amount: 0.5,
    attackTension: 0,
    decayTension: 0,
    releaseTension: 0,
  },
  filter: {
    attack: 0.02,
    decay: 0.38,
    sustain: 0.35,
    release: 0.28,
    amount: 0.72,
    attackTension: 0,
    decayTension: 0,
    releaseTension: 0,
  },
  res: {
    attack: 0.03,
    decay: 0.32,
    sustain: 0.4,
    release: 0.25,
    amount: 0.5,
    attackTension: 0,
    decayTension: 0,
    releaseTension: 0,
  },
  pitch: {
    attack: 0.01,
    decay: 0.18,
    sustain: 0.0,
    release: 0.15,
    amount: 0.5,
    attackTension: 0,
    decayTension: 0,
    releaseTension: 0,
  },
};

export const DEFAULT_ADSR_LFOS: Record<AdsrTarget, ComponentLfoConfig> = {
  amp: { ...DEFAULT_COMPONENT_LFO },
  pan: { ...DEFAULT_COMPONENT_LFO },
  filter: { ...DEFAULT_COMPONENT_LFO },
  res: { ...DEFAULT_COMPONENT_LFO },
  pitch: { ...DEFAULT_COMPONENT_LFO },
};

export const DEFAULT_3X_OSC_PARAMS: ThreeXOscParams = {
  osc1: {
    wave: 3, // Saw
    invert: false,
    coarse: 0.5, // 0 st
    fine: 0.5,   // 0 ct
    phaseOffset: 0,
    detune: 0.5,
    mix: 1,
  },
  osc2: {
    wave: 3, // Saw
    invert: false,
    coarse: 0.25, // -12 st
    fine: 0.54,   // +8 ct
    phaseOffset: 0.15,
    detune: 0.55,
    mix: 0.55,
  },
  osc3: {
    wave: 0, // Sine
    invert: false,
    coarse: 0.0, // -24 st
    fine: 0.5,
    phaseOffset: 0,
    detune: 0.5,
    mix: 0.4,
  },
  phaseRand: 0,
  amOsc3: false,
  hq: true,
  pan: 0.5,
  ampLevel: 0.85,
  masterPitch: 0.5,
  riserPitch: 0.5,
  phaseDelayUs: 0.5,
  noiseType: 'white',
  transientSnap: 0.0,
  cutoff: 0.82,
  resonance: 0.18,
  filterType: 'lp2',
  bpm: 128,
  envAttack: DEFAULT_ADSR_ENVELOPES.amp.attack,
  envDecay: DEFAULT_ADSR_ENVELOPES.amp.decay,
  envSustain: DEFAULT_ADSR_ENVELOPES.amp.sustain,
  envRelease: DEFAULT_ADSR_ENVELOPES.amp.release,
  envelopes: structuredClone(DEFAULT_ADSR_ENVELOPES),
  adsrLfos: structuredClone(DEFAULT_ADSR_LFOS),
};

export const THREE_X_OSC_WORKLET_CODE = `
const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI * 0.5;
const QUARTER_PI = Math.PI * 0.25;
const SQRT2 = Math.SQRT2;
const CUSTOM_LEN = 2048;
const COMB_LEN = 4096;
const COMB_MASK = COMB_LEN - 1;

function buildCustomCycle() {
  const table = new Float32Array(CUSTOM_LEN);
  for (let i = 0; i < CUSTOM_LEN; i++) {
    const p = i / CUSTOM_LEN;
    const s =
      0.56 * Math.sin(TWO_PI * p) +
      0.28 * Math.sin(TWO_PI * p * 2) +
      0.16 * Math.sin(TWO_PI * p * 3) -
      0.12 * Math.cos(TWO_PI * p * 4);
    table[i] = Math.max(-1, Math.min(1, s));
  }
  return table;
}

function polyBlep(t, dt) {
  if (dt <= 0 || dt >= 0.5) return 0;
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

function evalTension(u, tension) {
  const x = Math.max(0, Math.min(1, u));
  const t = Math.max(-1, Math.min(1, tension || 0));
  if (Math.abs(t) < 0.005) return x;
  if (t > 0) {
    return Math.pow(x, 1 + t * 3.2);
  }
  return 1 - Math.pow(1 - x, 1 + -t * 3.2);
}

const METALLIC_RATIOS = [1.0, 1.483, 1.801, 2.547, 2.634, 3.902];

function evalNoiseSample(noiseType, ns, sr, baseFreq) {
  const w = Math.random() * 2 - 1;
  switch (noiseType) {
    case 'pink': {
      ns.b0 = 0.99765 * ns.b0 + w * 0.099046;
      ns.b1 = 0.96300 * ns.b1 + w * 0.2965164;
      ns.b2 = 0.57000 * ns.b2 + w * 1.0526913;
      const out = (ns.b0 + ns.b1 + ns.b2 + w * 0.1848) * 0.24;
      return Math.max(-1, Math.min(1, out));
    }
    case 'brown': {
      ns.brown = Math.max(-1, Math.min(1, (ns.brown + 0.045 * w) / 1.02));
      return Math.max(-1, Math.min(1, ns.brown * 2.8));
    }
    case 'blue': {
      const diff = (w - ns.prevWhite) * 0.58;
      ns.prevWhite = w;
      return Math.max(-1, Math.min(1, diff));
    }
    case 'velvet': {
      // High-density velvet noise pulses (crisp snare & clap crackle)
      const r = Math.random();
      if (r < 0.085) return 1;
      if (r < 0.17) return -1;
      return 0;
    }
    case 'metallic': {
      // Classic 6-oscillator inharmonic 808/909 metallic cymbal/hat generator
      const fRoot = Math.max(120, Math.min(900, (baseFreq || 220) * 0.92));
      let sum = 0;
      for (let k = 0; k < 6; k++) {
        ns.metPh[k] = (ns.metPh[k] + (fRoot * METALLIC_RATIOS[k]) / sr) % 1;
        sum += ns.metPh[k] < 0.5 ? 1 : -1;
      }
      return (sum / 6) * 0.8 + w * 0.2;
    }
    case 'white':
    default:
      return w;
  }
}

function evalWave(wave, phase, inc, hq, invert, customTable, noiseVal) {
  let y = 0;
  switch (wave) {
    case 0: // Sine
      y = Math.sin(TWO_PI * phase);
      break;
    case 1: // Triangle
      y = 1 - 4 * Math.abs(Math.round(phase - 0.25) - (phase - 0.25));
      break;
    case 2: // Square
      y = phase < 0.5 ? 1 : -1;
      if (hq) {
        y += polyBlep(phase, inc);
        y -= polyBlep((phase + 0.5) % 1, inc);
      }
      break;
    case 3: // Sawtooth
      y = 2 * phase - 1;
      if (hq) {
        y -= polyBlep(phase, inc);
      }
      break;
    case 4: // Rounded Saw
      y = 2 * Math.sin(phase * HALF_PI) - 1;
      if (hq) {
        y -= 0.55 * polyBlep(phase, inc);
      }
      break;
    case 5: // Selected Noise Type (White/Pink/Brown/Blue/Velvet/808 Metallic)
      y = noiseVal;
      break;
    case 6: { // Custom Single-Cycle Table
      const pos = phase * CUSTOM_LEN;
      const idx = Math.floor(pos) & (CUSTOM_LEN - 1);
      const frac = pos - Math.floor(pos);
      const next = (idx + 1) & (CUSTOM_LEN - 1);
      y = customTable[idx] + (customTable[next] - customTable[idx]) * frac;
      break;
    }
    default:
      y = Math.sin(TWO_PI * phase);
  }
  return invert ? -y : y;
}

function readSampleLinear(arr, pos) {
  const len = arr.length;
  if (len === 0) return 0;
  if (pos <= 0) return arr[0];
  if (pos >= len - 1) return arr[len - 1];
  const i0 = Math.floor(pos);
  const frac = pos - i0;
  return arr[i0] + (arr[i0 + 1] - arr[i0]) * frac;
}

function oscFrequencies(baseFreq, osc, masterPitchSemi) {
  const coarseSemi = Math.round((osc.coarse - 0.5) * 48);
  const fineCents = (osc.fine - 0.5) * 200;
  const stereoDetuneCents = (osc.detune - 0.5) * 200;
  const semiCenter = coarseSemi + fineCents / 100 + masterPitchSemi;
  const semiHalf = stereoDetuneCents / 200;
  const freqL = baseFreq * Math.pow(2, (semiCenter - semiHalf) / 12);
  const freqR = baseFreq * Math.pow(2, (semiCenter + semiHalf) / 12);
  return [freqL, freqR];
}

function createEnvState() {
  return { stage: 'attack', progress: 0, releaseStart: 0, level: 0 };
}

function prepareEnvCoeffs(env, sr, fallbackEnv) {
  const a = env ? env.attack : fallbackEnv.attack;
  const d = env ? env.decay : fallbackEnv.decay;
  const s = env ? env.sustain : fallbackEnv.sustain;
  const r = env ? env.release : fallbackEnv.release;
  const attSec = Math.max(0.004, 0.004 + a * 1.1);
  const decSec = Math.max(0.02, 0.03 + d * 1.4);
  const susLvl = Math.max(0.0005, Math.min(1, s));
  const relSec = Math.max(0.015, 0.025 + r * 1.8);
  return {
    attStep: 1 / (attSec * sr),
    decStep: 1 / (decSec * sr),
    susLvl,
    relStep: 1 / (relSec * sr),
    attTension: env && env.attackTension !== undefined ? env.attackTension : 0,
    decTension: env && env.decayTension !== undefined ? env.decayTension : 0,
    relTension: env && env.releaseTension !== undefined ? env.releaseTension : 0,
  };
}

function stepEnv(st, c) {
  if (st.stage === 'attack') {
    st.progress += c.attStep;
    if (st.progress >= 1) {
      st.progress = 0;
      st.level = 1;
      st.stage = 'decay';
    } else {
      st.level = evalTension(st.progress, c.attTension);
    }
  } else if (st.stage === 'decay') {
    st.progress += c.decStep;
    if (st.progress >= 1) {
      st.progress = 1;
      st.level = c.susLvl;
      st.stage = 'sustain';
    } else {
      const shaped = evalTension(st.progress, c.decTension);
      st.level = 1 + (c.susLvl - 1) * shaped;
    }
  } else if (st.stage === 'sustain') {
    st.level = c.susLvl;
  } else if (st.stage === 'release') {
    st.progress += c.relStep;
    if (st.progress >= 1) {
      st.progress = 1;
      st.level = 0;
      st.stage = 'idle';
    } else {
      const shaped = evalTension(st.progress, c.relTension);
      st.level = st.releaseStart * (1 - shaped);
    }
  }
  return st.level;
}

function hashStep(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1;
}

function evalLfoWaveWorklet(wave, totalCycles) {
  const phase = ((totalCycles % 1) + 1) % 1;
  switch (wave) {
    case 'sine':
      return Math.sin(phase * TWO_PI);
    case 'triangle':
      return 1 - 4 * Math.abs(Math.round(phase - 0.25) - (phase - 0.25));
    case 'square':
      return phase < 0.5 ? 1 : -1;
    case 'saw':
      return 1 - 2 * phase;
    case 'rampUp':
      return 2 * phase - 1;
    case 'sampleHold':
      return hashStep(Math.floor(totalCycles));
    case 'smoothRandom': {
      const step = Math.floor(totalCycles);
      const frac = totalCycles - step;
      const sm = frac * frac * (3 - 2 * frac);
      return hashStep(step) + (hashStep(step + 1) - hashStep(step)) * sm;
    }
    case 'expPulse': {
      const p = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
      return Math.pow(p, 2.6) * 2 - 1;
    }
    default:
      return Math.sin(phase * TWO_PI);
  }
}

function syncDivBeats(div) {
  switch (div) {
    case '4/1': return 16;
    case '2/1': return 8;
    case '1/1': return 4;
    case '1/2D': return 3;
    case '1/2': return 2;
    case '1/2T': return 4 / 3;
    case '1/4D': return 1.5;
    case '1/4': return 1;
    case '1/4T': return 2 / 3;
    case '1/8D': return 0.75;
    case '1/8': return 0.5;
    case '1/8T': return 1 / 3;
    case '1/16': return 0.25;
    case '1/16T': return 1 / 6;
    case '1/32': return 0.125;
    default: return 1;
  }
}

function evalLfoForVoice(lfo, voiceElapsed, globalElapsed, bpm) {
  if (!lfo || !lfo.enabled) return 0;
  const signedAmt = ((lfo.amount !== undefined ? lfo.amount : 0.5) - 0.5) * 2;
  if (Math.abs(signedAmt) < 0.005) return 0;
  const elapsed = lfo.global ? globalElapsed : voiceElapsed;
  const delSec = Math.max(0, lfo.predelay || 0) * 1.4;
  if (elapsed < delSec) return 0;
  const activeTime = elapsed - delSec;
  const attSec = Math.max(0.005, (lfo.attack || 0) * 1.6);
  const envMul = Math.min(1, activeTime / attSec);
  const hz = lfo.tempoSync
    ? 1 / ((60 / Math.max(40, Math.min(240, bpm || 120))) * syncDivBeats(lfo.syncDiv))
    : 0.06 * Math.pow(360, Math.max(0, Math.min(1, lfo.speed || 0)));
  const raw = evalLfoWaveWorklet(lfo.wave, activeTime * hz);
  const shaped = Math.sign(raw) * evalTension(Math.abs(raw), lfo.curveTension || 0);
  return shaped * envMul * signedAmt;
}

class ThreeXOscProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.customTable = buildCustomCycle();
    this.voices = [];
    this.scheduledEvents = [];
    this.globalSampleCount = 0;
    this.smoothedRiserSemi = 0;
    this.phaseDelayBufL = new Float32Array(256);
    this.phaseDelayBufR = new Float32Array(256);
    this.phaseDelayWriteIdx = 0;
    this.noiseStateL = { b0: 0, b1: 0, b2: 0, brown: 0, prevWhite: 0, metPh: [0, 0, 0, 0, 0, 0] };
    this.noiseStateR = { b0: 0, b1: 0, b2: 0, brown: 0, prevWhite: 0, metPh: [0.17, 0.31, 0.43, 0.59, 0.71, 0.89] };
    this.sampleLeft = null;
    this.sampleRight = null;
    this.sampleRateSrc = 44100;
    this.sampleId = '';
    this.samplePeak = 1;
    this.lastPlayheadPost = 0;
    this.wasPlayingSample = false;
    this.params = {
      osc1: { wave: 3, invert: false, coarse: 0.5, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 1 },
      osc2: { wave: 3, invert: false, coarse: 0.25, fine: 0.54, phaseOffset: 0.15, detune: 0.55, mix: 0.55 },
      osc3: { wave: 0, invert: false, coarse: 0, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 0.4 },
      phaseRand: 0,
      amOsc3: false,
      hq: true,
      pan: 0.5,
      ampLevel: 0.85,
      masterPitch: 0.5,
      riserPitch: 0.5,
      phaseDelayUs: 0.5,
      noiseType: 'white',
      transientSnap: 0,
      cutoff: 0.82,
      resonance: 0.18,
      filterType: 'lp2',
      bpm: 128,
      envAttack: 0.015,
      envDecay: 0.35,
      envSustain: 0.72,
      envRelease: 0.25,
      envelopes: {
        amp: { attack: 0.015, decay: 0.35, sustain: 0.72, release: 0.25, amount: 1, attackTension: 0, decayTension: 0, releaseTension: 0 },
        pan: { attack: 0.04, decay: 0.42, sustain: 0.5, release: 0.3, amount: 0.5, attackTension: 0, decayTension: 0, releaseTension: 0 },
        filter: { attack: 0.02, decay: 0.38, sustain: 0.35, release: 0.28, amount: 0.72, attackTension: 0, decayTension: 0, releaseTension: 0 },
        res: { attack: 0.03, decay: 0.32, sustain: 0.4, release: 0.25, amount: 0.5, attackTension: 0, decayTension: 0, releaseTension: 0 },
        pitch: { attack: 0.01, decay: 0.18, sustain: 0, release: 0.15, amount: 0.5, attackTension: 0, decayTension: 0, releaseTension: 0 },
      },
      adsrLfos: {},
    };

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (!msg) return;
      const nowSec = typeof currentTime === 'number' ? currentTime : 0;
      if (msg.type === 'params') {
        this.params = msg.params;
      } else if (msg.type === 'setSampleBuffer') {
        const left = msg.left instanceof Float32Array ? msg.left : (msg.left ? new Float32Array(msg.left) : null);
        const right = msg.right instanceof Float32Array ? msg.right : (msg.right ? new Float32Array(msg.right) : left);
        this.sampleLeft = left;
        this.sampleRight = right;
        this.sampleRateSrc = msg.sampleRate || 44100;
        this.sampleId = msg.sampleId || '';
        let pk = 0.01;
        if (left) {
          const stride = Math.max(1, Math.floor(left.length / 8192));
          for (let i = 0; i < left.length; i += stride) {
            const aL = Math.abs(left[i]);
            const aR = right ? Math.abs(right[i]) : aL;
            if (aL > pk) pk = aL;
            if (aR > pk) pk = aR;
          }
        }
        this.samplePeak = Math.max(0.01, pk);
      } else if (msg.type === 'noteOn') {
        if (typeof msg.atTime === 'number' && msg.atTime > nowSec + 0.001) {
          this.enqueueEvent({
            type: 'noteOn',
            note: msg.note,
            velocity: msg.velocity,
            atTime: msg.atTime,
          });
        } else {
          this.triggerNoteOn(msg.note, msg.velocity);
        }
      } else if (msg.type === 'noteOff') {
        if (typeof msg.atTime === 'number' && msg.atTime > nowSec + 0.001) {
          this.enqueueEvent({
            type: 'noteOff',
            note: msg.note,
            immediate: Boolean(msg.immediate),
            atTime: msg.atTime,
          });
        } else {
          this.triggerNoteOff(msg.note, msg.immediate);
        }
      } else if (msg.type === 'allNotesOff') {
        this.scheduledEvents = [];
        this.voices = [];
        if (this.wasPlayingSample) {
          this.wasPlayingSample = false;
          this.port.postMessage({ type: 'samplePlayhead', norm: -1 });
        }
      }
    };
  }

  enqueueEvent(ev) {
    this.scheduledEvents.push(ev);
    if (this.scheduledEvents.length > 512) {
      this.scheduledEvents.splice(0, this.scheduledEvents.length - 512);
    }
    this.scheduledEvents.sort((a, b) => {
      const dt = a.atTime - b.atTime;
      if (Math.abs(dt) > 0.0001) return dt;
      // Ensure noteOff fires before noteOn at identical timestamps
      if (a.type === b.type) return 0;
      return a.type === 'noteOff' ? -1 : 1;
    });
  }

  triggerNoteOn(note, velocity) {
    this.voices = this.voices.filter((v) => v.note !== note);
    if (this.voices.length >= 16) {
      this.voices.shift();
    }
    const pr = Math.max(0, Math.min(1, this.params.phaseRand || 0));
    const r1 = pr > 0 ? Math.random() * pr : 0;
    const r2 = pr > 0 ? Math.random() * pr : 0;
    const r3 = pr > 0 ? Math.random() * pr : 0;

    const sampCfg = this.params.sampler;
    const sampLen = this.sampleLeft ? this.sampleLeft.length : 0;
    const sNorm = sampCfg ? Math.max(0, Math.min(0.99, sampCfg.startNorm || 0)) : 0;
    const eNorm = sampCfg
      ? Math.max(sNorm + 0.005, Math.min(1, sampCfg.endNorm !== undefined ? sampCfg.endNorm : 1))
      : 1;
    const sIdx = sampLen > 1 ? Math.floor(sNorm * (sampLen - 1)) : 0;
    const eIdx = sampLen > 1 ? Math.floor(eNorm * (sampLen - 1)) : 0;
    const isRev = Boolean(sampCfg && sampCfg.reverse);

    this.voices.push({
      note,
      velocity: Math.max(0.05, Math.min(1, velocity || 0.8)),
      baseFreq: 440 * Math.pow(2, (note - 69) / 12),
      sampleAge: 0,
      sampPos: isRev ? eIdx : sIdx,
      sampDir: isRev ? -1 : 1,
      sampDone: false,
      envAmp: createEnvState(),
      envPan: createEnvState(),
      envFilter: createEnvState(),
      envRes: createEnvState(),
      envPitch: createEnvState(),
      ic1eqL: 0,
      ic2eqL: 0,
      ic3eqL: 0,
      ic4eqL: 0,
      ic1eqR: 0,
      ic2eqR: 0,
      ic3eqR: 0,
      ic4eqR: 0,
      kickSample: 0,
      combBufL: new Float32Array(COMB_LEN),
      combBufR: new Float32Array(COMB_LEN),
      combIdx: 0,
      combLpL: 0,
      combLpR: 0,
      p1L: r1 % 1,
      p1R: (r1 + this.params.osc1.phaseOffset) % 1,
      p2L: r2 % 1,
      p2R: (r2 + this.params.osc2.phaseOffset) % 1,
      p3L: r3 % 1,
      p3R: (r3 + this.params.osc3.phaseOffset) % 1,
    });
  }

  triggerNoteOff(note, immediate) {
    const sampCfg = this.params.sampler;
    const isOneShot = Boolean(
      sampCfg &&
        sampCfg.enabled &&
        sampCfg.playMode === 'oneShot' &&
        this.sampleLeft &&
        this.sampleLeft.length > 1
    );
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (v.note === note) {
        if (immediate) {
          this.voices.splice(i, 1);
          i--;
        } else if (!isOneShot || v.sampDone) {
          const envs = [v.envAmp, v.envPan, v.envFilter, v.envRes, v.envPitch];
          for (let j = 0; j < envs.length; j++) {
            envs[j].releaseStart = envs[j].level;
            envs[j].progress = 0;
            envs[j].stage = 'release';
          }
        }
      }
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const outL = output[0];
    const outR = output[1] || output[0];
    const frames = outL.length;

    outL.fill(0);
    if (outR !== outL) outR.fill(0);

    const sr = sampleRate;
    const blockStartTime = typeof currentTime === 'number' ? currentTime : this.globalSampleCount / sr;
    const blockHalfSec = (frames * 0.5) / sr;
    while (
      this.scheduledEvents.length > 0 &&
      this.scheduledEvents[0].atTime <= blockStartTime + blockHalfSec
    ) {
      const ev = this.scheduledEvents.shift();
      if (ev.type === 'noteOff') {
        this.triggerNoteOff(ev.note, ev.immediate);
      } else if (ev.type === 'noteOn') {
        this.triggerNoteOn(ev.note, ev.velocity);
      }
    }

    const blockStartGlobalSec = this.globalSampleCount / sr;
    this.globalSampleCount += frames;

    const p = this.params;
    const sampCfg = p.sampler;
    const useSampler = Boolean(
      sampCfg && sampCfg.enabled && this.sampleLeft && this.sampleLeft.length > 1
    );

    if (this.voices.length === 0) {
      if (this.wasPlayingSample) {
        this.wasPlayingSample = false;
        this.port.postMessage({ type: 'samplePlayhead', norm: -1 });
      }
      return true;
    }

    const fallbackAmp = {
      attack: p.envAttack,
      decay: p.envDecay,
      sustain: p.envSustain,
      release: p.envRelease,
    };
    const envs = p.envelopes || {};
    const lfos = p.adsrLfos || {};
    const bpm = p.bpm || 128;

    const cAmp = prepareEnvCoeffs(envs.amp, sr, fallbackAmp);
    const cPan = prepareEnvCoeffs(envs.pan, sr, fallbackAmp);
    const cFlt = prepareEnvCoeffs(envs.filter, sr, fallbackAmp);
    const cRes = prepareEnvCoeffs(envs.res, sr, fallbackAmp);
    const cPit = prepareEnvCoeffs(envs.pitch, sr, fallbackAmp);

    const ampEnvScale =
      envs.amp && envs.amp.amount !== undefined ? (envs.amp.amount - 0.5) * 2 : 1;
    const panAmt = ((envs.pan && envs.pan.amount !== undefined ? envs.pan.amount : 0.5) - 0.5) * 2;
    const fltAmt = ((envs.filter && envs.filter.amount !== undefined ? envs.filter.amount : 0.5) - 0.5) * 2;
    const resAmt = ((envs.res && envs.res.amount !== undefined ? envs.res.amount : 0.5) - 0.5) * 2;
    const pitAmt = ((envs.pitch && envs.pitch.amount !== undefined ? envs.pitch.amount : 0.5) - 0.5) * 2;

    const basePan = ((p.pan !== undefined ? p.pan : 0.5) - 0.5) * 2;
    const ampScale = Math.max(0, Math.min(1, p.ampLevel !== undefined ? p.ampLevel : 0.85));
    const baseMasterSemi = ((p.masterPitch !== undefined ? p.masterPitch : 0.5) - 0.5) * 48;
    const targetRiserSemi = ((p.riserPitch !== undefined ? p.riserPitch : 0.5) - 0.5) * 96; // +-48 st for risers
    const baseCutoff = Math.max(0, Math.min(1, p.cutoff !== undefined ? p.cutoff : 0.82));
    const baseRes = Math.max(0, Math.min(1, p.resonance !== undefined ? p.resonance : 0.18));
    const filterType = p.filterType || 'lp2';
    const noiseType = p.noiseType || 'white';
    const transientSnap = Math.max(0, Math.min(1, p.transientSnap !== undefined ? p.transientSnap : 0));

    const o1 = p.osc1;
    const o2 = p.osc2;
    const o3 = p.osc3;
    const hasNoiseOsc = o1.wave === 5 || o2.wave === 5 || o3.wave === 5;
    const mix2 = Math.max(0, Math.min(1, o2.mix));
    const mix3 = Math.max(0, Math.min(1, o3.mix));
    const normAdd = 1 + mix2 + mix3;
    const norm12 = 1 + mix2;
    const hq = Boolean(p.hq);
    const am = Boolean(p.amOsc3);

    // Precompute Sampler bounds
    const sArrL = this.sampleLeft;
    const sArrR = this.sampleRight || this.sampleLeft;
    const sLen = sArrL ? sArrL.length : 0;
    const sStartNorm = sampCfg ? Math.max(0, Math.min(0.99, sampCfg.startNorm || 0)) : 0;
    const sEndNorm = sampCfg
      ? Math.max(sStartNorm + 0.005, Math.min(1, sampCfg.endNorm !== undefined ? sampCfg.endNorm : 1))
      : 1;
    const sStartIdx = sLen > 1 ? Math.floor(sStartNorm * (sLen - 1)) : 0;
    const sEndIdx = sLen > 1 ? Math.floor(sEndNorm * (sLen - 1)) : 1;
    const sSpan = Math.max(2, sEndIdx - sStartIdx);
    const sLoopStartNorm = sampCfg
      ? Math.max(sStartNorm, Math.min(sEndNorm - 0.004, sampCfg.loopStartNorm !== undefined ? sampCfg.loopStartNorm : sStartNorm))
      : 0;
    const sLoopEndNorm = sampCfg
      ? Math.max(sLoopStartNorm + 0.004, Math.min(sEndNorm, sampCfg.loopEndNorm !== undefined ? sampCfg.loopEndNorm : sEndNorm))
      : 1;
    const sLoopStartIdx = sLen > 1 ? Math.floor(sLoopStartNorm * (sLen - 1)) : 0;
    const sLoopEndIdx = sLen > 1 ? Math.floor(sLoopEndNorm * (sLen - 1)) : 1;
    const sLoopLen = Math.max(2, sLoopEndIdx - sLoopStartIdx);
    const sXfadeSamples = sampCfg ? Math.min(sLoopLen * 0.45, Math.max(0, (sampCfg.crossfadeNorm || 0) * sLoopLen)) : 0;
    const sFadeIn = sampCfg ? Math.max(0, Math.min(0.45, sampCfg.fadeInNorm || 0)) : 0;
    const sFadeOut = sampCfg ? Math.max(0, Math.min(0.45, sampCfg.fadeOutNorm || 0)) : 0;
    const sGain = sampCfg
      ? Math.max(0, Math.min(3, (sampCfg.gain !== undefined ? sampCfg.gain : 1) * (sampCfg.normalize ? 0.94 / this.samplePeak : 1)))
      : 1;
    const sMode = sampCfg ? sampCfg.playMode || 'oneShot' : 'oneShot';
    const sPitchTrack = sampCfg ? sampCfg.pitchTrack !== false : true;
    const sRootMidi = sampCfg && sampCfg.rootMidi !== undefined ? sampCfg.rootMidi : 60;
    const sTuneSemi = sampCfg ? (sampCfg.tuneSemi || 0) + (sampCfg.fineCents || 0) / 100 : 0;
    const sLayerOscs = Boolean(sampCfg && sampCfg.layerOscs);

    for (let vIdx = this.voices.length - 1; vIdx >= 0; vIdx--) {
      const v = this.voices[vIdx];
      const gain = v.velocity * ampScale * 0.48;
      const voiceSec = v.sampleAge / sr;
      const lfoAmpMod = evalLfoForVoice(lfos.amp, voiceSec, blockStartGlobalSec, bpm);
      const lfoPanMod = evalLfoForVoice(lfos.pan, voiceSec, blockStartGlobalSec, bpm);
      const lfoFltMod = evalLfoForVoice(lfos.filter, voiceSec, blockStartGlobalSec, bpm);
      const lfoResMod = evalLfoForVoice(lfos.res, voiceSec, blockStartGlobalSec, bpm);
      const lfoPitMod = evalLfoForVoice(lfos.pitch, voiceSec, blockStartGlobalSec, bpm);
      const voiceStartAge = v.sampleAge;
      v.sampleAge += frames;

      for (let i = 0; i < frames; i++) {
        const lvlAmp = stepEnv(v.envAmp, cAmp);
        if (v.envAmp.stage === 'idle') break;

        const lvlPan = stepEnv(v.envPan, cPan);
        const lvlFlt = stepEnv(v.envFilter, cFlt);
        const lvlRes = stepEnv(v.envRes, cRes);
        const lvlPit = stepEnv(v.envPitch, cPit);

        this.smoothedRiserSemi += (targetRiserSemi - this.smoothedRiserSemi) * 0.002;
        const totalPitchSemi =
          baseMasterSemi + this.smoothedRiserSemi + (lvlPit * pitAmt + lfoPitMod) * 24;
        const [f1L, f1R] = oscFrequencies(v.baseFreq, o1, totalPitchSemi);
        const [f2L, f2R] = oscFrequencies(v.baseFreq, o2, totalPitchSemi);
        const [f3L, f3R] = oscFrequencies(v.baseFreq, o3, totalPitchSemi);

        const i1L = Math.min(0.45, f1L / sr);
        const i1R = Math.min(0.45, f1R / sr);
        const i2L = Math.min(0.45, f2L / sr);
        const i2R = Math.min(0.45, f2R / sr);
        const i3L = Math.min(0.45, f3L / sr);
        const i3R = Math.min(0.45, f3R / sr);

        let sampleL = 0;
        let sampleR = 0;

        if (useSampler && sArrL) {
          let sL = 0;
          let sR = 0;
          if (!v.sampDone) {
            sL = readSampleLinear(sArrL, v.sampPos);
            sR = readSampleLinear(sArrR, v.sampPos);

            // Loop crossfade blend for smooth sustained loops
            if (sMode === 'loop' && sXfadeSamples > 4) {
              if (v.sampDir > 0) {
                const distToEnd = sLoopEndIdx - v.sampPos;
                if (distToEnd >= 0 && distToEnd < sXfadeSamples) {
                  const xf = 1 - distToEnd / sXfadeSamples;
                  const wrapPos = Math.max(sStartIdx, sLoopStartIdx - distToEnd);
                  sL = sL * (1 - xf) + readSampleLinear(sArrL, wrapPos) * xf;
                  sR = sR * (1 - xf) + readSampleLinear(sArrR, wrapPos) * xf;
                }
              } else {
                const distToStart = v.sampPos - sLoopStartIdx;
                if (distToStart >= 0 && distToStart < sXfadeSamples) {
                  const xf = 1 - distToStart / sXfadeSamples;
                  const wrapPos = Math.min(sEndIdx, sLoopEndIdx + distToStart);
                  sL = sL * (1 - xf) + readSampleLinear(sArrL, wrapPos) * xf;
                  sR = sR * (1 - xf) + readSampleLinear(sArrR, wrapPos) * xf;
                }
              }
            }

            // Region edge fades
            const rel = Math.max(0, Math.min(1, (v.sampPos - sStartIdx) / sSpan));
            const dirRel = v.sampDir < 0 ? 1 - rel : rel;
            let fadeMul = 1;
            if (sFadeIn > 0.002 && dirRel < sFadeIn) {
              fadeMul *= dirRel / sFadeIn;
            }
            if (sMode !== 'loop' && sMode !== 'pingPong' && sFadeOut > 0.002 && (1 - dirRel) < sFadeOut) {
              fadeMul *= Math.max(0, (1 - dirRel) / sFadeOut);
            }
            sL *= fadeMul * sGain;
            sR *= fadeMul * sGain;

            const pitchSemiSamp =
              (sPitchTrack ? v.note - sRootMidi : 0) + totalPitchSemi + sTuneSemi;
            const rate = Math.max(
              0.04,
              Math.min(16, (this.sampleRateSrc / sr) * Math.pow(2, pitchSemiSamp / 12))
            );
            v.sampPos += v.sampDir * rate;

            if (sMode === 'loop') {
              if (v.sampDir > 0 && v.sampPos >= sLoopEndIdx) {
                v.sampPos = sLoopStartIdx + ((v.sampPos - sLoopEndIdx) % sLoopLen);
              } else if (v.sampDir < 0 && v.sampPos <= sLoopStartIdx) {
                v.sampPos = sLoopEndIdx - ((sLoopStartIdx - v.sampPos) % sLoopLen);
              }
            } else if (sMode === 'pingPong') {
              if (v.sampDir > 0 && v.sampPos >= sLoopEndIdx) {
                v.sampPos = sLoopEndIdx - (v.sampPos - sLoopEndIdx);
                v.sampDir = -1;
              } else if (v.sampDir < 0 && v.sampPos <= sLoopStartIdx) {
                v.sampPos = sLoopStartIdx + (sLoopStartIdx - v.sampPos);
                v.sampDir = 1;
              }
            } else {
              if (v.sampDir > 0 && v.sampPos >= sEndIdx) {
                v.sampDone = true;
                v.sampPos = sEndIdx;
              } else if (v.sampDir < 0 && v.sampPos <= sStartIdx) {
                v.sampDone = true;
                v.sampPos = sStartIdx;
              }
            }
          } else if (sMode === 'oneShot' && v.envAmp.stage !== 'release') {
            v.envAmp.releaseStart = v.envAmp.level;
            v.envAmp.progress = 0;
            v.envAmp.stage = 'release';
          }

          if (sLayerOscs) {
            const nL = hasNoiseOsc ? evalNoiseSample(noiseType, this.noiseStateL, sr, f1L) : 0;
            const nR = hasNoiseOsc ? evalNoiseSample(noiseType, this.noiseStateR, sr, f1R) : 0;
            const s2L = evalWave(o2.wave, v.p2L, i2L, hq, o2.invert, this.customTable, nL);
            const s2R = evalWave(o2.wave, v.p2R, i2R, hq, o2.invert, this.customTable, nR);
            const s3L = evalWave(o3.wave, v.p3L, i3L, hq, o3.invert, this.customTable, nL);
            const s3R = evalWave(o3.wave, v.p3R, i3R, hq, o3.invert, this.customTable, nR);
            sampleL = (sL + s2L * mix2 + s3L * mix3) / normAdd;
            sampleR = (sR + s2R * mix2 + s3R * mix3) / normAdd;
          } else {
            sampleL = sL;
            sampleR = sR;
          }
        } else {
          const nL = hasNoiseOsc ? evalNoiseSample(noiseType, this.noiseStateL, sr, f1L) : 0;
          const nR = hasNoiseOsc ? evalNoiseSample(noiseType, this.noiseStateR, sr, f1R) : 0;

          const s1L = evalWave(o1.wave, v.p1L, i1L, hq, o1.invert, this.customTable, nL);
          const s1R = evalWave(o1.wave, v.p1R, i1R, hq, o1.invert, this.customTable, nR);
          const s2L = evalWave(o2.wave, v.p2L, i2L, hq, o2.invert, this.customTable, nL);
          const s2R = evalWave(o2.wave, v.p2R, i2R, hq, o2.invert, this.customTable, nR);
          const s3L = evalWave(o3.wave, v.p3L, i3L, hq, o3.invert, this.customTable, nL);
          const s3R = evalWave(o3.wave, v.p3R, i3R, hq, o3.invert, this.customTable, nR);

          if (am) {
            const baseL = (s1L + s2L * mix2) / norm12;
            const baseR = (s1R + s2R * mix2) / norm12;
            const modL = (1 - mix3) + mix3 * (0.5 + 0.5 * s3L);
            const modR = (1 - mix3) + mix3 * (0.5 + 0.5 * s3R);
            sampleL = baseL * modL;
            sampleR = baseR * modR;
          } else {
            sampleL = (s1L + s2L * mix2 + s3L * mix3) / normAdd;
            sampleR = (s1R + s2R * mix2 + s3R * mix3) / normAdd;
          }
        }

        if (transientSnap > 0.005) {
          const age = voiceStartAge + i;
          if (age < 260) {
            const snapEnv = 1 - age / 260;
            const snapClick =
              Math.sin((age / 260) * TWO_PI * 3.5) * snapEnv * snapEnv * transientSnap * 0.85;
            sampleL += snapClick;
            sampleR += snapClick;
          }
        }

        const normCut = Math.max(0.01, Math.min(1, baseCutoff + (lvlFlt * fltAmt + lfoFltMod) * 0.75));
        const normRes = Math.max(0, Math.min(1, baseRes + (lvlRes * resAmt + lfoResMod) * 0.72));
        const cutoffHz = Math.min(sr * 0.42, 24 * Math.pow(760, normCut));
        const g = Math.tan(Math.PI * cutoffHz / sr);

        let filtL = sampleL;
        let filtR = sampleR;

        if (filterType === 'kick') {
          // Self-oscillating resonant kick filter with zero-DC transient exciter & analog OTA saturation
          let ping = 0;
          if (v.kickSample < 28) {
            const kp = v.kickSample / 28;
            ping = Math.sin(kp * TWO_PI) * (1 - kp) * (0.28 + 0.72 * normRes);
            v.kickSample++;
          }
          const inL = sampleL * 0.75 + ping;
          const inR = sampleR * 0.75 + ping;
          const k =
            normRes <= 0.62
              ? 2.0 - (normRes / 0.62) * 1.92
              : 0.08 - ((normRes - 0.62) / 0.38) * 0.14;
          const a1 = 1 / (1 + g * (g + k));
          const a2 = g * a1;
          const a3 = g * a2;

          const v3L = inL - v.ic2eqL;
          const v1L = a1 * v.ic1eqL + a2 * v3L;
          const v2L = v.ic2eqL + a2 * v.ic1eqL + a3 * v3L;
          v.ic1eqL = Math.tanh((2 * v1L - v.ic1eqL) * 0.82) / 0.82;
          v.ic2eqL = Math.tanh((2 * v2L - v.ic2eqL) * 0.82) / 0.82;

          const v3R = inR - v.ic2eqR;
          const v1R = a1 * v.ic1eqR + a2 * v3R;
          const v2R = v.ic2eqR + a2 * v.ic1eqR + a3 * v3R;
          v.ic1eqR = Math.tanh((2 * v1R - v.ic1eqR) * 0.82) / 0.82;
          v.ic2eqR = Math.tanh((2 * v2R - v.ic2eqR) * 0.82) / 0.82;

          filtL = Math.tanh(v2L * 1.15);
          filtR = Math.tanh(v2R * 1.15);
        } else if (filterType === 'lp4') {
          // 24 dB/oct 4-pole cascaded Cytomic SVF Lowpass
          const k = 2 - 1.76 * normRes;
          const a1 = 1 / (1 + g * (g + k));
          const a2 = g * a1;
          const a3 = g * a2;

          const v3L1 = sampleL - v.ic2eqL;
          const v1L1 = a1 * v.ic1eqL + a2 * v3L1;
          const v2L1 = v.ic2eqL + a2 * v.ic1eqL + a3 * v3L1;
          v.ic1eqL = 2 * v1L1 - v.ic1eqL;
          v.ic2eqL = 2 * v2L1 - v.ic2eqL;
          const s1OutL = normRes > 0.6 ? Math.tanh(v2L1 * 0.92) / 0.92 : v2L1;
          const v3L2 = s1OutL - v.ic4eqL;
          const v1L2 = a1 * v.ic3eqL + a2 * v3L2;
          const v2L2 = v.ic4eqL + a2 * v.ic3eqL + a3 * v3L2;
          v.ic3eqL = 2 * v1L2 - v.ic3eqL;
          v.ic4eqL = 2 * v2L2 - v.ic4eqL;

          const v3R1 = sampleR - v.ic2eqR;
          const v1R1 = a1 * v.ic1eqR + a2 * v3R1;
          const v2R1 = v.ic2eqR + a2 * v.ic1eqR + a3 * v3R1;
          v.ic1eqR = 2 * v1R1 - v.ic1eqR;
          v.ic2eqR = 2 * v2R1 - v.ic2eqR;
          const s1OutR = normRes > 0.6 ? Math.tanh(v2R1 * 0.92) / 0.92 : v2R1;
          const v3R2 = s1OutR - v.ic4eqR;
          const v1R2 = a1 * v.ic3eqR + a2 * v3R2;
          const v2R2 = v.ic4eqR + a2 * v.ic3eqR + a3 * v3R2;
          v.ic3eqR = 2 * v1R2 - v.ic3eqR;
          v.ic4eqR = 2 * v2R2 - v.ic4eqR;

          filtL = v2L2;
          filtR = v2R2;
        } else if (filterType === 'hp2') {
          // 12 dB/oct 2-pole Cytomic SVF Highpass
          const k = 2 - 1.94 * normRes;
          const a1 = 1 / (1 + g * (g + k));
          const a2 = g * a1;
          const a3 = g * a2;

          const v3L = sampleL - v.ic2eqL;
          const v1L = a1 * v.ic1eqL + a2 * v3L;
          const v2L = v.ic2eqL + a2 * v.ic1eqL + a3 * v3L;
          v.ic1eqL = 2 * v1L - v.ic1eqL;
          v.ic2eqL = 2 * v2L - v.ic2eqL;

          const v3R = sampleR - v.ic2eqR;
          const v1R = a1 * v.ic1eqR + a2 * v3R;
          const v2R = v.ic2eqR + a2 * v.ic1eqR + a3 * v3R;
          v.ic1eqR = 2 * v1R - v.ic1eqR;
          v.ic2eqR = 2 * v2R - v.ic2eqR;

          filtL = sampleL - k * v1L - v2L;
          filtR = sampleR - k * v1R - v2R;
        } else if (filterType === 'hp4') {
          // 24 dB/oct 4-pole cascaded Cytomic SVF Highpass
          const k = 2 - 1.76 * normRes;
          const a1 = 1 / (1 + g * (g + k));
          const a2 = g * a1;
          const a3 = g * a2;

          const v3L1 = sampleL - v.ic2eqL;
          const v1L1 = a1 * v.ic1eqL + a2 * v3L1;
          const v2L1 = v.ic2eqL + a2 * v.ic1eqL + a3 * v3L1;
          v.ic1eqL = 2 * v1L1 - v.ic1eqL;
          v.ic2eqL = 2 * v2L1 - v.ic2eqL;
          const hp1L = sampleL - k * v1L1 - v2L1;
          const v3L2 = hp1L - v.ic4eqL;
          const v1L2 = a1 * v.ic3eqL + a2 * v3L2;
          const v2L2 = v.ic4eqL + a2 * v.ic3eqL + a3 * v3L2;
          v.ic3eqL = 2 * v1L2 - v.ic3eqL;
          v.ic4eqL = 2 * v2L2 - v.ic4eqL;

          const v3R1 = sampleR - v.ic2eqR;
          const v1R1 = a1 * v.ic1eqR + a2 * v3R1;
          const v2R1 = v.ic2eqR + a2 * v.ic1eqR + a3 * v3R1;
          v.ic1eqR = 2 * v1R1 - v.ic1eqR;
          v.ic2eqR = 2 * v2R1 - v.ic2eqR;
          const hp1R = sampleR - k * v1R1 - v2R1;
          const v3R2 = hp1R - v.ic4eqR;
          const v1R2 = a1 * v.ic3eqR + a2 * v3R2;
          const v2R2 = v.ic4eqR + a2 * v.ic3eqR + a3 * v3R2;
          v.ic3eqR = 2 * v1R2 - v.ic3eqR;
          v.ic4eqR = 2 * v2R2 - v.ic4eqR;

          filtL = hp1L - k * v1L2 - v2L2;
          filtR = hp1R - k * v1R2 - v2R2;
        } else if (filterType === 'bp') {
          // 12 dB/oct Cytomic SVF Bandpass
          const k = 2 - 1.92 * normRes;
          const a1 = 1 / (1 + g * (g + k));
          const a2 = g * a1;
          const a3 = g * a2;

          const v3L = sampleL - v.ic2eqL;
          const v1L = a1 * v.ic1eqL + a2 * v3L;
          const v2L = v.ic2eqL + a2 * v.ic1eqL + a3 * v3L;
          v.ic1eqL = 2 * v1L - v.ic1eqL;
          v.ic2eqL = 2 * v2L - v.ic2eqL;

          const v3R = sampleR - v.ic2eqR;
          const v1R = a1 * v.ic1eqR + a2 * v3R;
          const v2R = v.ic2eqR + a2 * v.ic1eqR + a3 * v3R;
          v.ic1eqR = 2 * v1R - v.ic1eqR;
          v.ic2eqR = 2 * v2R - v.ic2eqR;

          const bpGain = 0.95 + 0.55 * normRes;
          filtL = Math.tanh(v1L * bpGain);
          filtR = Math.tanh(v1R * bpGain);
        } else if (filterType === 'comb') {
          // Dynamic fractional-delay feedback Comb filter driven by cutoffHz & resonance
          const delaySamples = Math.max(2, Math.min(COMB_LEN - 3, sr / cutoffHz));
          const intD = Math.floor(delaySamples);
          const fracD = delaySamples - intD;
          const idx0 = (v.combIdx - intD) & COMB_MASK;
          const idx1 = (v.combIdx - intD - 1) & COMB_MASK;

          const delL = v.combBufL[idx0] + (v.combBufL[idx1] - v.combBufL[idx0]) * fracD;
          const delR = v.combBufR[idx0] + (v.combBufR[idx1] - v.combBufR[idx0]) * fracD;

          v.combLpL = v.combLpL * 0.32 + delL * 0.68;
          v.combLpR = v.combLpR * 0.32 + delR * 0.68;

          const fb = 0.08 + normRes * 0.89;
          const yL = Math.tanh(sampleL + fb * v.combLpL);
          const yR = Math.tanh(sampleR + fb * v.combLpR);

          v.combBufL[v.combIdx] = yL;
          v.combBufR[v.combIdx] = yR;
          v.combIdx = (v.combIdx + 1) & COMB_MASK;

          const outScale = 0.82 / (1 + 0.38 * normRes);
          filtL = yL * outScale;
          filtR = yR * outScale;
        } else {
          // Default 'lp2': 12 dB/oct 2-pole Cytomic SVF Lowpass
          const k = 2 - 1.94 * normRes;
          const a1 = 1 / (1 + g * (g + k));
          const a2 = g * a1;
          const a3 = g * a2;

          const v3L = sampleL - v.ic2eqL;
          const v1L = a1 * v.ic1eqL + a2 * v3L;
          const v2L = v.ic2eqL + a2 * v.ic1eqL + a3 * v3L;
          v.ic1eqL = 2 * v1L - v.ic1eqL;
          v.ic2eqL = 2 * v2L - v.ic2eqL;

          const v3R = sampleR - v.ic2eqR;
          const v1R = a1 * v.ic1eqR + a2 * v3R;
          const v2R = v.ic2eqR + a2 * v.ic1eqR + a3 * v3R;
          v.ic1eqR = 2 * v1R - v.ic1eqR;
          v.ic2eqR = 2 * v2R - v.ic2eqR;

          filtL = v2L;
          filtR = v2R;
        }

        const panPos = Math.max(-1, Math.min(1, basePan + lvlPan * panAmt + lfoPanMod));
        const panAngle = (panPos + 1) * QUARTER_PI;
        const panGainL = Math.cos(panAngle) * SQRT2;
        const panGainR = Math.sin(panAngle) * SQRT2;

        const ampMod = Math.max(0, Math.min(1.5, Math.abs(ampEnvScale) + lfoAmpMod * 0.5));
        const envAmp = lvlAmp * ampMod * gain * (ampEnvScale < 0 ? -1 : 1);
        outL[i] += filtL * envAmp * panGainL;
        outR[i] += filtR * envAmp * panGainR;

        v.p1L = (v.p1L + i1L) % 1;
        v.p1R = (v.p1R + i1R) % 1;
        v.p2L = (v.p2L + i2L) % 1;
        v.p2R = (v.p2R + i2R) % 1;
        v.p3L = (v.p3L + i3L) % 1;
        v.p3R = (v.p3R + i3R) % 1;
      }

      if (v.envAmp.stage === 'idle') {
        this.voices.splice(vIdx, 1);
      }
    }

    // Apply microsecond stereo phase delay (-1000..+1000 us) via fractional linear interpolation
    const phaseUs = ((p.phaseDelayUs !== undefined ? p.phaseDelayUs : 0.5) - 0.5) * 2000;
    if (Math.abs(phaseUs) > 1) {
      const delaySamplesL = phaseUs < 0 ? Math.min(250, (-phaseUs * 1e-6) * sr) : 0;
      const delaySamplesR = phaseUs > 0 ? Math.min(250, (phaseUs * 1e-6) * sr) : 0;
      const intL = Math.floor(delaySamplesL);
      const fracL = delaySamplesL - intL;
      const intR = Math.floor(delaySamplesR);
      const fracR = delaySamplesR - intR;

      for (let i = 0; i < frames; i++) {
        const wIdx = this.phaseDelayWriteIdx;
        this.phaseDelayBufL[wIdx] = outL[i];
        this.phaseDelayBufR[wIdx] = outR[i];

        if (delaySamplesL > 0) {
          const r0 = (wIdx - intL) & 255;
          const r1 = (wIdx - intL - 1) & 255;
          outL[i] = this.phaseDelayBufL[r0] + (this.phaseDelayBufL[r1] - this.phaseDelayBufL[r0]) * fracL;
        }
        if (delaySamplesR > 0) {
          const r0 = (wIdx - intR) & 255;
          const r1 = (wIdx - intR - 1) & 255;
          outR[i] = this.phaseDelayBufR[r0] + (this.phaseDelayBufR[r1] - this.phaseDelayBufR[r0]) * fracR;
        }
        this.phaseDelayWriteIdx = (wIdx + 1) & 255;
      }
    }

    if (useSampler && sLen > 1) {
      if (this.voices.length > 0) {
        this.wasPlayingSample = true;
        if (blockStartGlobalSec - this.lastPlayheadPost >= 0.032) {
          this.lastPlayheadPost = blockStartGlobalSec;
          const leadVoice = this.voices[this.voices.length - 1];
          this.port.postMessage({
            type: 'samplePlayhead',
            norm: Math.max(0, Math.min(1, leadVoice.sampPos / (sLen - 1))),
          });
        }
      } else if (this.wasPlayingSample) {
        this.wasPlayingSample = false;
        this.port.postMessage({ type: 'samplePlayhead', norm: -1 });
      }
    }

    return true;
  }
}

registerProcessor('three-x-osc-processor', ThreeXOscProcessor);
`;
