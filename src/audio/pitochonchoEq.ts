export interface PitochonchoEqBand {
  id: number;
  label: string;
  harmonicMult: number; // 1 = f0, 2 = 2f0, 3 = 3f0, 4 = 4f0
  freqHz: number;
  gainDb: number;       // Static gain (-15..+15 dB)
  q: number;            // Resonance Q (0.5..10)
  thresholdDb: number;  // Dynamic trigger (-54..-6 dB)
  dynRangeDb: number;   // Bipolar dynamic travel (-15..+15 dB)
  enabled: boolean;
}

export interface PitochonchoEqState {
  enabled: boolean;
  autoTrackHarmonics: boolean;
  attackMs: number;
  releaseMs: number;
  bands: [
    PitochonchoEqBand,
    PitochonchoEqBand,
    PitochonchoEqBand,
    PitochonchoEqBand,
  ];
}

export interface PitochonchoBandTelemetry {
  id: number;
  freqHz: number;
  staticGainDb: number;
  dynamicDeltaDb: number;
  totalGainDb: number;
  q: number;
  levelDb: number;
}

export interface PitochonchoTelemetry {
  fundamentalHz: number;
  bands: PitochonchoBandTelemetry[];
  spectrumLog: number[]; // 48 log-spaced normalized points (0..1) from 25Hz..16kHz
}

export const EQ_MIN_HZ = 25;
export const EQ_MAX_HZ = 16000;

export const DEFAULT_PITOCHONCHO_EQ: PitochonchoEqState = {
  enabled: true,
  autoTrackHarmonics: true,
  attackMs: 18,
  releaseMs: 180,
  bands: [
    {
      id: 0,
      label: 'F0 · 1×',
      harmonicMult: 1,
      freqHz: 130.81,
      gainDb: 1.5,
      q: 2.2,
      thresholdDb: -26,
      dynRangeDb: -4.5,
      enabled: true,
    },
    {
      id: 1,
      label: 'H2 · 2×',
      harmonicMult: 2,
      freqHz: 261.63,
      gainDb: 0.5,
      q: 2.6,
      thresholdDb: -28,
      dynRangeDb: 3.5,
      enabled: true,
    },
    {
      id: 2,
      label: 'H3 · 3×',
      harmonicMult: 3,
      freqHz: 392.44,
      gainDb: 0,
      q: 3.0,
      thresholdDb: -30,
      dynRangeDb: -5.0,
      enabled: true,
    },
    {
      id: 3,
      label: 'H4 · 4×',
      harmonicMult: 4,
      freqHz: 523.25,
      gainDb: 1.0,
      q: 2.8,
      thresholdDb: -32,
      dynRangeDb: 4.0,
      enabled: true,
    },
  ],
};

export function midiNoteToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function hzToNoteLabel(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '—';
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${oct}`;
}

export function freqToNormX(hz: number): number {
  const clamped = Math.max(EQ_MIN_HZ, Math.min(EQ_MAX_HZ, hz));
  return (
    Math.log10(clamped / EQ_MIN_HZ) / Math.log10(EQ_MAX_HZ / EQ_MIN_HZ)
  );
}

export function normXToFreq(normX: number): number {
  const clamped = Math.max(0, Math.min(1, normX));
  return EQ_MIN_HZ * Math.pow(EQ_MAX_HZ / EQ_MIN_HZ, clamped);
}

/**
 * Exact minimum-phase Audio EQ Cookbook peaking filter magnitude response in dB.
 * Zero FFT, matches native Web Audio BiquadFilterNode(type='peaking').
 */
export function biquadPeakingDbAt(
  probeHz: number,
  centerHz: number,
  gainDb: number,
  q: number,
  sampleRate = 48000
): number {
  if (Math.abs(gainDb) < 0.02) return 0;
  const fc = Math.max(20, Math.min(sampleRate * 0.45, centerHz));
  const w0 = (2 * Math.PI * fc) / sampleRate;
  const sinW0 = Math.sin(w0);
  const cosW0 = Math.cos(w0);
  const A = Math.pow(10, gainDb / 40);
  const alpha = sinW0 / (2 * Math.max(0.2, q));

  const a0 = 1 + alpha / A;
  const b0 = (1 + alpha * A) / a0;
  const b1 = (-2 * cosW0) / a0;
  const b2 = (1 - alpha * A) / a0;
  const a1 = (-2 * cosW0) / a0;
  const a2 = (1 - alpha / A) / a0;

  const w = (2 * Math.PI * Math.max(10, Math.min(sampleRate * 0.48, probeHz))) / sampleRate;
  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cos2W = cosW * cosW - sinW * sinW;
  const sin2W = 2 * sinW * cosW;

  const numRe = b0 + b1 * cosW + b2 * cos2W;
  const numIm = -b1 * sinW - b2 * sin2W;
  const denRe = 1 + a1 * cosW + a2 * cos2W;
  const denIm = -a1 * sinW - a2 * sin2W;

  const magSq = (numRe * numRe + numIm * numIm) / Math.max(1e-12, denRe * denRe + denIm * denIm);
  return 10 * Math.log10(Math.max(1e-8, magSq));
}
