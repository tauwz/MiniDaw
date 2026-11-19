import { SamplerConfig } from '../types/synth';

export interface DecodedSampleAsset {
  id: string;
  name: string;
  sampleRate: number;
  durationSec: number;
  left: Float32Array;
  right: Float32Array;
  peaksMin: Float32Array;
  peaksMax: Float32Array;
  isBuiltIn?: boolean;
}

export const BUILTIN_SAMPLE_META: {
  id: string;
  name: string;
  rootMidi: number;
  pitchTrack: boolean;
  defaultMode: SamplerConfig['playMode'];
}[] = [
  {
    id: 'builtin-808-kick',
    name: '808 Sub Kick.wav',
    rootMidi: 36,
    pitchTrack: true,
    defaultMode: 'oneShot',
  },
  {
    id: 'builtin-crisp-snare',
    name: 'Studio Snare.wav',
    rootMidi: 60,
    pitchTrack: false,
    defaultMode: 'oneShot',
  },
  {
    id: 'builtin-warm-chord',
    name: 'Warm Pad Tone.wav',
    rootMidi: 60,
    pitchTrack: true,
    defaultMode: 'loop',
  },
  {
    id: 'builtin-pluck-bell',
    name: 'Glass Pluck.wav',
    rootMidi: 60,
    pitchTrack: true,
    defaultMode: 'sustain',
  },
];

const PEAK_BUCKETS = 640;

function computeWavePeaks(
  left: Float32Array,
  right: Float32Array
): { peaksMin: Float32Array; peaksMax: Float32Array } {
  const len = left.length;
  const peaksMin = new Float32Array(PEAK_BUCKETS);
  const peaksMax = new Float32Array(PEAK_BUCKETS);
  if (len === 0) return { peaksMin, peaksMax };

  for (let b = 0; b < PEAK_BUCKETS; b++) {
    const start = Math.floor((b / PEAK_BUCKETS) * len);
    const end = Math.max(start + 1, Math.floor(((b + 1) / PEAK_BUCKETS) * len));
    let mn = 1;
    let mx = -1;
    const step = Math.max(1, Math.floor((end - start) / 64));
    for (let i = start; i < end; i += step) {
      const s = (left[i] + (right[i] ?? left[i])) * 0.5;
      if (s < mn) mn = s;
      if (s > mx) mx = s;
    }
    peaksMin[b] = mn;
    peaksMax[b] = mx;
  }
  return { peaksMin, peaksMax };
}

function synthesizeBuiltInSample(id: string): DecodedSampleAsset {
  const sr = 44100;
  if (id === 'builtin-crisp-snare') {
    const dur = 0.42;
    const len = Math.floor(sr * dur);
    const left = new Float32Array(len);
    const right = new Float32Array(len);
    let lpL = 0;
    let lpR = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const bodyEnv = Math.exp(-t * 28);
      const body = Math.sin(2 * Math.PI * (185 + 95 * Math.exp(-t * 60)) * t) * bodyEnv * 0.65;
      const noiseEnv = Math.exp(-t * 14);
      const wL = Math.random() * 2 - 1;
      const wR = Math.random() * 2 - 1;
      lpL = lpL * 0.3 + wL * 0.7;
      lpR = lpR * 0.3 + wR * 0.7;
      const snap = Math.exp(-t * 180) * (Math.random() * 2 - 1) * 0.55;
      left[i] = Math.tanh((body + lpL * noiseEnv * 0.75 + snap) * 1.15);
      right[i] = Math.tanh((body + lpR * noiseEnv * 0.75 + snap) * 1.15);
    }
    const { peaksMin, peaksMax } = computeWavePeaks(left, right);
    return {
      id,
      name: 'Studio Snare.wav',
      sampleRate: sr,
      durationSec: dur,
      left,
      right,
      peaksMin,
      peaksMax,
      isBuiltIn: true,
    };
  }

  if (id === 'builtin-warm-chord') {
    const dur = 1.6;
    const len = Math.floor(sr * dur);
    const left = new Float32Array(len);
    const right = new Float32Array(len);
    const baseHz = 261.6256; // C4
    const ratios = [1, 1.498, 2.0, 2.996];
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.015) * Math.min(1, (dur - t) / 0.04);
      let sL = 0;
      let sR = 0;
      for (let r = 0; r < ratios.length; r++) {
        const fL = baseHz * ratios[r] * (1 - 0.002 * (r % 2 === 0 ? 1 : -1));
        const fR = baseHz * ratios[r] * (1 + 0.002 * (r % 2 === 0 ? 1 : -1));
        const amp = 0.36 / (1 + r * 0.55);
        sL += Math.sin(2 * Math.PI * fL * t) * amp;
        sR += Math.sin(2 * Math.PI * fR * t) * amp;
      }
      left[i] = Math.tanh(sL * env);
      right[i] = Math.tanh(sR * env);
    }
    const { peaksMin, peaksMax } = computeWavePeaks(left, right);
    return {
      id,
      name: 'Warm Pad Tone.wav',
      sampleRate: sr,
      durationSec: dur,
      left,
      right,
      peaksMin,
      peaksMax,
      isBuiltIn: true,
    };
  }

  if (id === 'builtin-pluck-bell') {
    const dur = 1.1;
    const len = Math.floor(sr * dur);
    const left = new Float32Array(len);
    const right = new Float32Array(len);
    const baseHz = 261.6256; // C4
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const atk = Math.min(1, t / 0.004);
      const dec1 = Math.exp(-t * 4.2);
      const dec2 = Math.exp(-t * 14);
      const mod = Math.sin(2 * Math.PI * baseHz * 3.0 * t) * dec2 * 1.4;
      const sL = Math.sin(2 * Math.PI * baseHz * 0.9985 * t + mod) * dec1 * atk * 0.72;
      const sR = Math.sin(2 * Math.PI * baseHz * 1.0015 * t + mod) * dec1 * atk * 0.72;
      left[i] = sL;
      right[i] = sR;
    }
    const { peaksMin, peaksMax } = computeWavePeaks(left, right);
    return {
      id,
      name: 'Glass Pluck.wav',
      sampleRate: sr,
      durationSec: dur,
      left,
      right,
      peaksMin,
      peaksMax,
      isBuiltIn: true,
    };
  }

  // Default: builtin-808-kick (tuned to C2 = 65.41 Hz)
  const dur = 0.85;
  const len = Math.floor(sr * dur);
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const freq = 65.406 + 135 * Math.exp(-t * 42);
    phase += (2 * Math.PI * freq) / sr;
    const env = Math.min(1, t / 0.0025) * Math.exp(-t * 3.6);
    const click = Math.exp(-t * 210) * Math.sin(2 * Math.PI * 1200 * t) * 0.35;
    const val = Math.tanh((Math.sin(phase) * 0.92 + click) * env * 1.25);
    left[i] = val;
    right[i] = val;
  }
  const { peaksMin, peaksMax } = computeWavePeaks(left, right);
  return {
    id: 'builtin-808-kick',
    name: '808 Sub Kick.wav',
    sampleRate: sr,
    durationSec: dur,
    left,
    right,
    peaksMin,
    peaksMax,
    isBuiltIn: true,
  };
}

class SampleStore {
  private assets = new Map<string, DecodedSampleAsset>();
  private listeners = new Set<() => void>();

  constructor() {
    BUILTIN_SAMPLE_META.forEach((m) => {
      this.assets.set(m.id, synthesizeBuiltInSample(m.id));
    });
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  public get(sampleId?: string): DecodedSampleAsset | undefined {
    if (!sampleId) return undefined;
    const found = this.assets.get(sampleId);
    if (found) return found;
    if (BUILTIN_SAMPLE_META.some((m) => m.id === sampleId)) {
      const built = synthesizeBuiltInSample(sampleId);
      this.assets.set(sampleId, built);
      return built;
    }
    return undefined;
  }

  public listAll(): DecodedSampleAsset[] {
    return Array.from(this.assets.values());
  }

  public async decodeAudioFile(file: File): Promise<DecodedSampleAsset> {
    const buf = await file.arrayBuffer();
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const OfflineCtx =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;

    const decoderCtx = OfflineCtx ? new OfflineCtx(2, 1, 44100) : new AudioCtx();
    let decoded: AudioBuffer;
    try {
      decoded = await decoderCtx.decodeAudioData(buf.slice(0));
    } finally {
      if ('close' in decoderCtx && typeof decoderCtx.close === 'function') {
        decoderCtx.close().catch(() => {});
      }
    }

    const left = new Float32Array(decoded.getChannelData(0));
    const right =
      decoded.numberOfChannels > 1
        ? new Float32Array(decoded.getChannelData(1))
        : new Float32Array(left);
    const { peaksMin, peaksMax } = computeWavePeaks(left, right);

    const id = `smp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const asset: DecodedSampleAsset = {
      id,
      name: file.name || 'Imported Sample.wav',
      sampleRate: decoded.sampleRate,
      durationSec: decoded.duration,
      left,
      right,
      peaksMin,
      peaksMax,
      isBuiltIn: false,
    };
    this.assets.set(id, asset);
    this.notify();
    return asset;
  }

  public createTrimmedSample(
    sourceId: string,
    startNorm: number,
    endNorm: number,
    reverse = false
  ): DecodedSampleAsset | null {
    const src = this.get(sourceId);
    if (!src) return null;
    const total = src.left.length;
    const sIdx = Math.max(0, Math.min(total - 2, Math.floor(startNorm * (total - 1))));
    const eIdx = Math.max(sIdx + 2, Math.min(total, Math.floor(endNorm * total)));
    const sliceLen = eIdx - sIdx;
    const left = new Float32Array(sliceLen);
    const right = new Float32Array(sliceLen);

    for (let i = 0; i < sliceLen; i++) {
      const readIdx = reverse ? eIdx - 1 - i : sIdx + i;
      left[i] = src.left[readIdx];
      right[i] = src.right[readIdx];
    }

    const { peaksMin, peaksMax } = computeWavePeaks(left, right);
    const id = `smp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const cleanName = src.name.replace(/(\.[^.]+)$/, ' (Trim)$1');
    const asset: DecodedSampleAsset = {
      id,
      name: cleanName,
      sampleRate: src.sampleRate,
      durationSec: sliceLen / src.sampleRate,
      left,
      right,
      peaksMin,
      peaksMax,
      isBuiltIn: false,
    };
    this.assets.set(id, asset);
    this.notify();
    return asset;
  }
}

export const sampleStore = new SampleStore();

export function createDefaultSamplerConfig(
  sampleId = 'builtin-808-kick',
  enabled = false
): SamplerConfig {
  const meta = BUILTIN_SAMPLE_META.find((m) => m.id === sampleId);
  const asset = sampleStore.get(sampleId);
  return {
    enabled,
    layerOscs: false,
    sampleId: asset?.id ?? sampleId,
    sampleName: asset?.name ?? meta?.name ?? '808 Sub Kick.wav',
    durationSec: asset?.durationSec ?? 0.85,
    sampleRate: asset?.sampleRate ?? 44100,
    rootMidi: meta?.rootMidi ?? 60,
    pitchTrack: meta?.pitchTrack ?? true,
    playMode: meta?.defaultMode ?? 'oneShot',
    startNorm: 0,
    endNorm: 1,
    loopStartNorm: 0.2,
    loopEndNorm: 0.85,
    crossfadeNorm: 0.04,
    fadeInNorm: 0,
    fadeOutNorm: 0.02,
    gain: 1,
    tuneSemi: 0,
    fineCents: 0,
    reverse: false,
    normalize: false,
  };
}
