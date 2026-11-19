export type ControllerType =
  | 'knob'
  | 'fader'
  | 'xypad'
  | 'pads'
  | 'ribbon'
  | 'sequencer'
  | 'keyboard'
  | 'adsr'
  | 'toggle'
  | 'button'
  | 'onoff'
  | 'selectbox'
  | 'switch'
  | 'scope';

export type MidiMessageType = 'cc' | 'note' | 'pitchbend' | 'program';

export type MidiCurve = 'linear' | 'exponential' | 'logarithmic';

export type SynthParamTarget =
  | 'none'
  | 'osc1Wave'
  | 'osc1Invert'
  | 'osc1Coarse'
  | 'osc1Fine'
  | 'osc1Phase'
  | 'osc1Detune'
  | 'osc2Wave'
  | 'osc2Invert'
  | 'osc2Coarse'
  | 'osc2Fine'
  | 'osc2Phase'
  | 'osc2Detune'
  | 'osc2Mix'
  | 'osc3Wave'
  | 'osc3Invert'
  | 'osc3Coarse'
  | 'osc3Fine'
  | 'osc3Phase'
  | 'osc3Detune'
  | 'osc3Mix'
  | 'phaseRand'
  | 'amOsc3'
  | 'hqMode'
  | 'pan'
  | 'ampLevel'
  | 'masterPitch'
  | 'riserPitch'
  | 'phaseDelayUs'
  | 'noiseType'
  | 'transientSnap'
  | 'cutoff'
  | 'resonance'
  | 'filterType'
  | 'oscDetune'
  | 'subLevel'
  | 'lfoRate'
  | 'lfoDepth'
  | 'envAttack'
  | 'envDecay'
  | 'envSustain'
  | 'envRelease'
  | 'delayMix'
  | 'delayTime'
  | 'drive'
  | 'masterGain'
  | 'noteTrigger'
  | 'drumTrigger';

export type ModuleAccent = 'amber' | 'emerald' | 'sky' | 'rose' | 'violet' | 'slate';

export interface MidiMapping {
  enabled: boolean;
  channel: number; // 1 - 16
  messageType: MidiMessageType;
  ccNumber: number; // 0 - 127 (or base Note number for note/pads)
  minValue: number; // 0 - 127
  maxValue: number; // 0 - 127
  curve: MidiCurve;
  synthTarget: SynthParamTarget;
}

export interface SelectOptionItem {
  label: string;
  value: number; // 0..1 normalized
}

export interface ModuleConfig {
  // Knob & Fader
  bipolar?: boolean;
  unit?: string;
  // Pads
  padRows?: number;
  padCols?: number;
  padMode?: 'drum' | 'chord' | 'note';
  // Keyboard
  octave?: number;
  octaves?: number;
  scale?: 'chromatic' | 'minorPentatonic' | 'dorian' | 'phrygian' | 'major';
  // Sequencer
  steps?: number;
  // Toggle / Button / OnOff
  momentary?: boolean;
  // Ribbon
  springReturn?: boolean;
  // Selectbox & Multi-Switch
  options?: SelectOptionItem[];
}

export interface SequencerStep {
  active: boolean;
  noteOffset: number; // semitones from root (0..24)
  velocity: number; // 0..1
}

export type AdsrTarget = 'amp' | 'pan' | 'filter' | 'res' | 'pitch';

export type FilterType = 'lp2' | 'lp4' | 'hp2' | 'hp4' | 'bp' | 'comb' | 'kick';

export interface AdsrEnvelopeValues {
  attack: number;          // 0..1
  decay: number;           // 0..1
  sustain: number;         // 0..1
  release: number;         // 0..1
  amount?: number;         // 0..1 (0.5 = 0 bipolar mod; amp defaults to 1.0 = +100%)
  attackTension?: number;  // -1..+1 (0 = linear, >0 exp, <0 log)
  decayTension?: number;   // -1..+1
  releaseTension?: number; // -1..+1
}

export type LfoWave =
  | 'sine'
  | 'triangle'
  | 'square'
  | 'saw'
  | 'rampUp'
  | 'smoothRandom'
  | 'sampleHold'
  | 'expPulse';

export type LfoSyncDivision =
  | '4/1'
  | '2/1'
  | '1/1'
  | '1/2D'
  | '1/2'
  | '1/2T'
  | '1/4D'
  | '1/4'
  | '1/4T'
  | '1/8D'
  | '1/8'
  | '1/8T'
  | '1/16'
  | '1/16T'
  | '1/32';

export interface ComponentLfoConfig {
  enabled: boolean;
  wave: LfoWave;
  predelay: number;      // 0..1 (DEL)
  attack: number;        // 0..1 (ATT)
  amount: number;        // 0..1 (0.5 = 0, 0 = -100%, 1 = +100%)
  speed: number;         // 0..1 (SPD / FREQ: 0.06Hz..21.6Hz)
  tempoSync: boolean;
  syncDiv: LfoSyncDivision;
  global: boolean;       // free-running vs note-retriggered
  curveTension: number;  // -1..+1 response shaping curve
  amountSourceId?: string; // external wheel/fader ID controlling bipolar AMT
  speedSourceId?: string;  // external wheel/fader ID controlling FREQ (Hz or Sync)
  attackSourceId?: string; // external wheel/fader ID controlling Attack LFO
}

export interface ModuleValues {
  primary: number; // 0..1 normalized
  secondary?: number; // 0..1 normalized (e.g., XY pad Y axis)
  active?: boolean; // toggle / button / onoff state
  selectedIndex?: number; // selectbox / switch index
  adsr?: AdsrEnvelopeValues;
  adsrTarget?: AdsrTarget;
  adsrEnvelopes?: Partial<Record<AdsrTarget, AdsrEnvelopeValues>>;
  adsrLfos?: Partial<Record<AdsrTarget, ComponentLfoConfig>>;
  seqSteps?: SequencerStep[];
}

export interface SurfaceTab {
  id: string;
  label: string;
}

export interface SynthModule {
  id: string;
  tabId?: string; // Surface Canvas tab ID
  type: ControllerType;
  label: string;
  x: number; // 0-indexed grid col (legacy/preset hint)
  y: number; // 0-indexed grid row (legacy/preset hint)
  w: number; // width in grid cells
  h: number; // height in grid cells
  px?: number; // freeform canvas X in px
  py?: number; // freeform canvas Y in px
  pw?: number; // freeform width in px
  ph?: number; // freeform height in px
  accent: ModuleAccent;
  groupId?: string;
  midi: MidiMapping;
  secondaryMidi?: MidiMapping; // Used for XY Pad Y-axis or ADSR extra routing
  lfo?: ComponentLfoConfig;
  config: ModuleConfig;
  values: ModuleValues;
}

export type SnapMode = 'free' | 'fine' | 'grid';

export interface ModuleGroup {
  id: string;
  name: string;
  accent: ModuleAccent;
  compact: boolean;
}

export interface GridDimensions {
  cols: number;
  rows: number;
}

export interface SynthLayoutPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  bpm: number;
  grid: GridDimensions;
  tabs?: SurfaceTab[];
  modules: SynthModule[];
  groups?: ModuleGroup[];
  isFactory?: boolean;
  updatedAt: string;
}

export interface PerformanceSnapshot {
  id: 'A' | 'B' | 'C' | 'D';
  name: string;
  stored: boolean;
  moduleStates: Record<string, ModuleValues>;
}

export interface MidiPortInfo {
  id: string;
  name: string;
  manufacturer: string;
  type: 'input' | 'output';
  state: string;
}

export interface MidiLogEntry {
  id: string;
  timestamp: string;
  direction: 'out' | 'in';
  portName: string;
  channel: number;
  type: string;
  label: string;
  data1: number;
  data2: number;
  rawHex: string;
}

export interface PaletteItemDefinition {
  type: ControllerType;
  name: string;
  category: 'Continuous' | 'Expressive' | 'Switches & Selectors' | 'Triggers & Keys' | 'Sequencing' | 'Visuals';
  description: string;
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
  defaultAccent: ModuleAccent;
  defaultMidi: MidiMapping;
  defaultSecondaryMidi?: MidiMapping;
  defaultConfig: ModuleConfig;
  defaultValues: ModuleValues;
}

export type WorkspaceView = 'canvas' | 'studio' | 'matrix' | 'presets' | 'monitor';

export type PaletteId =
  | 'warehouse-obsidian'
  | 'buchla-west'
  | 'nordic-daylight'
  | 'berlin-dub'
  | 'acid-303'
  | 'crimson-modular';

export interface ThemePalette {
  id: PaletteId;
  name: string;
  subtitle: string;
  isLight: boolean;
  colors: {
    canvas: string;
    surface: string;
    panel: string;
    module: string;
    moduleHover: string;
    border: string;
    borderStrong: string;
    gridDot: string;
    text: string;
    textMuted: string;
    textDim: string;
    primary: string;      // Amber-Gold in default (active tabs, add/CTA, audio/cutoff)
    primaryText: string;  // Contrast text on primary filled buttons
    secondary: string;    // Mint-Emerald in default (play/notes/triggers)
    tertiary: string;     // Analog Teal in default (waveform/scope/mod)
    quaternary: string;   // Ultraviolet in default (loops/adsr/special)
    alert: string;        // Crimson/Rose (mute/delete/clip)
  };
}

export interface ThreeXOscOscState {
  wave: number;        // 0: Sine, 1: Triangle, 2: Square, 3: Saw, 4: RoundedSaw, 5: Noise, 6: Custom
  invert: boolean;     // * -1
  coarse: number;      // 0..1 -> -24..+24 semitones
  fine: number;        // 0..1 -> -100..+100 cents
  phaseOffset: number; // 0..1 -> 0..360 deg L/R stereo phase offset
  detune: number;      // 0..1 -> -100..+100 cents L/R stereo frequency split
  mix: number;         // 0..1 -> amplitude mix (OSC 2, OSC 3)
}

export type NoiseType = 'white' | 'pink' | 'brown' | 'blue' | 'velvet' | 'metallic';

export type MixerFilterMode = 'bipolar' | 'bp';
export type MixerFilterSlope = 2 | 4;

export type MixerFxCategory =
  | 'mastering'
  | 'filtering'
  | 'distortion'
  | 'time'
  | 'modulation';

export type MixerFxType =
  | 'busComp'
  | 'stereoImager'
  | 'svfFilter'
  | 'tiltEq'
  | 'tapeSat'
  | 'tubeDrive'
  | 'bitcrusher'
  | 'echoDelay'
  | 'dubDelay'
  | 'spaceReverb'
  | 'chorus'
  | 'phaser'
  | 'flanger'
  | 'autoPan';

export interface MixerFxSlot {
  id: string;
  type: MixerFxType;
  enabled: boolean;
  mix: number;       // 0..1
  sync?: boolean;
  syncDiv?: LfoSyncDivision;
  timeMs?: number;   // 1..2000 ms precision
  params: Record<string, number>; // normalized 0..1 sub-params
}

export interface MixerChannelStrip {
  pan: number;           // 0..1 (0.5 center)
  stereoWidth: number;   // 0..1 (0.5 = 100%, 0 = mono, 1 = 200% wide)
  phaseDelayUs: number;  // 0..1 (0.5 = 0 us, -1000..+1000 us)
  fxAmount: number;      // 0..1 master FX chain wet send amount
  filterPos: number;     // 0..1 (0.5 = open/bypass in bipolar, <0.5 = LP, >0.5 = HP)
  filterMode: MixerFilterMode;
  filterSlope: MixerFilterSlope;
  filterRes: number;     // 0..1 small res wheel
  polarityInvert: boolean;
  fxSlots: MixerFxSlot[];
}

export type SamplerPlayMode = 'oneShot' | 'sustain' | 'loop' | 'pingPong';

export interface SamplerConfig {
  enabled: boolean;
  layerOscs?: boolean;
  sampleId: string;
  sampleName: string;
  durationSec: number;
  sampleRate: number;
  rootMidi: number;
  pitchTrack: boolean;
  playMode: SamplerPlayMode;
  startNorm: number;
  endNorm: number;
  loopStartNorm: number;
  loopEndNorm: number;
  crossfadeNorm: number;
  fadeInNorm: number;
  fadeOutNorm: number;
  gain: number;
  tuneSemi: number;
  fineCents: number;
  reverse: boolean;
  normalize: boolean;
}

export interface ThreeXOscParams {
  osc1: ThreeXOscOscState;
  osc2: ThreeXOscOscState;
  osc3: ThreeXOscOscState;
  phaseRand: number;
  amOsc3: boolean;
  hq: boolean;
  pan: number;
  ampLevel: number;
  masterPitch: number;
  riserPitch?: number;    // 0..1 -> -48..+48 st smooth sweep for risers
  phaseDelayUs?: number;  // 0..1 -> -1000..+1000 microseconds L/R phase delay
  noiseType?: NoiseType;  // white | pink | brown | blue | velvet | metallic
  transientSnap?: number; // 0..1 drumkit transient snap / stick punch
  cutoff: number;
  resonance: number;
  filterType: FilterType;
  bpm: number;
  envAttack: number;
  envDecay: number;
  envSustain: number;
  envRelease: number;
  envelopes: Record<AdsrTarget, AdsrEnvelopeValues>;
  adsrLfos: Record<AdsrTarget, ComponentLfoConfig>;
  sampler?: SamplerConfig;
}

export interface PianoRollNote {
  id: string;
  pitch: number;         // MIDI note 24..96
  startStep: number;     // 0-based in 16th-note steps (supports fractional snaps)
  durationSteps: number; // length in 16th-note steps
  velocity: number;      // 0..1
}

export interface MixerTrackSend {
  targetIndex: number; // 0 = Main Bus, 1..N = Insert Track
  amount: number;      // 0..1.25 (1.0 = 0 dB unity)
}

export interface MixerTrackState {
  id: string;
  index: number;        // 1, 2, 3... (0 is Main/Master)
  name: string;
  accent: ModuleAccent;
  volume: number;       // 0..1.25 (0.85 = 0dB)
  muted: boolean;
  solo: boolean;
  strip: MixerChannelStrip;
  sends?: MixerTrackSend[]; // Dynamic routes/sends to M (0) or any insert track (1..N)
}

export interface StudioChannel {
  id: string;
  name: string;
  accent: ModuleAccent;
  volume: number;        // 0..1
  pan: number;           // 0..1 (0.5 center)
  muted: boolean;
  solo: boolean;
  rootNote: number;      // MIDI note triggered by Step Sequencer buttons
  usePianoRoll: boolean; // show Piano Roll overview vs step grid in Channel Rack
  presetTag: string;
  mixerTrack?: number;   // 0 = Main/Master, 1..N = Insert track to the right of Main
  params: ThreeXOscParams;
  mixer?: MixerChannelStrip;
  surfaceTabs?: SurfaceTab[];
  surfaceModules?: SynthModule[];
  surfaceGroups?: ModuleGroup[];
}

export interface StudioPattern {
  id: string;
  name: string;
  stepsCount: number; // 16 | 32 | 64
  steps: Record<string, boolean[]>;
  notes: Record<string, PianoRollNote[]>;
}

export interface PlaylistClip {
  id: string;
  trackIndex: number;
  startBar: number;
  lengthBars: number;
  patternId: string;
}

export interface StudioProjectState {
  channels: StudioChannel[];
  patterns: StudioPattern[];
  activePatternId: string;
  selectedChannelId: string;
  playlistClips: PlaylistClip[];
  swing: number;       // 0..0.75
  songMode: boolean;   // false = PAT, true = SONG
  totalBars: number;   // bars shown in playlist
  masterMixer?: MixerChannelStrip;
  masterMuted?: boolean;
  mixerTracks?: MixerTrackState[];
}


