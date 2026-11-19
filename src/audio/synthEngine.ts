import {
  AdsrEnvelopeValues,
  AdsrTarget,
  ComponentLfoConfig,
  FilterType,
  MixerChannelStrip,
  MixerTrackState,
  StudioChannel,
  SynthParamTarget,
  ThreeXOscParams,
} from '../types/synth';
import {
  DEFAULT_3X_OSC_PARAMS,
  DEFAULT_ADSR_ENVELOPES,
  DEFAULT_ADSR_LFOS,
  FILTER_TYPE_OPTIONS,
  NOISE_TYPE_OPTIONS,
  THREE_X_OSC_WORKLET_CODE,
} from './threeXOscWorklet';
import {
  DEFAULT_PITOCHONCHO_EQ,
  EQ_MAX_HZ,
  EQ_MIN_HZ,
  PitochonchoEqBand,
  PitochonchoEqState,
  PitochonchoTelemetry,
  midiNoteToHz,
} from './pitochonchoEq';
import {
  MixerStripAudioChain,
  createDefaultMixerStrip,
  getEffectiveTrackSends,
  wouldTrackSendCreateCycle,
} from './mixerFxEngine';
import { sampleStore } from './sampleStore';

export interface SynthState {
  cutoff: number;      // 0..1 -> 65Hz..19500Hz
  resonance: number;   // 0..1 -> 0.5..18 Q
  oscDetune: number;
  subLevel: number;
  lfoRate: number;
  lfoDepth: number;
  envAttack: number;
  envDecay: number;
  envSustain: number;
  envRelease: number;
  delayMix: number;
  delayTime: number;
  drive: number;
  masterGain: number;
}

export interface PipelineRoutingState {
  filterEnabled: boolean;
  driveEnabled: boolean;
  delayEnabled: boolean;
  reverbEnabled: boolean;
  masterEnabled: boolean;
}

interface StudioChannelAudioNode {
  node: AudioWorkletNode;
  panNode: StereoPannerNode;
  gainNode: GainNode;
  routedTrack: number;
  loadedSampleId: string;
}

export interface MasterLimiterState {
  enabled: boolean;
  thresholdDb: number; // -24..0 dB
  ceilingDb: number;   // -6..0 dB
  releaseMs: number;   // 15..300 ms
  driveDb: number;     // 0..12 dB
}

class ThreeXOscSynthEngine {
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletReady = false;
  private studioChannelNodes = new Map<string, StudioChannelAudioNode>();
  private samplePlayheadMap = new Map<string, number>();
  private mixerTrackChains = new Map<number, MixerStripAudioChain>();
  private masterMixerChain: MixerStripAudioChain | null = null;
  private pendingStudioChannels: StudioChannel[] = [];
  private pendingMixerTracks: MixerTrackState[] = [];
  private pendingMasterMixer: MixerChannelStrip = createDefaultMixerStrip(0.5);
  private pendingMasterMuted = false;
  private masterFilter: BiquadFilterNode | null = null;
  private masterGainNode: GainNode | null = null;
  private pitoEqNodes: BiquadFilterNode[] = [];
  private masterDriveNode: GainNode | null = null;
  private masterLimiterNode: DynamicsCompressorNode | null = null;
  private masterCeilingNode: GainNode | null = null;
  private meterBuffer: Float32Array<ArrayBuffer> | null = null;
  private eqFreqBuf: Float32Array<ArrayBuffer> | null = null;
  private eqDynDeltaDb: [number, number, number, number] = [0, 0, 0, 0];
  private eqBandLevelsDb: [number, number, number, number] = [-72, -72, -72, -72];
  private eqCurrentFreqsHz: [number, number, number, number] = [130.81, 261.63, 392.44, 523.25];
  private trackedFundamentalHz = 130.81;
  private eqTimerId: number | null = null;
  private eqLastTickMs = 0;
  private shaperNode: WaveShaperNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayWet: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private enabled = false;

  public threeXOsc: ThreeXOscParams = structuredClone(DEFAULT_3X_OSC_PARAMS);

  public pitoEq: PitochonchoEqState = structuredClone(DEFAULT_PITOCHONCHO_EQ);

  public masterLimiter: MasterLimiterState = {
    enabled: true,
    thresholdDb: -2.0,
    ceilingDb: -0.3,
    releaseMs: 75,
    driveDb: 0,
  };

  public pipeline: PipelineRoutingState = {
    filterEnabled: true,
    driveEnabled: true,
    delayEnabled: true,
    reverbEnabled: false,
    masterEnabled: true,
  };

  public state: SynthState = {
    cutoff: 1.0, // Transparent open by default for pure 3xOsc tone
    resonance: 0.08,
    oscDetune: 0.0,
    subLevel: 0.0,
    lfoRate: 0.25,
    lfoDepth: 0.0,
    envAttack: DEFAULT_3X_OSC_PARAMS.envAttack,
    envDecay: DEFAULT_3X_OSC_PARAMS.envDecay,
    envSustain: DEFAULT_3X_OSC_PARAMS.envSustain,
    envRelease: DEFAULT_3X_OSC_PARAMS.envRelease,
    delayMix: 0.0,
    delayTime: 0.35,
    drive: 0.0,
    masterGain: 0.78,
  };

  private listeners: Set<(enabled: boolean) => void> = new Set();

  public subscribe(fn: (enabled: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((fn) => fn(this.enabled));
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getCurrentTime(): number {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  public setMasterLimiter(patch: Partial<MasterLimiterState>) {
    this.masterLimiter = { ...this.masterLimiter, ...patch };
    this.applyMasterLimiterParams();
  }

  public setMasterGain(normalized: number) {
    const v = Math.max(0, Math.min(1, normalized));
    this.state.masterGain = v;
    if (!this.ctx || !this.masterGainNode) return;
    this.masterGainNode.gain.setTargetAtTime(
      this.pipeline.masterEnabled ? v * 0.85 : 0,
      this.ctx.currentTime,
      0.015
    );
  }

  private applyMasterLimiterParams() {
    if (!this.ctx || !this.masterLimiterNode || !this.masterDriveNode || !this.masterCeilingNode) {
      return;
    }
    const now = this.ctx.currentTime;
    const lim = this.masterLimiter;
    if (lim.enabled) {
      const driveLinear = Math.pow(10, Math.max(0, Math.min(12, lim.driveDb)) / 20);
      const ceilLinear = Math.pow(10, Math.max(-12, Math.min(0, lim.ceilingDb)) / 20);
      const thresh = Math.max(-24, Math.min(0, lim.thresholdDb));
      // Compensate makeup via ceiling vs threshold so brickwall ceiling holds accurately
      const makeupGain = Math.min(
        ceilLinear,
        ceilLinear * Math.pow(10, Math.max(0, -thresh * 0.15) / 20)
      );
      this.masterDriveNode.gain.setTargetAtTime(driveLinear, now, 0.015);
      this.masterLimiterNode.threshold.setTargetAtTime(thresh, now, 0.015);
      this.masterLimiterNode.knee.setTargetAtTime(0, now, 0.015);
      this.masterLimiterNode.ratio.setTargetAtTime(20, now, 0.015);
      this.masterLimiterNode.attack.setTargetAtTime(0.001, now, 0.01);
      this.masterLimiterNode.release.setTargetAtTime(
        Math.max(0.015, Math.min(0.4, lim.releaseMs / 1000)),
        now,
        0.015
      );
      this.masterCeilingNode.gain.setTargetAtTime(
        Math.min(1, makeupGain),
        now,
        0.015
      );
    } else {
      this.masterDriveNode.gain.setTargetAtTime(1, now, 0.015);
      this.masterLimiterNode.threshold.setTargetAtTime(0, now, 0.015);
      this.masterLimiterNode.ratio.setTargetAtTime(1, now, 0.015);
      this.masterCeilingNode.gain.setTargetAtTime(1, now, 0.015);
    }
  }

  public getMasterMeter(): { peak: number; gainReductionDb: number } {
    if (!this.analyser || !this.enabled) {
      return { peak: 0, gainReductionDb: 0 };
    }
    if (!this.meterBuffer || this.meterBuffer.length !== this.analyser.fftSize) {
      this.meterBuffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    }
    this.analyser.getFloatTimeDomainData(this.meterBuffer);
    let peak = 0;
    for (let i = 0; i < this.meterBuffer.length; i++) {
      const a = Math.abs(this.meterBuffer[i]);
      if (a > peak) peak = a;
    }
    const gr = this.masterLimiter.enabled && this.masterLimiterNode
      ? Math.min(0, this.masterLimiterNode.reduction || 0)
      : 0;
    return { peak: Math.min(1.2, peak), gainReductionDb: gr };
  }

  public setPitochonchoEq(next: PitochonchoEqState) {
    this.pitoEq = next;
    this.applyPitoEqStaticAndFreqs();
    this.syncEqLoopState();
  }

  public updatePitochonchoBand(bandIdx: number, patch: Partial<PitochonchoEqBand>) {
    const idx = Math.max(0, Math.min(3, bandIdx));
    const bands = this.pitoEq.bands.map((b, i) =>
      i === idx ? { ...b, ...patch } : b
    ) as PitochonchoEqState['bands'];
    this.pitoEq = { ...this.pitoEq, bands };
    this.applyPitoEqStaticAndFreqs();
  }

  public getPitochonchoTelemetry(): PitochonchoTelemetry {
    const spectrumLog = new Array<number>(48).fill(0);
    if (this.analyser && this.ctx && this.enabled) {
      if (!this.eqFreqBuf || this.eqFreqBuf.length !== this.analyser.frequencyBinCount) {
        this.eqFreqBuf = new Float32Array(
          new ArrayBuffer(this.analyser.frequencyBinCount * 4)
        );
      }
      this.analyser.getFloatFrequencyData(this.eqFreqBuf);
      const binHz = this.ctx.sampleRate / this.analyser.fftSize;
      const maxBin = this.eqFreqBuf.length - 1;
      for (let i = 0; i < 48; i++) {
        const hz = EQ_MIN_HZ * Math.pow(EQ_MAX_HZ / EQ_MIN_HZ, i / 47);
        const bin = Math.max(1, Math.min(maxBin, Math.round(hz / binHz)));
        const db = Math.max(
          this.eqFreqBuf[bin],
          this.eqFreqBuf[Math.max(1, bin - 1)],
          this.eqFreqBuf[Math.min(maxBin, bin + 1)]
        );
        // Map -78..0 dB to 0..1
        spectrumLog[i] = Math.max(0, Math.min(1, (db + 78) / 78));
      }
    }

    return {
      fundamentalHz: this.trackedFundamentalHz,
      spectrumLog,
      bands: this.pitoEq.bands.map((b, idx) => {
        const freqHz = this.pitoEq.autoTrackHarmonics
          ? Math.max(EQ_MIN_HZ, Math.min(EQ_MAX_HZ, this.trackedFundamentalHz * b.harmonicMult))
          : b.freqHz;
        const dyn = this.pitoEq.enabled && b.enabled ? this.eqDynDeltaDb[idx] : 0;
        const stat = this.pitoEq.enabled && b.enabled ? b.gainDb : 0;
        return {
          id: b.id,
          freqHz,
          staticGainDb: stat,
          dynamicDeltaDb: dyn,
          totalGainDb: Math.max(-20, Math.min(20, stat + dyn)),
          q: b.q,
          levelDb: this.eqBandLevelsDb[idx],
        };
      }),
    };
  }

  private applyPitoEqStaticAndFreqs(atTime?: number) {
    if (!this.ctx || this.pitoEqNodes.length !== 4) return;
    const when = atTime ?? this.ctx.currentTime;
    const eq = this.pitoEq;
    for (let i = 0; i < 4; i++) {
      const band = eq.bands[i];
      const node = this.pitoEqNodes[i];
      const freq = eq.autoTrackHarmonics
        ? Math.max(EQ_MIN_HZ, Math.min(EQ_MAX_HZ, this.trackedFundamentalHz * band.harmonicMult))
        : Math.max(EQ_MIN_HZ, Math.min(EQ_MAX_HZ, band.freqHz));
      this.eqCurrentFreqsHz[i] = freq;
      node.frequency.setTargetAtTime(freq, when, 0.018);
      node.Q.setTargetAtTime(Math.max(0.4, Math.min(12, band.q)), when, 0.018);
      if (!eq.enabled || !band.enabled) {
        this.eqDynDeltaDb[i] = 0;
        node.gain.setTargetAtTime(0, when, 0.015);
      } else {
        node.gain.setTargetAtTime(
          Math.max(-22, Math.min(22, band.gainDb + this.eqDynDeltaDb[i])),
          when,
          0.015
        );
      }
    }
  }

  private syncEqLoopState() {
    if (typeof window === 'undefined') return;
    const shouldRun = this.enabled && this.pitoEq.enabled;
    if (shouldRun && this.eqTimerId === null) {
      this.eqLastTickMs = performance.now();
      this.eqTimerId = window.setInterval(() => this.tickPitochonchoDynamicEq(), 33);
    } else if (!shouldRun && this.eqTimerId !== null) {
      window.clearInterval(this.eqTimerId);
      this.eqTimerId = null;
      this.eqDynDeltaDb = [0, 0, 0, 0];
      this.applyPitoEqStaticAndFreqs();
    }
  }

  private tickPitochonchoDynamicEq() {
    if (!this.ctx || !this.analyser || !this.enabled || !this.pitoEq.enabled) return;
    if (this.pitoEqNodes.length !== 4) return;

    const nowMs = performance.now();
    const dtSec = Math.max(0.005, Math.min(0.1, (nowMs - this.eqLastTickMs) / 1000));
    this.eqLastTickMs = nowMs;

    if (!this.eqFreqBuf || this.eqFreqBuf.length !== this.analyser.frequencyBinCount) {
      this.eqFreqBuf = new Float32Array(
        new ArrayBuffer(this.analyser.frequencyBinCount * 4)
      );
    }
    this.analyser.getFloatFrequencyData(this.eqFreqBuf);

    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const maxBin = this.eqFreqBuf.length - 1;
    const nowAudio = this.ctx.currentTime;
    const atkCoeff = 1 - Math.exp(-dtSec / Math.max(0.004, this.pitoEq.attackMs / 1000));
    const relCoeff = 1 - Math.exp(-dtSec / Math.max(0.02, this.pitoEq.releaseMs / 1000));

    for (let i = 0; i < 4; i++) {
      const band = this.pitoEq.bands[i];
      const node = this.pitoEqNodes[i];
      const targetHz = this.pitoEq.autoTrackHarmonics
        ? Math.max(EQ_MIN_HZ, Math.min(EQ_MAX_HZ, this.trackedFundamentalHz * band.harmonicMult))
        : Math.max(EQ_MIN_HZ, Math.min(EQ_MAX_HZ, band.freqHz));
      this.eqCurrentFreqsHz[i] = targetHz;

      if (!band.enabled) {
        this.eqDynDeltaDb[i] = 0;
        node.gain.setTargetAtTime(0, nowAudio, 0.015);
        continue;
      }

      const centerBin = Math.max(1, Math.min(maxBin, Math.round(targetHz / binHz)));
      const levelDb = Math.max(
        this.eqFreqBuf[centerBin],
        this.eqFreqBuf[Math.max(1, centerBin - 1)],
        this.eqFreqBuf[Math.min(maxBin, centerBin + 1)]
      );
      this.eqBandLevelsDb[i] = levelDb;

      const overDb = Math.max(0, levelDb - band.thresholdDb);
      const ratio = Math.min(1, overDb / 18);
      const targetDelta = ratio * band.dynRangeDb;

      const cur = this.eqDynDeltaDb[i];
      const coeff = Math.abs(targetDelta) > Math.abs(cur) ? atkCoeff : relCoeff;
      const nextDelta = cur + (targetDelta - cur) * coeff;
      this.eqDynDeltaDb[i] = Math.abs(nextDelta) < 0.01 ? 0 : nextDelta;

      const totalGain = Math.max(-22, Math.min(22, band.gainDb + this.eqDynDeltaDb[i]));
      node.frequency.setTargetAtTime(targetHz, nowAudio, 0.018);
      node.Q.setTargetAtTime(Math.max(0.4, Math.min(12, band.q)), nowAudio, 0.02);
      node.gain.setTargetAtTime(totalGain, nowAudio, 0.014);
    }
  }

  public async toggle(): Promise<boolean> {
    if (!this.ctx) {
      await this.init();
    }
    if (!this.ctx) return false;

    if (this.enabled) {
      this.allNotesOff();
      await this.ctx.suspend();
      this.enabled = false;
    } else {
      await this.ctx.resume();
      this.enabled = true;
    }
    this.syncEqLoopState();
    this.notify();
    return this.enabled;
  }

  public async ensureStarted(): Promise<boolean> {
    if (!this.ctx) {
      await this.init();
    }
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    if (!this.enabled) {
      this.enabled = true;
      this.notify();
    }
    this.syncEqLoopState();
    return true;
  }

  public setPipelineRouting(next: Partial<PipelineRoutingState>) {
    this.pipeline = { ...this.pipeline, ...next };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (this.masterFilter) {
      this.masterFilter.frequency.setTargetAtTime(
        this.pipeline.filterEnabled ? this.mapCutoffHz(this.state.cutoff) : 19500,
        now,
        0.02
      );
    }
    if (this.shaperNode) {
      this.shaperNode.curve = this.makeDistortionCurve(
        this.pipeline.driveEnabled ? this.state.drive * 65 : 0
      );
    }
    if (this.delayWet) {
      this.delayWet.gain.setTargetAtTime(
        this.pipeline.delayEnabled ? this.state.delayMix * 0.55 : 0,
        now,
        0.02
      );
    }
    if (this.masterGainNode) {
      this.masterGainNode.gain.setTargetAtTime(
        this.pipeline.masterEnabled ? this.state.masterGain * 0.85 : 0,
        now,
        0.02
      );
    }
  }

  private async init() {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.mapCutoffHz(this.state.cutoff);
    filter.Q.value = 0.7 + this.state.resonance * 15;

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.makeDistortionCurve(this.state.drive * 65);
    shaper.oversample = '2x';

    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.06 + this.state.delayTime * 0.59;

    const feedback = ctx.createGain();
    feedback.gain.value = 0.36;

    const wet = ctx.createGain();
    wet.gain.value = this.state.delayMix * 0.55;

    const master = ctx.createGain();
    master.gain.value = this.state.masterGain * 0.85;

    // 4-Node Minimum-Phase Pitochoncho Dynamic EQ (native IIR peaking biquads, zero linear-phase FFT)
    const pitoEqNodes = this.pitoEq.bands.map((b) => {
      const eqNode = ctx.createBiquadFilter();
      eqNode.type = 'peaking';
      eqNode.frequency.value = b.freqHz;
      eqNode.Q.value = b.q;
      eqNode.gain.value = this.pitoEq.enabled && b.enabled ? b.gainDb : 0;
      return eqNode;
    });

    const masterDrive = ctx.createGain();
    masterDrive.gain.value = 1;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = this.masterLimiter.thresholdDb;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = this.masterLimiter.releaseMs / 1000;

    const masterCeiling = ctx.createGain();
    masterCeiling.gain.value = Math.pow(10, this.masterLimiter.ceilingDb / 20);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.2 + this.state.lfoRate * 14;
    lfo.start();

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = this.state.lfoDepth * 1800;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    // Master Chain: Master Fader -> Main Mixer Strip & FX -> 4-Band Pitochoncho Dynamic EQ -> Limiter -> Analyser -> Output
    const masterMixerChain = new MixerStripAudioChain(ctx, pitoEqNodes[0]);

    filter.connect(shaper);
    shaper.connect(master);
    shaper.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(master);

    master.connect(masterMixerChain.input);
    pitoEqNodes[0].connect(pitoEqNodes[1]);
    pitoEqNodes[1].connect(pitoEqNodes[2]);
    pitoEqNodes[2].connect(pitoEqNodes[3]);
    pitoEqNodes[3].connect(masterDrive);
    masterDrive.connect(limiter);
    limiter.connect(masterCeiling);
    masterCeiling.connect(analyser);
    analyser.connect(ctx.destination);

    this.masterFilter = filter;
    this.shaperNode = shaper;
    this.delayNode = delay;
    this.delayFeedback = feedback;
    this.delayWet = wet;
    this.masterGainNode = master;
    this.masterMixerChain = masterMixerChain;
    this.pitoEqNodes = pitoEqNodes;
    this.masterDriveNode = masterDrive;
    this.masterLimiterNode = limiter;
    this.masterCeilingNode = masterCeiling;
    this.analyser = analyser;
    this.lfoOsc = lfo;
    this.lfoGain = lfoGain;
    this.applyMasterLimiterParams();
    this.applyPitoEqStaticAndFreqs();
    this.syncMixerTracks(
      this.pendingMixerTracks,
      this.pendingMasterMixer,
      this.pendingMasterMuted
    );

    if (ctx.audioWorklet) {
      const blob = new Blob([THREE_X_OSC_WORKLET_CODE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      try {
        await ctx.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(ctx, 'three-x-osc-processor', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        node.connect(filter);
        this.workletNode = node;
        this.workletReady = true;
        this.pushWorkletParams();
        if (this.pendingStudioChannels.length > 0) {
          this.syncStudioChannels(this.pendingStudioChannels);
        }
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    this.enabled = ctx.state === 'running';
    this.syncEqLoopState();
    this.notify();
  }

  public syncMixerTracks(
    tracks: MixerTrackState[],
    masterMixer?: MixerChannelStrip,
    masterMuted = false
  ) {
    this.pendingMixerTracks = tracks;
    if (masterMixer) this.pendingMasterMixer = masterMixer;
    this.pendingMasterMuted = masterMuted;

    if (!this.ctx || !this.masterFilter) return;

    if (this.masterMixerChain) {
      this.masterMixerChain.applyState(
        this.pendingMasterMixer,
        1.0,
        !this.pendingMasterMuted,
        this.threeXOsc.bpm
      );
    }

    const activeIndices = new Set(tracks.map((t) => t.index));
    const anySolo = tracks.some((t) => t.solo);

    for (const [idx, chain] of this.mixerTrackChains.entries()) {
      if (!activeIndices.has(idx)) {
        chain.dispose();
        this.mixerTrackChains.delete(idx);
      }
    }

    for (const tr of tracks) {
      let chain = this.mixerTrackChains.get(tr.index);
      if (!chain) {
        chain = new MixerStripAudioChain(this.ctx);
        this.mixerTrackChains.set(tr.index, chain);
      }
      const audible = !tr.muted && (!anySolo || tr.solo);
      chain.applyState(tr.strip, tr.volume, audible, this.threeXOsc.bpm);
    }

    // Wire dynamic post-fader track sends (with cycle prevention)
    for (const tr of tracks) {
      const chain = this.mixerTrackChains.get(tr.index);
      if (!chain) continue;
      const sends = getEffectiveTrackSends(tr);
      const targets: { targetIndex: number; node: AudioNode; amount: number }[] = [];
      for (const s of sends) {
        if (s.targetIndex === 0) {
          targets.push({ targetIndex: 0, node: this.masterFilter, amount: s.amount });
        } else if (
          s.targetIndex > 0 &&
          !wouldTrackSendCreateCycle(tracks, tr.index, s.targetIndex)
        ) {
          const destChain = this.mixerTrackChains.get(s.targetIndex);
          if (destChain) {
            targets.push({
              targetIndex: s.targetIndex,
              node: destChain.input,
              amount: s.amount,
            });
          }
        }
      }
      chain.setSendDestinations(targets);
    }

    // Re-evaluate channel routing if tracks were just created
    if (this.pendingStudioChannels.length > 0 && this.workletReady) {
      this.syncStudioChannels(this.pendingStudioChannels);
    }
  }

  public getMixerTrackPeaks(): Record<number, number> {
    const peaks: Record<number, number> = { 0: this.getMasterMeter().peak };
    if (!this.enabled) return peaks;
    this.mixerTrackChains.forEach((chain, idx) => {
      peaks[idx] = chain.getPeak();
    });
    return peaks;
  }

  public syncStudioChannels(channels: StudioChannel[]) {
    this.pendingStudioChannels = channels;
    if (!this.ctx || !this.workletReady || !this.masterFilter) return;

    const now = this.ctx.currentTime;
    const anySolo = channels.some((c) => c.solo);
    const activeIds = new Set(channels.map((c) => c.id));

    // Remove deleted channels cleanly
    for (const [id, entry] of this.studioChannelNodes.entries()) {
      if (!activeIds.has(id)) {
        try {
          entry.node.port.postMessage({ type: 'allNotesOff' });
          entry.node.disconnect();
          entry.panNode.disconnect();
          entry.gainNode.disconnect();
        } catch {
          // ignore
        }
        this.studioChannelNodes.delete(id);
        this.samplePlayheadMap.delete(id);
      }
    }

    // Create/update each 3xOsc channel instance and connect to assigned Mixer Track (0 = Main, 1..N = Insert)
    for (const ch of channels) {
      const targetTrack = ch.mixerTrack ?? 0;
      const targetChain =
        targetTrack > 0 ? this.mixerTrackChains.get(targetTrack) : undefined;
      const destNode: AudioNode = targetChain ? targetChain.input : this.masterFilter;

      let entry = this.studioChannelNodes.get(ch.id);
      if (!entry) {
        const node = new AudioWorkletNode(this.ctx, 'three-x-osc-processor', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        node.port.onmessage = (ev) => {
          if (ev.data?.type === 'samplePlayhead') {
            this.samplePlayheadMap.set(ch.id, ev.data.norm);
          }
        };
        const panNode = this.ctx.createStereoPanner();
        const gainNode = this.ctx.createGain();
        node.connect(panNode);
        panNode.connect(gainNode);
        gainNode.connect(destNode);
        entry = {
          node,
          panNode,
          gainNode,
          routedTrack: targetTrack,
          loadedSampleId: '',
        };
        this.studioChannelNodes.set(ch.id, entry);
      } else if (entry.routedTrack !== targetTrack) {
        try {
          entry.gainNode.disconnect();
          entry.gainNode.connect(destNode);
          entry.routedTrack = targetTrack;
        } catch {
          // ignore
        }
      }

      const wantedSampleId = ch.params.sampler?.sampleId ?? '';
      if (wantedSampleId && wantedSampleId !== entry.loadedSampleId) {
        const asset = sampleStore.get(wantedSampleId);
        if (asset) {
          entry.node.port.postMessage({
            type: 'setSampleBuffer',
            sampleId: asset.id,
            left: new Float32Array(asset.left),
            right: new Float32Array(asset.right),
            sampleRate: asset.sampleRate,
          });
          entry.loadedSampleId = wantedSampleId;
        }
      }

      const audible = !ch.muted && (!anySolo || ch.solo);
      entry.panNode.pan.setTargetAtTime((ch.pan - 0.5) * 2, now, 0.015);
      entry.gainNode.gain.setTargetAtTime(audible ? ch.volume : 0, now, 0.015);
      entry.node.port.postMessage({
        type: 'params',
        params: { ...ch.params, bpm: this.threeXOsc.bpm },
      });
    }
  }

  public getChannelSamplePlayhead(channelId: string): number {
    return this.samplePlayheadMap.get(channelId) ?? -1;
  }

  public channelNoteOn(channelId: string, midiNote: number, velocity = 0.8, atTime?: number) {
    if (!this.enabled) return;
    const entry = this.studioChannelNodes.get(channelId);
    if (!entry) return;
    this.trackedFundamentalHz = Math.max(28, Math.min(3500, midiNoteToHz(midiNote)));
    if (this.pitoEq.autoTrackHarmonics) {
      this.applyPitoEqStaticAndFreqs(atTime);
    }
    entry.node.port.postMessage({
      type: 'noteOn',
      note: midiNote,
      velocity,
      atTime,
    });
  }

  public channelNoteOff(
    channelId: string,
    midiNote: number,
    immediate = false,
    atTime?: number
  ) {
    const entry = this.studioChannelNodes.get(channelId);
    if (!entry) return;
    entry.node.port.postMessage({
      type: 'noteOff',
      note: midiNote,
      immediate,
      atTime,
    });
  }

  public allChannelsNotesOff() {
    this.studioChannelNodes.forEach((entry) => {
      entry.node.port.postMessage({ type: 'allNotesOff' });
    });
  }

  private pushWorkletParams() {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'params',
      params: this.threeXOsc,
    });
  }

  public setAdsrEnvelopes(
    envelopes?: Partial<Record<AdsrTarget, AdsrEnvelopeValues>>,
    fallbackAmp?: AdsrEnvelopeValues
  ) {
    const next = { ...this.threeXOsc.envelopes };
    (['amp', 'pan', 'filter', 'res', 'pitch'] as AdsrTarget[]).forEach((t) => {
      if (envelopes && envelopes[t]) {
        next[t] = { ...DEFAULT_ADSR_ENVELOPES[t], ...envelopes[t] };
      }
    });
    if (!envelopes?.amp && fallbackAmp) {
      next.amp = { ...DEFAULT_ADSR_ENVELOPES.amp, ...fallbackAmp };
    }
    this.threeXOsc.envelopes = next;
    this.threeXOsc.envAttack = next.amp.attack;
    this.threeXOsc.envDecay = next.amp.decay;
    this.threeXOsc.envSustain = next.amp.sustain;
    this.threeXOsc.envRelease = next.amp.release;
    this.state.envAttack = next.amp.attack;
    this.state.envDecay = next.amp.decay;
    this.state.envSustain = next.amp.sustain;
    this.state.envRelease = next.amp.release;
    this.pushWorkletParams();
  }

  public setAdsrLfos(adsrLfos?: Partial<Record<AdsrTarget, ComponentLfoConfig>>) {
    const next = { ...this.threeXOsc.adsrLfos };
    (['amp', 'pan', 'filter', 'res', 'pitch'] as AdsrTarget[]).forEach((t) => {
      if (adsrLfos && adsrLfos[t]) {
        next[t] = { ...DEFAULT_ADSR_LFOS[t], ...adsrLfos[t] };
      }
    });
    this.threeXOsc.adsrLfos = next;
    this.pushWorkletParams();
  }

  public setBpm(bpm: number) {
    if (this.threeXOsc.bpm === bpm) return;
    this.threeXOsc.bpm = bpm;
    this.pushWorkletParams();
  }

  public setFilterType(filterType: FilterType) {
    if (this.threeXOsc.filterType === filterType) return;
    this.threeXOsc.filterType = filterType;
    this.pushWorkletParams();
  }

  private makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const k = Math.max(0, amount);
    const samples = 256;
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    const deg = Math.PI / 180;
    for (let i = 0; i < samples; ++i) {
      const x = (i * 2) / samples - 1;
      curve[i] = k === 0 ? x : ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  private mapCutoffHz(norm: number): number {
    const clamped = Math.max(0, Math.min(1, norm));
    return 65 * Math.pow(300, clamped); // up to 19500 Hz
  }

  public setParam(target: SynthParamTarget, normalized: number) {
    if (target === 'none' || target === 'noteTrigger' || target === 'drumTrigger') return;
    const v = Math.max(0, Math.min(1, normalized));

    // Handle 3xOsc per-oscillator & global parameters
    let updatedThreeX = true;
    switch (target) {
      case 'osc1Wave':
        this.threeXOsc.osc1.wave = Math.max(0, Math.min(6, Math.round(v * 6)));
        break;
      case 'osc1Invert':
        this.threeXOsc.osc1.invert = v >= 0.5;
        break;
      case 'osc1Coarse':
        this.threeXOsc.osc1.coarse = v;
        break;
      case 'osc1Fine':
        this.threeXOsc.osc1.fine = v;
        break;
      case 'osc1Phase':
        this.threeXOsc.osc1.phaseOffset = v;
        break;
      case 'osc1Detune':
        this.threeXOsc.osc1.detune = v;
        break;

      case 'osc2Wave':
        this.threeXOsc.osc2.wave = Math.max(0, Math.min(6, Math.round(v * 6)));
        break;
      case 'osc2Invert':
        this.threeXOsc.osc2.invert = v >= 0.5;
        break;
      case 'osc2Coarse':
        this.threeXOsc.osc2.coarse = v;
        break;
      case 'osc2Fine':
        this.threeXOsc.osc2.fine = v;
        break;
      case 'osc2Phase':
        this.threeXOsc.osc2.phaseOffset = v;
        break;
      case 'osc2Detune':
        this.threeXOsc.osc2.detune = v;
        break;
      case 'osc2Mix':
        this.threeXOsc.osc2.mix = v;
        break;

      case 'osc3Wave':
        this.threeXOsc.osc3.wave = Math.max(0, Math.min(6, Math.round(v * 6)));
        break;
      case 'osc3Invert':
        this.threeXOsc.osc3.invert = v >= 0.5;
        break;
      case 'osc3Coarse':
        this.threeXOsc.osc3.coarse = v;
        break;
      case 'osc3Fine':
        this.threeXOsc.osc3.fine = v;
        break;
      case 'osc3Phase':
        this.threeXOsc.osc3.phaseOffset = v;
        break;
      case 'osc3Detune':
        this.threeXOsc.osc3.detune = v;
        break;
      case 'osc3Mix':
        this.threeXOsc.osc3.mix = v;
        break;

      case 'phaseRand':
        this.threeXOsc.phaseRand = v;
        break;
      case 'amOsc3':
        this.threeXOsc.amOsc3 = v >= 0.5;
        break;
      case 'hqMode':
        this.threeXOsc.hq = v >= 0.5;
        break;
      case 'pan':
        this.threeXOsc.pan = v;
        break;
      case 'ampLevel':
        this.threeXOsc.ampLevel = v;
        break;
      case 'masterPitch':
        this.threeXOsc.masterPitch = v;
        break;
      case 'riserPitch':
        this.threeXOsc.riserPitch = v;
        break;
      case 'phaseDelayUs':
        this.threeXOsc.phaseDelayUs = v;
        break;
      case 'noiseType': {
        const idx = Math.max(
          0,
          Math.min(NOISE_TYPE_OPTIONS.length - 1, Math.round(v * (NOISE_TYPE_OPTIONS.length - 1)))
        );
        this.threeXOsc.noiseType = NOISE_TYPE_OPTIONS[idx].id;
        break;
      }
      case 'transientSnap':
        this.threeXOsc.transientSnap = v;
        break;
      case 'cutoff':
        this.threeXOsc.cutoff = v;
        this.state.cutoff = v;
        break;
      case 'resonance':
        this.threeXOsc.resonance = v;
        this.state.resonance = v;
        break;
      case 'filterType': {
        const idx = Math.max(0, Math.min(FILTER_TYPE_OPTIONS.length - 1, Math.round(v * (FILTER_TYPE_OPTIONS.length - 1))));
        this.threeXOsc.filterType = FILTER_TYPE_OPTIONS[idx].id;
        break;
      }

      case 'envAttack':
        this.threeXOsc.envAttack = v;
        this.threeXOsc.envelopes.amp.attack = v;
        this.state.envAttack = v;
        break;
      case 'envDecay':
        this.threeXOsc.envDecay = v;
        this.threeXOsc.envelopes.amp.decay = v;
        this.state.envDecay = v;
        break;
      case 'envSustain':
        this.threeXOsc.envSustain = v;
        this.threeXOsc.envelopes.amp.sustain = v;
        this.state.envSustain = v;
        break;
      case 'envRelease':
        this.threeXOsc.envRelease = v;
        this.threeXOsc.envelopes.amp.release = v;
        this.state.envRelease = v;
        break;

      default:
        updatedThreeX = false;
        break;
    }

    if (updatedThreeX) {
      this.pushWorkletParams();
      return;
    }

    (this.state as unknown as Record<string, number>)[target] = v;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    switch (target) {
      case 'lfoRate':
        if (this.lfoOsc) {
          this.lfoOsc.frequency.setTargetAtTime(0.2 + v * 14, now, 0.02);
        }
        break;
      case 'lfoDepth':
        if (this.lfoGain) {
          this.lfoGain.gain.setTargetAtTime(v * 1800, now, 0.02);
        }
        break;
      case 'delayMix':
        if (this.delayWet) {
          this.delayWet.gain.setTargetAtTime(
            this.pipeline.delayEnabled ? v * 0.55 : 0,
            now,
            0.02
          );
        }
        break;
      case 'delayTime':
        if (this.delayNode) {
          this.delayNode.delayTime.setTargetAtTime(0.06 + v * 0.59, now, 0.04);
        }
        break;
      case 'drive':
        if (this.shaperNode) {
          this.shaperNode.curve = this.makeDistortionCurve(
            this.pipeline.driveEnabled ? v * 65 : 0
          );
        }
        break;
      case 'masterGain':
        if (this.masterGainNode) {
          this.masterGainNode.gain.setTargetAtTime(
            this.pipeline.masterEnabled ? v * 0.85 : 0,
            now,
            0.02
          );
        }
        break;
      default:
        break;
    }
  }

  public noteOn(midiNote: number, velocity = 0.8, atTime?: number) {
    if (!this.enabled || !this.workletNode) return;
    this.trackedFundamentalHz = Math.max(28, Math.min(3500, midiNoteToHz(midiNote)));
    if (this.pitoEq.autoTrackHarmonics) {
      this.applyPitoEqStaticAndFreqs(atTime);
    }
    this.workletNode.port.postMessage({
      type: 'noteOn',
      note: midiNote,
      velocity,
      atTime,
    });
  }

  public noteOff(midiNote: number, immediate = false, atTime?: number) {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'noteOff',
      note: midiNote,
      immediate,
      atTime,
    });
  }

  public triggerDrum(padIndex: number, velocity = 0.85) {
    if (!this.enabled || !this.ctx || !this.shaperNode) return;
    const now = this.ctx.currentTime;
    const kind = padIndex % 4;

    if (kind === 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);
      gain.gain.setValueAtTime(velocity * 0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.connect(gain);
      gain.connect(this.shaperNode);
      osc.start(now);
      osc.stop(now + 0.36);
    } else if (kind === 1) {
      const bufferSize = this.ctx.sampleRate * 0.18;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 950;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(velocity * 0.65, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      noise.connect(hp);
      hp.connect(gain);
      gain.connect(this.shaperNode);
      noise.start(now);
    } else if (kind === 2) {
      const bufferSize = this.ctx.sampleRate * 0.06;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6200;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(velocity * 0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      noise.connect(hp);
      hp.connect(gain);
      gain.connect(this.shaperNode);
      noise.start(now);
    } else {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const base = 180 + (padIndex % 8) * 32;
      osc.frequency.setValueAtTime(base * 1.5, now);
      osc.frequency.exponentialRampToValueAtTime(base, now + 0.09);
      gain.gain.setValueAtTime(velocity * 0.55, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(this.shaperNode);
      osc.start(now);
      osc.stop(now + 0.24);
    }
  }

  public allNotesOff() {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'allNotesOff' });
    }
    this.allChannelsNotesOff();
  }

  public getWaveformData(target: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser || !this.enabled) return false;
    this.analyser.getByteTimeDomainData(target);
    return true;
  }
}

export const synthEngine = new ThreeXOscSynthEngine();
