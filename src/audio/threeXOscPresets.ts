import {
  FilterType,
  MixerTrackState,
  ModuleAccent,
  ModuleGroup,
  NoiseType,
  SamplerConfig,
  StudioChannel,
  StudioPattern,
  StudioProjectState,
  SurfaceTab,
  SynthModule,
  ThreeXOscParams,
} from '../types/synth';
import {
  DEFAULT_3X_OSC_PARAMS,
  DEFAULT_ADSR_ENVELOPES,
  DEFAULT_ADSR_LFOS,
  FILTER_TYPE_OPTIONS,
  NOISE_TYPE_OPTIONS,
} from './threeXOscWorklet';
import { createDefaultMixerStrip } from './mixerFxEngine';
import { createDefaultSamplerConfig } from './sampleStore';
import {
  FACTORY_PRESETS,
  THREE_X_OSC_ENV_TAB_MODULES,
  hydrateModulesWithPixels,
} from '../data/presets';

export interface ThreeXOscChannelPreset {
  id: string;
  name: string;
  accent: ModuleAccent;
  rootNote: number;
  buildParams: () => ThreeXOscParams;
}

function cloneBase(): ThreeXOscParams {
  return structuredClone(DEFAULT_3X_OSC_PARAMS);
}

export const THREE_X_OSC_CHANNEL_PRESETS: ThreeXOscChannelPreset[] = [
  {
    id: 'res-kick',
    name: 'Resonant Kick',
    accent: 'rose',
    rootNote: 36, // C2
    buildParams: () => {
      const p = cloneBase();
      p.osc1 = { wave: 0, invert: false, coarse: 0.25, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 1 };
      p.osc2 = { wave: 1, invert: false, coarse: 0.5, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 0.22 };
      p.osc3 = { wave: 5, invert: false, coarse: 0.5, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 0.08 };
      p.filterType = 'kick';
      p.cutoff = 0.22;
      p.resonance = 0.84;
      p.ampLevel = 0.95;
      p.envelopes.amp = {
        ...DEFAULT_ADSR_ENVELOPES.amp,
        attack: 0.002,
        decay: 0.26,
        sustain: 0.0,
        release: 0.09,
        amount: 1.0,
        decayTension: 0.48,
      };
      p.envelopes.filter = {
        ...DEFAULT_ADSR_ENVELOPES.filter,
        attack: 0.001,
        decay: 0.14,
        sustain: 0.0,
        release: 0.08,
        amount: 0.88,
        decayTension: 0.65,
      };
      p.envelopes.pitch = {
        ...DEFAULT_ADSR_ENVELOPES.pitch,
        attack: 0.001,
        decay: 0.11,
        sustain: 0.0,
        release: 0.05,
        amount: 0.92,
        decayTension: 0.6,
      };
      p.envAttack = p.envelopes.amp.attack;
      p.envDecay = p.envelopes.amp.decay;
      p.envSustain = p.envelopes.amp.sustain;
      p.envRelease = p.envelopes.amp.release;
      return p;
    },
  },
  {
    id: 'sub-bass',
    name: 'Sub Bass',
    accent: 'emerald',
    rootNote: 36, // C2
    buildParams: () => {
      const p = cloneBase();
      p.osc1 = { wave: 0, invert: false, coarse: 0.25, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 1 };
      p.osc2 = { wave: 3, invert: false, coarse: 0.25, fine: 0.52, phaseOffset: 0.1, detune: 0.53, mix: 0.42 };
      p.osc3 = { wave: 4, invert: false, coarse: 0.5, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 0.2 };
      p.filterType = 'lp4';
      p.cutoff = 0.38;
      p.resonance = 0.28;
      p.ampLevel = 0.88;
      p.envelopes.amp = {
        ...DEFAULT_ADSR_ENVELOPES.amp,
        attack: 0.008,
        decay: 0.34,
        sustain: 0.68,
        release: 0.16,
        amount: 1.0,
      };
      p.envelopes.filter = {
        ...DEFAULT_ADSR_ENVELOPES.filter,
        attack: 0.008,
        decay: 0.26,
        sustain: 0.18,
        release: 0.16,
        amount: 0.72,
      };
      p.envAttack = p.envelopes.amp.attack;
      p.envDecay = p.envelopes.amp.decay;
      p.envSustain = p.envelopes.amp.sustain;
      p.envRelease = p.envelopes.amp.release;
      return p;
    },
  },
  {
    id: 'supersaw-lead',
    name: 'Supersaw Lead',
    accent: 'amber',
    rootNote: 60, // C4
    buildParams: () => {
      const p = cloneBase();
      p.osc1 = { wave: 3, invert: false, coarse: 0.5, fine: 0.44, phaseOffset: 0.12, detune: 0.38, mix: 1 };
      p.osc2 = { wave: 3, invert: false, coarse: 0.5, fine: 0.56, phaseOffset: 0.38, detune: 0.62, mix: 0.85 };
      p.osc3 = { wave: 4, invert: false, coarse: 0.75, fine: 0.5, phaseOffset: 0.65, detune: 0.54, mix: 0.45 };
      p.filterType = 'lp2';
      p.cutoff = 0.78;
      p.resonance = 0.24;
      p.ampLevel = 0.72;
      p.envelopes.amp = {
        ...DEFAULT_ADSR_ENVELOPES.amp,
        attack: 0.015,
        decay: 0.3,
        sustain: 0.74,
        release: 0.24,
        amount: 1.0,
      };
      return p;
    },
  },
  {
    id: 'comb-pluck',
    name: 'Comb Pluck',
    accent: 'sky',
    rootNote: 60, // C4
    buildParams: () => {
      const p = cloneBase();
      p.osc1 = { wave: 2, invert: false, coarse: 0.5, fine: 0.5, phaseOffset: 0, detune: 0.52, mix: 1 };
      p.osc2 = { wave: 5, invert: false, coarse: 0.5, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 0.24 };
      p.osc3 = { wave: 1, invert: false, coarse: 0.75, fine: 0.5, phaseOffset: 0.2, detune: 0.48, mix: 0.36 };
      p.filterType = 'comb';
      p.cutoff = 0.56;
      p.resonance = 0.76;
      p.ampLevel = 0.78;
      p.envelopes.amp = {
        ...DEFAULT_ADSR_ENVELOPES.amp,
        attack: 0.004,
        decay: 0.24,
        sustain: 0.08,
        release: 0.2,
        amount: 1.0,
        decayTension: 0.35,
      };
      p.envelopes.filter = {
        ...DEFAULT_ADSR_ENVELOPES.filter,
        attack: 0.004,
        decay: 0.22,
        sustain: 0.25,
        release: 0.18,
        amount: 0.68,
      };
      p.envAttack = p.envelopes.amp.attack;
      p.envDecay = p.envelopes.amp.decay;
      p.envSustain = p.envelopes.amp.sustain;
      p.envRelease = p.envelopes.amp.release;
      return p;
    },
  },
  {
    id: 'acid-303',
    name: 'Acid 303',
    accent: 'violet',
    rootNote: 48, // C3
    buildParams: () => {
      const p = cloneBase();
      p.osc1 = { wave: 3, invert: false, coarse: 0.5, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 1 };
      p.osc2 = { wave: 2, invert: false, coarse: 0.25, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 0.3 };
      p.osc3 = { wave: 0, invert: false, coarse: 0.5, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 0.0 };
      p.filterType = 'lp4';
      p.cutoff = 0.34;
      p.resonance = 0.78;
      p.ampLevel = 0.82;
      p.envelopes.amp = {
        ...DEFAULT_ADSR_ENVELOPES.amp,
        attack: 0.004,
        decay: 0.26,
        sustain: 0.18,
        release: 0.12,
        amount: 1.0,
      };
      p.envelopes.filter = {
        ...DEFAULT_ADSR_ENVELOPES.filter,
        attack: 0.004,
        decay: 0.22,
        sustain: 0.05,
        release: 0.12,
        amount: 0.92,
        decayTension: 0.45,
      };
      return p;
    },
  },
  {
    id: 'hollow-pad',
    name: 'Hollow Pad',
    accent: 'slate',
    rootNote: 60,
    buildParams: () => {
      const p = cloneBase();
      p.osc1 = { wave: 2, invert: false, coarse: 0.5, fine: 0.46, phaseOffset: 0.25, detune: 0.4, mix: 1 };
      p.osc2 = { wave: 1, invert: false, coarse: 0.75, fine: 0.54, phaseOffset: 0.5, detune: 0.6, mix: 0.6 };
      p.osc3 = { wave: 0, invert: false, coarse: 0.25, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 0.45 };
      p.filterType = 'bp';
      p.cutoff = 0.52;
      p.resonance = 0.36;
      p.ampLevel = 0.76;
      p.envelopes.amp = {
        ...DEFAULT_ADSR_ENVELOPES.amp,
        attack: 0.26,
        decay: 0.48,
        sustain: 0.76,
        release: 0.48,
        amount: 1.0,
      };
      return p;
    },
  },
  {
    id: 'noise-riser',
    name: 'Noise Riser Sweep',
    accent: 'violet',
    rootNote: 48,
    buildParams: () => {
      const p = cloneBase();
      p.osc1 = { wave: 5, invert: false, coarse: 0.5, fine: 0.5, phaseOffset: 0.1, detune: 0.6, mix: 1 };
      p.osc2 = { wave: 3, invert: false, coarse: 0.5, fine: 0.52, phaseOffset: 0.25, detune: 0.65, mix: 0.45 };
      p.osc3 = { wave: 4, invert: false, coarse: 0.75, fine: 0.5, phaseOffset: 0.5, detune: 0.42, mix: 0.3 };
      p.noiseType = 'pink';
      p.riserPitch = 0.5;
      p.phaseDelayUs = 0.58;
      p.transientSnap = 0.05;
      p.filterType = 'lp4';
      p.cutoff = 0.26;
      p.resonance = 0.58;
      p.ampLevel = 0.85;
      p.envelopes.amp = {
        ...DEFAULT_ADSR_ENVELOPES.amp,
        attack: 0.45,
        decay: 0.4,
        sustain: 0.92,
        release: 0.45,
        amount: 1.0,
      };
      p.envelopes.filter = {
        ...DEFAULT_ADSR_ENVELOPES.filter,
        attack: 0.68,
        decay: 0.2,
        sustain: 0.85,
        release: 0.35,
        amount: 0.95,
        attackTension: 0.35,
      };
      p.envelopes.pitch = {
        ...DEFAULT_ADSR_ENVELOPES.pitch,
        attack: 0.72,
        decay: 0.2,
        sustain: 0.8,
        release: 0.2,
        amount: 0.86,
      };
      p.envAttack = p.envelopes.amp.attack;
      p.envDecay = p.envelopes.amp.decay;
      p.envSustain = p.envelopes.amp.sustain;
      p.envRelease = p.envelopes.amp.release;
      return p;
    },
  },
  {
    id: 'tight-snare',
    name: 'Tight Snare',
    accent: 'amber',
    rootNote: 38,
    buildParams: () => {
      const p = cloneBase();
      p.osc1 = { wave: 1, invert: false, coarse: 0.5, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 1 };
      p.osc2 = { wave: 5, invert: false, coarse: 0.5, fine: 0.5, phaseOffset: 0.2, detune: 0.5, mix: 0.78 };
      p.osc3 = { wave: 0, invert: false, coarse: 0.75, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 0.18 };
      p.noiseType = 'velvet';
      p.transientSnap = 0.72;
      p.phaseDelayUs = 0.54;
      p.filterType = 'bp';
      p.cutoff = 0.62;
      p.resonance = 0.26;
      p.ampLevel = 0.92;
      p.envelopes.amp = {
        ...DEFAULT_ADSR_ENVELOPES.amp,
        attack: 0.001,
        decay: 0.18,
        sustain: 0.0,
        release: 0.11,
        amount: 1.0,
        decayTension: 0.45,
      };
      p.envelopes.pitch = {
        ...DEFAULT_ADSR_ENVELOPES.pitch,
        attack: 0.001,
        decay: 0.06,
        sustain: 0.0,
        release: 0.04,
        amount: 0.78,
        decayTension: 0.65,
      };
      return p;
    },
  },
  {
    id: 'crisp-hihat',
    name: 'Crisp Hi-Hat',
    accent: 'sky',
    rootNote: 42,
    buildParams: () => {
      const p = cloneBase();
      p.osc1 = { wave: 5, invert: false, coarse: 0.5, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 1 };
      p.osc2 = { wave: 5, invert: false, coarse: 0.75, fine: 0.5, phaseOffset: 0.35, detune: 0.65, mix: 0.6 };
      p.osc3 = { wave: 2, invert: false, coarse: 1.0, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 0.12 };
      p.noiseType = 'blue';
      p.transientSnap = 0.48;
      p.filterType = 'hp4';
      p.cutoff = 0.78;
      p.resonance = 0.22;
      p.ampLevel = 0.85;
      p.envelopes.amp = {
        ...DEFAULT_ADSR_ENVELOPES.amp,
        attack: 0.001,
        decay: 0.075,
        sustain: 0.0,
        release: 0.05,
        amount: 1.0,
        decayTension: 0.55,
      };
      return p;
    },
  },
  {
    id: '808-metallic-hat',
    name: '808 Metallic Hat',
    accent: 'emerald',
    rootNote: 46,
    buildParams: () => {
      const p = cloneBase();
      p.osc1 = { wave: 5, invert: false, coarse: 0.5, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 1 };
      p.osc2 = { wave: 2, invert: false, coarse: 0.9, fine: 0.62, phaseOffset: 0.2, detune: 0.7, mix: 0.35 };
      p.osc3 = { wave: 5, invert: false, coarse: 0.75, fine: 0.4, phaseOffset: 0.4, detune: 0.5, mix: 0.4 };
      p.noiseType = 'metallic';
      p.transientSnap = 0.38;
      p.filterType = 'hp4';
      p.cutoff = 0.72;
      p.resonance = 0.36;
      p.ampLevel = 0.82;
      p.envelopes.amp = {
        ...DEFAULT_ADSR_ENVELOPES.amp,
        attack: 0.001,
        decay: 0.24,
        sustain: 0.0,
        release: 0.14,
        amount: 1.0,
        decayTension: 0.4,
      };
      return p;
    },
  },
  {
    id: 'punchy-clap',
    name: 'Punchy Clap',
    accent: 'rose',
    rootNote: 39,
    buildParams: () => {
      const p = cloneBase();
      p.osc1 = { wave: 5, invert: false, coarse: 0.5, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 1 };
      p.osc2 = { wave: 5, invert: false, coarse: 0.5, fine: 0.55, phaseOffset: 0.5, detune: 0.72, mix: 0.85 };
      p.osc3 = { wave: 1, invert: false, coarse: 0.5, fine: 0.5, phaseOffset: 0, detune: 0.5, mix: 0.2 };
      p.noiseType = 'velvet';
      p.transientSnap = 0.82;
      p.phaseDelayUs = 0.64;
      p.filterType = 'bp';
      p.cutoff = 0.58;
      p.resonance = 0.38;
      p.ampLevel = 0.9;
      p.envelopes.amp = {
        ...DEFAULT_ADSR_ENVELOPES.amp,
        attack: 0.004,
        decay: 0.21,
        sustain: 0.0,
        release: 0.14,
        amount: 1.0,
        decayTension: 0.5,
      };
      return p;
    },
  },
];

export function extractThreeXOscParamsFromModules(
  modules: SynthModule[],
  bpm = 128,
  baseSampler?: SamplerConfig
): ThreeXOscParams {
  const params = cloneBase();
  params.bpm = bpm;
  if (baseSampler) {
    params.sampler = structuredClone(baseSampler);
  }

  modules.forEach((mod) => {
    if (mod.type === 'adsr') {
      if (mod.values.adsrEnvelopes) {
        (['amp', 'pan', 'filter', 'res', 'pitch'] as const).forEach((t) => {
          const env = mod.values.adsrEnvelopes?.[t];
          if (env) {
            params.envelopes[t] = { ...DEFAULT_ADSR_ENVELOPES[t], ...env };
          }
        });
      } else if (mod.values.adsr) {
        params.envelopes.amp = { ...DEFAULT_ADSR_ENVELOPES.amp, ...mod.values.adsr };
      }
      if (mod.values.adsrLfos) {
        (['amp', 'pan', 'filter', 'res', 'pitch'] as const).forEach((t) => {
          const lfo = mod.values.adsrLfos?.[t];
          if (lfo) {
            params.adsrLfos[t] = { ...DEFAULT_ADSR_LFOS[t], ...lfo };
          }
        });
      }
      params.envAttack = params.envelopes.amp.attack;
      params.envDecay = params.envelopes.amp.decay;
      params.envSustain = params.envelopes.amp.sustain;
      params.envRelease = params.envelopes.amp.release;
      return;
    }

    const v = Math.max(0, Math.min(1, mod.values.primary ?? 0));
    switch (mod.midi.synthTarget) {
      case 'osc1Wave': params.osc1.wave = Math.round(v * 6); break;
      case 'osc1Invert': params.osc1.invert = v >= 0.5; break;
      case 'osc1Coarse': params.osc1.coarse = v; break;
      case 'osc1Fine': params.osc1.fine = v; break;
      case 'osc1Phase': params.osc1.phaseOffset = v; break;
      case 'osc1Detune': params.osc1.detune = v; break;
      case 'osc2Wave': params.osc2.wave = Math.round(v * 6); break;
      case 'osc2Invert': params.osc2.invert = v >= 0.5; break;
      case 'osc2Coarse': params.osc2.coarse = v; break;
      case 'osc2Fine': params.osc2.fine = v; break;
      case 'osc2Phase': params.osc2.phaseOffset = v; break;
      case 'osc2Detune': params.osc2.detune = v; break;
      case 'osc2Mix': params.osc2.mix = v; break;
      case 'osc3Wave': params.osc3.wave = Math.round(v * 6); break;
      case 'osc3Invert': params.osc3.invert = v >= 0.5; break;
      case 'osc3Coarse': params.osc3.coarse = v; break;
      case 'osc3Fine': params.osc3.fine = v; break;
      case 'osc3Phase': params.osc3.phaseOffset = v; break;
      case 'osc3Detune': params.osc3.detune = v; break;
      case 'osc3Mix': params.osc3.mix = v; break;
      case 'phaseRand': params.phaseRand = v; break;
      case 'amOsc3': params.amOsc3 = v >= 0.5; break;
      case 'hqMode': params.hq = v >= 0.5; break;
      case 'pan': params.pan = v; break;
      case 'ampLevel': params.ampLevel = v; break;
      case 'masterPitch': params.masterPitch = v; break;
      case 'riserPitch': params.riserPitch = v; break;
      case 'phaseDelayUs': params.phaseDelayUs = v; break;
      case 'noiseType': {
        const idx = Math.max(
          0,
          Math.min(NOISE_TYPE_OPTIONS.length - 1, Math.round(v * (NOISE_TYPE_OPTIONS.length - 1)))
        );
        params.noiseType = NOISE_TYPE_OPTIONS[idx].id as NoiseType;
        break;
      }
      case 'transientSnap': params.transientSnap = v; break;
      case 'cutoff': params.cutoff = v; break;
      case 'resonance': params.resonance = v; break;
      case 'filterType': {
        const idx = Math.max(
          0,
          Math.min(FILTER_TYPE_OPTIONS.length - 1, Math.round(v * (FILTER_TYPE_OPTIONS.length - 1)))
        );
        params.filterType = FILTER_TYPE_OPTIONS[idx].id as FilterType;
        break;
      }
      default:
        break;
    }
  });

  return params;
}

export function syncParamsIntoModules(
  modules: SynthModule[],
  params: ThreeXOscParams
): SynthModule[] {
  const filterIdx = Math.max(
    0,
    FILTER_TYPE_OPTIONS.findIndex((f) => f.id === params.filterType)
  );
  const filterVal = FILTER_TYPE_OPTIONS[filterIdx]?.value ?? 0;

  return modules.map((mod) => {
    const clone: SynthModule = {
      ...mod,
      midi: { ...mod.midi },
      secondaryMidi: mod.secondaryMidi ? { ...mod.secondaryMidi } : undefined,
      config: {
        ...mod.config,
        options: mod.config.options ? mod.config.options.map((o) => ({ ...o })) : undefined,
      },
      lfo: mod.lfo ? { ...mod.lfo } : undefined,
      values: {
        ...mod.values,
        adsr: mod.values.adsr ? { ...mod.values.adsr } : undefined,
        adsrEnvelopes: mod.values.adsrEnvelopes
          ? structuredClone(mod.values.adsrEnvelopes)
          : undefined,
        adsrLfos: mod.values.adsrLfos
          ? structuredClone(mod.values.adsrLfos)
          : undefined,
        seqSteps: mod.values.seqSteps ? mod.values.seqSteps.map((s) => ({ ...s })) : undefined,
      },
    };

    if (clone.type === 'adsr') {
      clone.values.adsr = { ...params.envelopes.amp };
      clone.values.adsrEnvelopes = structuredClone(params.envelopes);
      clone.values.adsrLfos = structuredClone(params.adsrLfos);
      clone.values.primary = params.envelopes.amp.attack;
      return clone;
    }

    switch (clone.midi.synthTarget) {
      case 'osc1Wave':
        clone.values.selectedIndex = Math.max(0, Math.min(6, Math.round(params.osc1.wave)));
        clone.values.primary = clone.values.selectedIndex / 6;
        break;
      case 'osc1Invert':
        clone.values.active = params.osc1.invert;
        clone.values.primary = params.osc1.invert ? 1 : 0;
        break;
      case 'osc1Coarse': clone.values.primary = params.osc1.coarse; break;
      case 'osc1Fine': clone.values.primary = params.osc1.fine; break;
      case 'osc1Phase': clone.values.primary = params.osc1.phaseOffset; break;
      case 'osc1Detune': clone.values.primary = params.osc1.detune; break;

      case 'osc2Wave':
        clone.values.selectedIndex = Math.max(0, Math.min(6, Math.round(params.osc2.wave)));
        clone.values.primary = clone.values.selectedIndex / 6;
        break;
      case 'osc2Invert':
        clone.values.active = params.osc2.invert;
        clone.values.primary = params.osc2.invert ? 1 : 0;
        break;
      case 'osc2Coarse': clone.values.primary = params.osc2.coarse; break;
      case 'osc2Fine': clone.values.primary = params.osc2.fine; break;
      case 'osc2Phase': clone.values.primary = params.osc2.phaseOffset; break;
      case 'osc2Detune': clone.values.primary = params.osc2.detune; break;
      case 'osc2Mix': clone.values.primary = params.osc2.mix; break;

      case 'osc3Wave':
        clone.values.selectedIndex = Math.max(0, Math.min(6, Math.round(params.osc3.wave)));
        clone.values.primary = clone.values.selectedIndex / 6;
        break;
      case 'osc3Invert':
        clone.values.active = params.osc3.invert;
        clone.values.primary = params.osc3.invert ? 1 : 0;
        break;
      case 'osc3Coarse': clone.values.primary = params.osc3.coarse; break;
      case 'osc3Fine': clone.values.primary = params.osc3.fine; break;
      case 'osc3Phase': clone.values.primary = params.osc3.phaseOffset; break;
      case 'osc3Detune': clone.values.primary = params.osc3.detune; break;
      case 'osc3Mix': clone.values.primary = params.osc3.mix; break;

      case 'phaseRand': clone.values.primary = params.phaseRand; break;
      case 'amOsc3':
        clone.values.active = params.amOsc3;
        clone.values.primary = params.amOsc3 ? 1 : 0;
        break;
      case 'hqMode':
        clone.values.active = params.hq;
        clone.values.primary = params.hq ? 1 : 0;
        break;
      case 'pan': clone.values.primary = params.pan; break;
      case 'ampLevel': clone.values.primary = params.ampLevel; break;
      case 'masterPitch': clone.values.primary = params.masterPitch; break;
      case 'riserPitch': clone.values.primary = params.riserPitch ?? 0.5; break;
      case 'phaseDelayUs': clone.values.primary = params.phaseDelayUs ?? 0.5; break;
      case 'noiseType': {
        const nIdx = Math.max(
          0,
          NOISE_TYPE_OPTIONS.findIndex((n) => n.id === (params.noiseType ?? 'white'))
        );
        clone.values.selectedIndex = nIdx;
        clone.values.primary = NOISE_TYPE_OPTIONS[nIdx]?.value ?? 0;
        break;
      }
      case 'transientSnap': clone.values.primary = params.transientSnap ?? 0; break;
      case 'cutoff': clone.values.primary = params.cutoff; break;
      case 'resonance': clone.values.primary = params.resonance; break;
      case 'filterType':
        clone.values.selectedIndex = filterIdx;
        clone.values.primary = filterVal;
        break;
      default:
        break;
    }

    return clone;
  });
}

export function buildChannelSurface(
  params: ThreeXOscParams,
  template?: { tabs: SurfaceTab[]; modules: SynthModule[]; groups?: ModuleGroup[] }
): {
  surfaceTabs: SurfaceTab[];
  surfaceModules: SynthModule[];
  surfaceGroups: ModuleGroup[];
} {
  const basePreset = FACTORY_PRESETS[0];
  const srcTabs =
    template?.tabs && template.tabs.length > 0
      ? template.tabs
      : basePreset.tabs ?? [{ id: 'tab-3xosc', label: '3xOsc' }];
  const srcModules =
    template?.modules && template.modules.length > 0
      ? template.modules
      : basePreset.modules;
  const srcGroups = template?.groups ?? basePreset.groups ?? [];

  const clonedTabs = srcTabs.map((t) => ({ ...t }));
  const clonedGroups = srcGroups.map((g) => ({ ...g }));
  const hydrated = hydrateModulesWithPixels(syncParamsIntoModules(srcModules, params));

  return {
    surfaceTabs: clonedTabs,
    surfaceModules: hydrated,
    surfaceGroups: clonedGroups,
  };
}

const MIXER_ACCENTS: ModuleAccent[] = ['rose', 'emerald', 'amber', 'sky', 'violet', 'slate'];

export function createMixerTrack(
  index: number,
  name?: string,
  accent?: ModuleAccent
): MixerTrackState {
  return {
    id: `mix-trk-${index}`,
    index,
    name: name ?? `Insert ${index}`,
    accent: accent ?? MIXER_ACCENTS[(index - 1) % MIXER_ACCENTS.length],
    volume: 0.85,
    muted: false,
    solo: false,
    strip: createDefaultMixerStrip(0.5),
    sends: [{ targetIndex: 0, amount: 1 }],
  };
}

export function normalizeStudioProject(proj: StudioProjectState): StudioProjectState {
  const normalizedChannels = proj.channels.map((ch, idx) => {
    const mergedParams: ThreeXOscParams = {
      ...cloneBase(),
      ...ch.params,
      envelopes: {
        ...structuredClone(DEFAULT_ADSR_ENVELOPES),
        ...(ch.params?.envelopes ?? {}),
      },
      adsrLfos: {
        ...structuredClone(DEFAULT_ADSR_LFOS),
        ...(ch.params?.adsrLfos ?? {}),
      },
    };
    let nextMods = ch.surfaceModules;
    if (
      Array.isArray(nextMods) &&
      ch.surfaceTabs?.some((t) => t.id === 'tab-env')
    ) {
      const existingIds = new Set(nextMods.map((m) => m.id));
      const missing = THREE_X_OSC_ENV_TAB_MODULES.filter((m) => !existingIds.has(m.id));
      if (missing.length > 0) {
        nextMods = hydrateModulesWithPixels(
          syncParamsIntoModules([...nextMods, ...missing], mergedParams)
        );
      }
    }
    return {
      ...ch,
      mixerTrack: typeof ch.mixerTrack === 'number' ? Math.max(0, ch.mixerTrack) : idx + 1,
      params: mergedParams,
      surfaceModules: nextMods,
    };
  });

  const highestRouted = Math.max(
    4,
    ...normalizedChannels.map((c) => c.mixerTrack ?? 0),
    ...(proj.mixerTracks ?? []).map((t) => t.index)
  );

  const existingByIndex = new Map<number, MixerTrackState>();
  (proj.mixerTracks ?? []).forEach((t) => {
    existingByIndex.set(t.index, {
      ...t,
      strip: { ...createDefaultMixerStrip(0.5), ...(t.strip ?? {}) },
      sends: Array.isArray(t.sends) ? t.sends : [{ targetIndex: 0, amount: 1 }],
    });
  });

  const mixerTracks: MixerTrackState[] = [];
  for (let i = 1; i <= highestRouted; i++) {
    const existing = existingByIndex.get(i);
    if (existing) {
      mixerTracks.push(existing);
    } else {
      const firstLinked = normalizedChannels.find((c) => c.mixerTrack === i);
      mixerTracks.push(
        createMixerTrack(
          i,
          firstLinked ? firstLinked.name.replace(/^3xOsc\s+/, '') : `Insert ${i}`,
          firstLinked?.accent
        )
      );
    }
  }

  return {
    ...proj,
    channels: normalizedChannels,
    masterMixer: { ...createDefaultMixerStrip(0.5), ...(proj.masterMixer ?? {}) },
    masterMuted: Boolean(proj.masterMuted),
    mixerTracks,
  };
}

export function createStudioChannelFromPreset(
  presetId: string,
  index: number,
  customName?: string,
  customParams?: ThreeXOscParams,
  surfaceTemplate?: { tabs: SurfaceTab[]; modules: SynthModule[]; groups?: ModuleGroup[] },
  mixerTrack?: number
): StudioChannel {
  const preset =
    THREE_X_OSC_CHANNEL_PRESETS.find((p) => p.id === presetId) ??
    THREE_X_OSC_CHANNEL_PRESETS[index % THREE_X_OSC_CHANNEL_PRESETS.length];
  const params = customParams ? structuredClone(customParams) : preset.buildParams();
  const surface = surfaceTemplate
    ? {
        surfaceTabs: surfaceTemplate.tabs.map((t) => ({ ...t })),
        surfaceModules: hydrateModulesWithPixels(
          syncParamsIntoModules(surfaceTemplate.modules, params)
        ),
        surfaceGroups: (surfaceTemplate.groups ?? []).map((g) => ({ ...g })),
      }
    : buildChannelSurface(params);

  return {
    id: `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: customName ?? `3xOsc ${preset.name}`,
    accent: preset.accent,
    volume: 0.8,
    pan: 0.5,
    muted: false,
    solo: false,
    rootNote: preset.rootNote,
    usePianoRoll: false,
    presetTag: customParams ? 'Surface 3xOsc' : preset.name,
    mixerTrack: mixerTrack ?? index + 1,
    params,
    ...surface,
  };
}

export function createSamplerStudioChannel(
  index: number,
  sampleId = 'builtin-808-kick',
  mixerTrack?: number
): StudioChannel {
  const sampler = createDefaultSamplerConfig(sampleId, true);
  const params: ThreeXOscParams = {
    ...cloneBase(),
    cutoff: 0.96,
    resonance: 0.08,
    filterType: 'lp2',
    envelopes: {
      ...structuredClone(DEFAULT_ADSR_ENVELOPES),
      amp: {
        attack: 0.0,
        decay: 0.25,
        sustain: 1.0,
        release: 0.14,
        amount: 1.0,
        attackTension: 0,
        decayTension: 0,
        releaseTension: 0,
      },
    },
    sampler,
  };
  const accents: ModuleAccent[] = ['sky', 'amber', 'emerald', 'rose'];
  const surface = buildChannelSurface(params);
  return {
    id: `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: `Sampler ${sampler.sampleName.replace(/\.[^.]+$/, '')}`,
    accent: accents[index % accents.length],
    volume: 0.86,
    pan: 0.5,
    muted: false,
    solo: false,
    rootNote: sampler.rootMidi,
    usePianoRoll: false,
    presetTag: 'Sampler',
    mixerTrack: mixerTrack ?? index + 1,
    params,
    ...surface,
  };
}

export function createDefaultStudioProject(): StudioProjectState {
  const pKick = THREE_X_OSC_CHANNEL_PRESETS[0].buildParams();
  const chKick: StudioChannel = {
    id: 'ch-kick',
    name: '3xOsc Res Kick',
    accent: 'rose',
    volume: 0.88,
    pan: 0.5,
    muted: false,
    solo: false,
    rootNote: 36,
    usePianoRoll: false,
    presetTag: 'Resonant Kick',
    mixerTrack: 1,
    params: pKick,
    ...buildChannelSurface(pKick),
  };

  const pBass = THREE_X_OSC_CHANNEL_PRESETS[1].buildParams();
  const chBass: StudioChannel = {
    id: 'ch-bass',
    name: '3xOsc Sub Bass',
    accent: 'emerald',
    volume: 0.78,
    pan: 0.5,
    muted: false,
    solo: false,
    rootNote: 36,
    usePianoRoll: true,
    presetTag: 'Sub Bass',
    mixerTrack: 2,
    params: pBass,
    ...buildChannelSurface(pBass),
  };

  const pLead = THREE_X_OSC_CHANNEL_PRESETS[2].buildParams();
  const chLead: StudioChannel = {
    id: 'ch-lead',
    name: '3xOsc Lead Saw',
    accent: 'amber',
    volume: 0.7,
    pan: 0.48,
    muted: false,
    solo: false,
    rootNote: 60,
    usePianoRoll: true,
    presetTag: 'Supersaw Lead',
    mixerTrack: 3,
    params: pLead,
    ...buildChannelSurface(pLead),
  };

  const pPluck = THREE_X_OSC_CHANNEL_PRESETS[3].buildParams();
  const chPluck: StudioChannel = {
    id: 'ch-pluck',
    name: '3xOsc Comb Pluck',
    accent: 'sky',
    volume: 0.72,
    pan: 0.54,
    muted: false,
    solo: false,
    rootNote: 60,
    usePianoRoll: false,
    presetTag: 'Comb Pluck',
    mixerTrack: 4,
    params: pPluck,
    ...buildChannelSurface(pPluck),
  };

  const makeSteps = (activeIndices: number[], len = 16) =>
    Array.from({ length: len }, (_, i) => activeIndices.includes(i));

  const pat1: StudioPattern = {
    id: 'pat-1',
    name: 'Pattern 1 · Main Groove',
    stepsCount: 16,
    steps: {
      [chKick.id]: makeSteps([0, 4, 8, 12], 16),
      [chBass.id]: makeSteps([2, 6, 10, 14], 16),
      [chLead.id]: makeSteps([], 16),
      [chPluck.id]: makeSteps([0, 3, 6, 10, 12, 14], 16),
    },
    notes: {
      [chBass.id]: [
        { id: 'n-b1', pitch: 36, startStep: 2, durationSteps: 1.5, velocity: 0.88 },
        { id: 'n-b2', pitch: 36, startStep: 6, durationSteps: 1.5, velocity: 0.82 },
        { id: 'n-b3', pitch: 39, startStep: 10, durationSteps: 1.5, velocity: 0.86 },
        { id: 'n-b4', pitch: 43, startStep: 14, durationSteps: 1.5, velocity: 0.9 },
      ],
      [chLead.id]: [
        { id: 'n-l1', pitch: 60, startStep: 0, durationSteps: 2.5, velocity: 0.78 },
        { id: 'n-l2', pitch: 67, startStep: 3, durationSteps: 2.5, velocity: 0.84 },
        { id: 'n-l3', pitch: 63, startStep: 6, durationSteps: 2, velocity: 0.75 },
        { id: 'n-l4', pitch: 70, startStep: 10, durationSteps: 2.5, velocity: 0.86 },
        { id: 'n-l5', pitch: 67, startStep: 13, durationSteps: 2, velocity: 0.72 },
      ],
    },
  };

  const pat2: StudioPattern = {
    id: 'pat-2',
    name: 'Pattern 2 · Fill & Arp',
    stepsCount: 16,
    steps: {
      [chKick.id]: makeSteps([0, 4, 8, 12, 14], 16),
      [chBass.id]: makeSteps([], 16),
      [chLead.id]: makeSteps([], 16),
      [chPluck.id]: makeSteps([0, 2, 4, 6, 8, 10, 12, 14], 16),
    },
    notes: {
      [chBass.id]: [
        { id: 'n-b21', pitch: 41, startStep: 2, durationSteps: 1.5, velocity: 0.9 },
        { id: 'n-b22', pitch: 41, startStep: 6, durationSteps: 1.5, velocity: 0.84 },
        { id: 'n-b23', pitch: 43, startStep: 10, durationSteps: 1.5, velocity: 0.88 },
        { id: 'n-b24', pitch: 48, startStep: 14, durationSteps: 1.5, velocity: 0.92 },
      ],
      [chLead.id]: [
        { id: 'n-l21', pitch: 65, startStep: 0, durationSteps: 2, velocity: 0.82 },
        { id: 'n-l22', pitch: 72, startStep: 4, durationSteps: 2, velocity: 0.88 },
        { id: 'n-l23', pitch: 70, startStep: 8, durationSteps: 2, velocity: 0.82 },
        { id: 'n-l24', pitch: 75, startStep: 12, durationSteps: 3, velocity: 0.92 },
      ],
    },
  };

  return {
    channels: [chKick, chBass, chLead, chPluck],
    patterns: [pat1, pat2],
    activePatternId: pat1.id,
    selectedChannelId: chLead.id,
    playlistClips: [
      { id: 'clip-1', trackIndex: 0, startBar: 0, lengthBars: 1, patternId: pat1.id },
      { id: 'clip-2', trackIndex: 0, startBar: 1, lengthBars: 1, patternId: pat1.id },
      { id: 'clip-3', trackIndex: 0, startBar: 2, lengthBars: 1, patternId: pat1.id },
      { id: 'clip-4', trackIndex: 0, startBar: 3, lengthBars: 1, patternId: pat2.id },
    ],
    swing: 0.08,
    songMode: false,
    totalBars: 16,
    masterMixer: createDefaultMixerStrip(0.5),
    masterMuted: false,
    mixerTracks: [
      createMixerTrack(1, 'Kick', 'rose'),
      createMixerTrack(2, 'Sub Bass', 'emerald'),
      createMixerTrack(3, 'Lead Saw', 'amber'),
      createMixerTrack(4, 'Comb Pluck', 'sky'),
    ],
  };
}
