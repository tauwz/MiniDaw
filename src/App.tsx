import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  ComponentLfoConfig,
  GridDimensions,
  MidiLogEntry,
  MidiPortInfo,
  ModuleGroup,
  ModuleValues,
  PaletteId,
  PaletteItemDefinition,
  PerformanceSnapshot,
  StudioProjectState,
  SurfaceTab,
  SynthLayoutPreset,
  SynthModule,
  WorkspaceView,
} from './types/synth';
import {
  BASE_CELL_W,
  BASE_CELL_H,
  BASE_GAP,
  FACTORY_PRESETS,
  THREE_X_OSC_ENV_TAB_MODULES,
  createModuleFromPalette,
  findOpenPixelSlot,
  getModulePixelRect,
  hydrateModulesWithPixels,
} from './data/presets';
import {
  DEFAULT_PALETTE_ID,
  applyPaletteCssVars,
  getPaletteById,
} from './data/themes';
import { MasterLimiterState, synthEngine } from './audio/synthEngine';
import { PitochonchoEqState } from './audio/pitochonchoEq';
import { evalLfoSample, isLfoModActive, resolveEffectiveLfo } from './audio/lfoMath';
import {
  createDefaultStudioProject,
  extractThreeXOscParamsFromModules,
  normalizeStudioProject,
} from './audio/threeXOscPresets';
import { midiEngine } from './midi/midiEngine';
import { PaletteSidebar } from './components/PaletteSidebar';
import { ControllerContextMenu } from './components/ControllerContextMenu';
import { ModulationOverlay } from './components/ModulationOverlay';
import { SurfaceCanvas } from './components/SurfaceCanvas';
import { ChannelRackStudioView } from './components/ChannelRackStudioView';
import { MidiMatrixView } from './components/MidiMatrixView';
import { PresetsView } from './components/PresetsView';
import { MidiMonitorView } from './components/MidiMonitorView';

const STORAGE_RIG_KEY = 'patchgrid_active_rig_v4_3xosc';
const STORAGE_CUSTOM_PRESETS_KEY = 'patchgrid_custom_presets_v2';
const STORAGE_PALETTE_KEY = 'patchgrid_palette_id_v1';
const STORAGE_STUDIO_KEY = 'patchgrid_studio_project_v1';

const INITIAL_SNAPSHOTS: PerformanceSnapshot[] = [
  { id: 'A', name: 'Scene A', stored: false, moduleStates: {} },
  { id: 'B', name: 'Scene B', stored: false, moduleStates: {} },
  { id: 'C', name: 'Scene C', stored: false, moduleStates: {} },
  { id: 'D', name: 'Scene D', stored: false, moduleStates: {} },
];

export default function App() {
  const [paletteId, setPaletteId] = useState<PaletteId>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PALETTE_KEY) as PaletteId | null;
      return saved || DEFAULT_PALETTE_ID;
    } catch {
      return DEFAULT_PALETTE_ID;
    }
  });
  const activePalette = useMemo(() => getPaletteById(paletteId), [paletteId]);

  useEffect(() => {
    applyPaletteCssVars(activePalette);
    try {
      localStorage.setItem(STORAGE_PALETTE_KEY, paletteId);
    } catch {
      // ignore storage errors
    }
  }, [activePalette, paletteId]);

  const [view, setView] = useState<WorkspaceView>('canvas');
  const [performMode, setPerformMode] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [paletteWidthPx, setPaletteWidthPx] = useState(260);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [resizingPalette, setResizingPalette] = useState(false);

  useEffect(() => {
    if (!resizingPalette) return;
    const onMove = (e: PointerEvent) => {
      if (e.clientX < 110) {
        setPaletteCollapsed(true);
        setResizingPalette(false);
      } else {
        setPaletteCollapsed(false);
        setPaletteWidthPx(Math.max(195, Math.min(420, Math.round(e.clientX))));
      }
    };
    const onUp = () => setResizingPalette(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [resizingPalette]);

  const initialRig = useMemo<SynthLayoutPreset>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_RIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SynthLayoutPreset;
        if (parsed && Array.isArray(parsed.modules) && parsed.grid) {
          const hasTabs = Array.isArray(parsed.tabs) && parsed.tabs.length > 0;
          if (!hasTabs && parsed.id === 'preset-3xosc-fl') {
            const migratedTabs: SurfaceTab[] = [
              { id: 'tab-3xosc', label: '3xOsc' },
              { id: 'tab-env', label: 'Env · Filter · Pitch' },
            ];
            const existingIds = new Set(parsed.modules.map((m) => m.id));
            const extraEnvMods = THREE_X_OSC_ENV_TAB_MODULES.filter(
              (m) => !existingIds.has(m.id)
            );
            const mergedMods = [
              ...parsed.modules.map((m) => ({ ...m, tabId: m.tabId ?? 'tab-3xosc' })),
              ...extraEnvMods,
            ];
            return {
              ...parsed,
              tabs: migratedTabs,
              modules: hydrateModulesWithPixels(mergedMods),
            };
          }
          const fallbackTabs =
            hasTabs ? parsed.tabs! : [{ id: 'tab-3xosc', label: '3xOsc' }];
          const defaultTabId = fallbackTabs[0].id;
          let loadedModules: SynthModule[] = parsed.modules.map((m) => ({
            ...m,
            tabId: m.tabId ?? defaultTabId,
          }));
          if (
            parsed.id === 'preset-3xosc-fl' &&
            fallbackTabs.some((t) => t.id === 'tab-env')
          ) {
            const existingIds = new Set(loadedModules.map((m) => m.id));
            const missingEnvMods = THREE_X_OSC_ENV_TAB_MODULES.filter(
              (m) => !existingIds.has(m.id)
            );
            if (missingEnvMods.length > 0) {
              loadedModules = [...loadedModules, ...missingEnvMods];
            }
          }
          return {
            ...parsed,
            tabs: fallbackTabs,
            modules: hydrateModulesWithPixels(loadedModules),
          };
        }
      }
    } catch {
      // fallback to 3xOsc default
    }
    return {
      ...FACTORY_PRESETS[0],
      tabs: FACTORY_PRESETS[0].tabs ?? [{ id: 'tab-3xosc', label: '3xOsc' }],
      modules: hydrateModulesWithPixels(FACTORY_PRESETS[0].modules),
    };
  }, []);

  const [rigName, setRigName] = useState(initialRig.name);
  const [activePresetId, setActivePresetId] = useState(initialRig.id);
  const [grid, setGrid] = useState<GridDimensions>(initialRig.grid);
  const [tabs, setTabs] = useState<SurfaceTab[]>(
    initialRig.tabs && initialRig.tabs.length > 0
      ? initialRig.tabs
      : [{ id: 'tab-3xosc', label: '3xOsc' }]
  );
  const [activeTabId, setActiveTabId] = useState<string>(
    initialRig.tabs?.[0]?.id ?? 'tab-3xosc'
  );
  const [modules, setModules] = useState<SynthModule[]>(initialRig.modules);
  const [groups, setGroups] = useState<ModuleGroup[]>(initialRig.groups ?? []);
  const [bpm, setBpm] = useState(initialRig.bpm);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialRig.modules[0]?.id ?? null
  );
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    moduleId: string;
    x: number;
    y: number;
  } | null>(null);
  const [modulationModalId, setModulationModalId] = useState<string | null>(null);
  const [modulatedValues, setModulatedValues] = useState<Record<string, number>>({});

  const [customPresets, setCustomPresets] = useState<SynthLayoutPreset[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CUSTOM_PRESETS_KEY);
      if (raw) return JSON.parse(raw) as SynthLayoutPreset[];
    } catch {
      // ignore
    }
    return [];
  });

  const allPresets = useMemo(
    () => [...customPresets, ...FACTORY_PRESETS],
    [customPresets]
  );

  useEffect(() => {
    try {
      const payload: SynthLayoutPreset = {
        id: activePresetId,
        name: rigName,
        category: '3xOsc Surface',
        description: '',
        bpm,
        grid,
        tabs,
        modules,
        groups,
        updatedAt: 'Auto-saved',
      };
      localStorage.setItem(STORAGE_RIG_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [activePresetId, rigName, bpm, grid, tabs, modules, groups]);

  const [audioEnabled, setAudioEnabled] = useState(false);
  const [transportPlaying, setTransportPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [snapshots, setSnapshots] = useState<PerformanceSnapshot[]>(INITIAL_SNAPSHOTS);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [draggingPaletteItem, setDraggingPaletteItem] =
    useState<PaletteItemDefinition | null>(null);

  const [undoStack, setUndoStack] = useState<SynthModule[][]>([]);
  const pushUndoSnapshot = useCallback((snapshot: SynthModule[]) => {
    setUndoStack((prev) => [...prev.slice(-19), structuredClone(snapshot)]);
  }, []);

  const [studioProject, setStudioProject] = useState<StudioProjectState>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_STUDIO_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StudioProjectState;
        if (parsed && Array.isArray(parsed.channels) && parsed.channels.length > 0) {
          return normalizeStudioProject(parsed);
        }
      }
    } catch {
      // fallback
    }
    return createDefaultStudioProject();
  });
  const [studioPlaying, setStudioPlaying] = useState(false);
  const [studioPlayheadStep, setStudioPlayheadStep] = useState(0);
  const [studioSongPlayBar, setStudioSongPlayBar] = useState(0);
  const [masterGain, setMasterGain] = useState<number>(() => synthEngine.state.masterGain);
  const [masterLimiter, setMasterLimiter] = useState<MasterLimiterState>(() => ({
    ...synthEngine.masterLimiter,
  }));
  const [pitoEq, setPitoEq] = useState<PitochonchoEqState>(() =>
    structuredClone(synthEngine.pitoEq)
  );

  const handleMasterGainChange = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setMasterGain(clamped);
    synthEngine.setMasterGain(clamped);
  }, []);

  const handleMasterLimiterChange = useCallback((patch: Partial<MasterLimiterState>) => {
    setMasterLimiter((prev) => {
      const next = { ...prev, ...patch };
      synthEngine.setMasterLimiter(next);
      return next;
    });
  }, []);

  const handlePitoEqChange = useCallback((next: PitochonchoEqState) => {
    setPitoEq(next);
    synthEngine.setPitochonchoEq(next);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_STUDIO_KEY, JSON.stringify(studioProject));
    } catch {
      // ignore
    }
  }, [studioProject]);

  useEffect(() => {
    synthEngine.syncMixerTracks(
      studioProject.mixerTracks ?? [],
      studioProject.masterMixer,
      Boolean(studioProject.masterMuted)
    );
  }, [
    studioProject.mixerTracks,
    studioProject.masterMixer,
    studioProject.masterMuted,
    bpm,
    audioEnabled,
  ]);

  useEffect(() => {
    synthEngine.syncStudioChannels(studioProject.channels);
  }, [studioProject.channels, audioEnabled]);

  const [midiLogs, setMidiLogs] = useState<MidiLogEntry[]>([]);
  const [midiMonitorPaused, setMidiMonitorPaused] = useState(false);
  const monitorPausedRef = useRef(false);
  monitorPausedRef.current = midiMonitorPaused;

  const [midiInputs, setMidiInputs] = useState<MidiPortInfo[]>([]);
  const [midiOutputs, setMidiOutputs] = useState<MidiPortInfo[]>([]);
  const [midiSupported, setMidiSupported] = useState(true);
  const [selectedMidiOutputId, setSelectedMidiOutputId] = useState('virtual-internal');

  useEffect(() => {
    const unsubAudio = synthEngine.subscribe(setAudioEnabled);
    const unsubPorts = midiEngine.subscribePorts((ins, outs, sup) => {
      setMidiInputs(ins);
      setMidiOutputs(outs);
      setMidiSupported(sup);
    });
    const unsubLogs = midiEngine.subscribeLogs((entry) => {
      if (monitorPausedRef.current) return;
      setMidiLogs((prev) => [entry, ...prev.slice(0, 199)]);
    });

    midiEngine.init();
    return () => {
      unsubAudio();
      unsubPorts();
      unsubLogs();
    };
  }, []);

  const syncModuleToSynth = useCallback((mod: SynthModule) => {
    if (mod.type === 'adsr') {
      synthEngine.setAdsrEnvelopes(mod.values.adsrEnvelopes, mod.values.adsr);
      synthEngine.setAdsrLfos(mod.values.adsrLfos);
      return;
    }
    if (mod.midi.synthTarget && mod.midi.synthTarget !== 'none') {
      const lfoIsActive =
        isLfoModActive(mod.lfo) || Boolean(mod.lfo?.enabled && mod.lfo?.amountSourceId);
      if (!lfoIsActive) {
        synthEngine.setParam(mod.midi.synthTarget, mod.values.primary);
      }
    }
    if (
      mod.type === 'xypad' &&
      mod.secondaryMidi?.synthTarget &&
      mod.secondaryMidi.synthTarget !== 'none' &&
      mod.values.secondary !== undefined
    ) {
      synthEngine.setParam(mod.secondaryMidi.synthTarget, mod.values.secondary);
    }
  }, []);

  useEffect(() => {
    synthEngine.setBpm(bpm);
  }, [bpm]);

  useEffect(() => {
    modules.forEach(syncModuleToSynth);
  }, [modules, syncModuleToSynth]);

  // Real-time per-component LFO modulation loop
  const modulesRef = useRef(modules);
  modulesRef.current = modules;
  const noteRetrigTimeRef = useRef<number>(performance.now());
  const lfoStartTimeRef = useRef<number>(performance.now());
  const hasActiveComponentLfo = useMemo(
    () =>
      modules.some(
        (m) =>
          Boolean(
            m.lfo &&
              m.lfo.enabled &&
              (Math.abs((m.lfo.amount ?? 0.5) - 0.5) > 0.005 || Boolean(m.lfo.amountSourceId))
          )
      ),
    [modules]
  );

  useEffect(() => {
    if (!hasActiveComponentLfo) {
      setModulatedValues({});
      return;
    }
    let raf = 0;
    let lastUiUpdate = 0;
    const tick = (now: number) => {
      const globalSec = (now - lfoStartTimeRef.current) / 1000;
      const retrigSec = (now - noteRetrigTimeRef.current) / 1000;
      const nextUi: Record<string, number> = {};
      const moduleLookup = new Map<string, SynthModule>();
      modulesRef.current.forEach((m) => moduleLookup.set(m.id, m));

      modulesRef.current.forEach((mod) => {
        if (!mod.lfo || !mod.lfo.enabled) return;
        const effLfo = resolveEffectiveLfo(mod.lfo, moduleLookup);
        if (!isLfoModActive(effLfo)) return;
        const elapsed = effLfo.global ? globalSec : retrigSec;
        const sample = evalLfoSample(effLfo, elapsed, bpm);
        const signedAmt = (effLfo.amount - 0.5) * 2;
        const base = mod.values.primary ?? 0.5;
        const modulated = Math.max(0, Math.min(1, base + sample * signedAmt));
        nextUi[mod.id] = modulated;
        if (mod.midi.synthTarget && mod.midi.synthTarget !== 'none') {
          synthEngine.setParam(mod.midi.synthTarget, modulated);
        }
      });

      if (now - lastUiUpdate >= 30) {
        lastUiUpdate = now;
        setModulatedValues(nextUi);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hasActiveComponentLfo, bpm]);

  // Master Surface Sequencer Clock (AudioContext lookahead, zero drift)
  const stepRef = useRef(0);
  const surfaceBpmRef = useRef(bpm);
  surfaceBpmRef.current = bpm;

  useEffect(() => {
    if (!transportPlaying) {
      stepRef.current = 0;
      setCurrentStep(0);
      synthEngine.allNotesOff();
      return;
    }

    let anchorTime = synthEngine.getCurrentTime() + 0.025;
    let anchorStep = 0;
    let lastBpm = surfaceBpmRef.current;
    let nextStepIndex = 0;
    const LOOKAHEAD_SEC = 0.1;

    const getStepsPerSec = (b: number) => (b / 60) * 4;

    const syncBpmAnchor = (nowAudio: number) => {
      const curBpm = surfaceBpmRef.current;
      if (curBpm !== lastBpm) {
        if (nowAudio > anchorTime) {
          anchorStep += (nowAudio - anchorTime) * getStepsPerSec(lastBpm);
          anchorTime = nowAudio;
        }
        lastBpm = curBpm;
      }
    };

    const timeAtStep = (s: number) => anchorTime + (s - anchorStep) / getStepsPerSec(lastBpm);
    const stepAtTime = (t: number) => anchorStep + (t - anchorTime) * getStepsPerSec(lastBpm);

    const scheduleLookahead = () => {
      const nowAudio = synthEngine.getCurrentTime();
      syncBpmAnchor(nowAudio);
      const horizonTime = nowAudio + LOOKAHEAD_SEC;
      const stepSec = 1 / getStepsPerSec(lastBpm);

      while (timeAtStep(nextStepIndex) < horizonTime) {
        const stepIdx = nextStepIndex;
        const onTime = Math.max(nowAudio, timeAtStep(stepIdx));
        const offTime = onTime + Math.max(0.03, stepSec * 0.72);

        modulesRef.current.forEach((mod) => {
          if (mod.type !== 'sequencer') return;
          const count = mod.config.steps ?? 8;
          const idx = stepIdx % count;
          const step = mod.values.seqSteps?.[idx];
          if (step && step.active) {
            const baseNote = mod.midi.ccNumber || 48;
            const note = Math.max(0, Math.min(127, baseNote + step.noteOffset));
            const vel = Math.round(step.velocity * 115);

            if (mod.midi.enabled) {
              const delayMs = Math.max(0, (onTime - nowAudio) * 1000);
              window.setTimeout(() => {
                midiEngine.sendNoteOn(mod.label, mod.midi.channel, note, vel);
                window.setTimeout(() => {
                  midiEngine.sendNoteOff(mod.label, mod.midi.channel, note);
                }, Math.max(30, (offTime - onTime) * 1000));
              }, delayMs);
            }

            if (synthEngine.isEnabled()) {
              synthEngine.noteOn(note, step.velocity, onTime);
              synthEngine.noteOff(note, false, offTime);
            }
          }
        });

        nextStepIndex++;
      }
    };

    scheduleLookahead();
    const timer = window.setInterval(scheduleLookahead, 20);

    let rafId = 0;
    const updateVisualStep = () => {
      const nowAudio = synthEngine.getCurrentTime();
      syncBpmAnchor(nowAudio);
      const cur = Math.max(0, Math.floor(stepAtTime(nowAudio)));
      if (cur !== stepRef.current) {
        stepRef.current = cur;
        setCurrentStep(cur);
      }
      rafId = window.requestAnimationFrame(updateVisualStep);
    };
    rafId = window.requestAnimationFrame(updateVisualStep);

    return () => {
      window.clearInterval(timer);
      window.cancelAnimationFrame(rafId);
      synthEngine.allNotesOff();
    };
  }, [transportPlaying]);

  // FL Studio Channel Rack & Piano Roll Looping Pattern / Song Scheduler (Sample-accurate AudioContext lookahead)
  const studioProjectRef = useRef(studioProject);
  studioProjectRef.current = studioProject;
  const studioBpmRef = useRef(bpm);
  studioBpmRef.current = bpm;

  useEffect(() => {
    if (!studioPlaying) {
      setStudioPlayheadStep(0);
      setStudioSongPlayBar(0);
      synthEngine.allChannelsNotesOff();
      return;
    }

    const LOOKAHEAD_SEC = 0.12;
    let anchorTime = synthEngine.getCurrentTime() + 0.03;
    let anchorStep = 0;
    let lastBpm = studioBpmRef.current;
    let scheduledUntilStep = 0;

    const getStepsPerSec = (b: number) => (b / 60) * 4;

    const syncBpmAnchor = (nowAudio: number) => {
      const curBpm = studioBpmRef.current;
      if (curBpm !== lastBpm) {
        if (nowAudio > anchorTime) {
          anchorStep += (nowAudio - anchorTime) * getStepsPerSec(lastBpm);
          anchorTime = nowAudio;
        }
        lastBpm = curBpm;
      }
    };

    const stepAtTime = (t: number) => anchorStep + (t - anchorTime) * getStepsPerSec(lastBpm);
    const timeAtStep = (s: number) => anchorTime + (s - anchorStep) / getStepsPerSec(lastBpm);

    const schedulePatternCycle = (
      proj: StudioProjectState,
      pat: StudioProjectState['patterns'][number],
      cycleBaseGlobal: number,
      maxGlobalEnd: number,
      winStart: number,
      winEnd: number
    ) => {
      const len = Math.max(16, pat.stepsCount || 16);
      const swingSteps = (proj.swing || 0) * 0.45;
      const audioActive = synthEngine.isEnabled();
      if (!audioActive) return;

      proj.channels.forEach((ch) => {
        const notes = pat.notes[ch.id] ?? [];
        if (notes.length > 0) {
          notes.forEach((n) => {
            const baseIdx = Math.floor(n.startStep);
            const rawSwung = n.startStep + (baseIdx % 2 === 1 ? swingSteps : 0);
            const swungInPat = ((rawSwung % len) + len) % len;
            const globalOnStep = cycleBaseGlobal + swungInPat;
            if (
              globalOnStep >= winStart &&
              globalOnStep < winEnd &&
              globalOnStep < maxGlobalEnd
            ) {
              const durSteps = Math.max(0.15, Math.min(len, n.durationSteps));
              const onTime = timeAtStep(globalOnStep);
              const offTime = Math.max(
                onTime + 0.02,
                timeAtStep(globalOnStep + durSteps) - 0.003
              );
              synthEngine.channelNoteOn(ch.id, n.pitch, n.velocity, onTime);
              synthEngine.channelNoteOff(ch.id, n.pitch, false, offTime);
            }
          });
          return;
        }

        const bools = pat.steps[ch.id] ?? [];
        for (let stepIdx = 0; stepIdx < len; stepIdx++) {
          if (!bools[stepIdx]) continue;
          const swungInPat = stepIdx + (stepIdx % 2 === 1 ? swingSteps : 0);
          const globalOnStep = cycleBaseGlobal + swungInPat;
          if (
            globalOnStep >= winStart &&
            globalOnStep < winEnd &&
            globalOnStep < maxGlobalEnd
          ) {
            const onTime = timeAtStep(globalOnStep);
            const offTime = Math.max(onTime + 0.02, timeAtStep(globalOnStep + 0.85));
            synthEngine.channelNoteOn(ch.id, ch.rootNote, 0.85, onTime);
            synthEngine.channelNoteOff(ch.id, ch.rootNote, false, offTime);
          }
        }
      });
    };

    const runScheduler = () => {
      const nowAudio = synthEngine.getCurrentTime();
      syncBpmAnchor(nowAudio);

      const proj = studioProjectRef.current;
      const activePat =
        proj.patterns.find((p) => p.id === proj.activePatternId) ?? proj.patterns[0];
      if (!activePat) return;

      const horizonStep = stepAtTime(nowAudio + LOOKAHEAD_SEC);
      if (horizonStep <= scheduledUntilStep) return;

      const winStart = scheduledUntilStep;
      const winEnd = horizonStep;

      if (!proj.songMode || proj.playlistClips.length === 0) {
        const loopLen = Math.max(16, activePat.stepsCount || 16);
        const kStart = Math.max(0, Math.floor(winStart / loopLen));
        const kEnd = Math.floor(winEnd / loopLen);
        for (let k = kStart; k <= kEnd; k++) {
          const cycleBase = k * loopLen;
          schedulePatternCycle(
            proj,
            activePat,
            cycleBase,
            cycleBase + loopLen,
            winStart,
            winEnd
          );
        }
      } else {
        const songBars = Math.max(
          1,
          ...proj.playlistClips.map((c) => c.startBar + c.lengthBars)
        );
        const songLenSteps = songBars * 16;
        const kStart = Math.max(0, Math.floor(winStart / songLenSteps));
        const kEnd = Math.floor(winEnd / songLenSteps);

        for (let k = kStart; k <= kEnd; k++) {
          const songBase = k * songLenSteps;
          proj.playlistClips.forEach((clip) => {
            const clipPat = proj.patterns.find((p) => p.id === clip.patternId);
            if (!clipPat) return;
            const clipStartGlobal = songBase + clip.startBar * 16;
            const clipEndGlobal = songBase + (clip.startBar + clip.lengthBars) * 16;
            if (clipEndGlobal <= winStart || clipStartGlobal >= winEnd) return;

            const patLen = Math.max(16, clipPat.stepsCount || 16);
            const repeats = Math.ceil((clip.lengthBars * 16) / patLen);
            for (let r = 0; r < repeats; r++) {
              const patBase = clipStartGlobal + r * patLen;
              schedulePatternCycle(
                proj,
                clipPat,
                patBase,
                Math.min(clipEndGlobal, patBase + patLen),
                winStart,
                winEnd
              );
            }
          });
        }
      }

      scheduledUntilStep = winEnd;
    };

    runScheduler();
    const timer = window.setInterval(runScheduler, 20);

    let rafId = 0;
    const updateVisualPlayhead = () => {
      const nowAudio = synthEngine.getCurrentTime();
      syncBpmAnchor(nowAudio);
      const proj = studioProjectRef.current;
      const activePat =
        proj.patterns.find((p) => p.id === proj.activePatternId) ?? proj.patterns[0];
      if (activePat) {
        const curGlobalStep = Math.max(0, stepAtTime(nowAudio));
        if (!proj.songMode || proj.playlistClips.length === 0) {
          const loopLen = Math.max(16, activePat.stepsCount || 16);
          setStudioPlayheadStep(curGlobalStep % loopLen);
        } else {
          const songBars = Math.max(
            1,
            ...proj.playlistClips.map((c) => c.startBar + c.lengthBars)
          );
          const songLenSteps = songBars * 16;
          const curSongStep = curGlobalStep % songLenSteps;
          setStudioSongPlayBar(curSongStep / 16);
          const activeLen = Math.max(16, activePat.stepsCount || 16);
          setStudioPlayheadStep(curSongStep % activeLen);
        }
      }
      rafId = window.requestAnimationFrame(updateVisualPlayhead);
    };
    rafId = window.requestAnimationFrame(updateVisualPlayhead);

    return () => {
      window.clearInterval(timer);
      window.cancelAnimationFrame(rafId);
      synthEngine.allChannelsNotesOff();
    };
  }, [studioPlaying]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && performMode) {
        setPerformMode(false);
        return;
      }

      const target = e.target as HTMLElement | null;
      const isEditingField = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
      );
      if (isEditingField) return;

      // Ctrl+Z / Cmd+Z Undo on Surface Canvas
      if (
        view === 'canvas' &&
        !performMode &&
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'z'
      ) {
        if (undoStack.length > 0) {
          e.preventDefault();
          const prevSnapshot = undoStack[undoStack.length - 1];
          setUndoStack((s) => s.slice(0, -1));
          setModules(prevSnapshot);
          setSelectedId(null);
          setMultiSelectedIds([]);
        }
        return;
      }

      // Spacebar Play/Stop in Channel Rack & Piano Roll Studio
      if (e.code === 'Space' && view === 'studio') {
        e.preventDefault();
        if (!studioPlaying && !audioEnabled) {
          void synthEngine.ensureStarted().then(() => {
            synthEngine.syncStudioChannels(studioProjectRef.current.channels);
          });
        }
        setStudioPlaying((p) => !p);
        return;
      }

      // Delete / Supr key to delete selected controller(s) on Surface Canvas
      if (
        e.key === 'Delete' &&
        view === 'canvas' &&
        !performMode &&
        !contextMenu &&
        !modulationModalId
      ) {
        const idsToDelete =
          multiSelectedIds.length > 0
            ? multiSelectedIds
            : selectedId
              ? [selectedId]
              : [];
        if (idsToDelete.length > 0) {
          e.preventDefault();
          pushUndoSnapshot(modules);
          const delSet = new Set(idsToDelete);
          setModules((prev) => prev.filter((m) => !delSet.has(m.id)));
          setSelectedId(null);
          setMultiSelectedIds([]);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    performMode,
    view,
    studioPlaying,
    audioEnabled,
    contextMenu,
    modulationModalId,
    selectedId,
    multiSelectedIds,
    modules,
    undoStack,
    pushUndoSnapshot,
  ]);

  const handleToggleAudio = async () => {
    await synthEngine.toggle();
    modules.forEach(syncModuleToSynth);
    synthEngine.syncMixerTracks(
      studioProject.mixerTracks ?? [],
      studioProject.masterMixer,
      Boolean(studioProject.masterMuted)
    );
    synthEngine.syncStudioChannels(studioProject.channels);
  };

  const handleToggleTransport = async () => {
    if (!transportPlaying && !audioEnabled) {
      await synthEngine.ensureStarted();
    }
    setTransportPlaying((p) => !p);
  };

  const handleToggleStudioPlay = async () => {
    if (!studioPlaying && !audioEnabled) {
      await synthEngine.ensureStarted();
      synthEngine.syncMixerTracks(
        studioProject.mixerTracks ?? [],
        studioProject.masterMixer,
        Boolean(studioProject.masterMuted)
      );
      synthEngine.syncStudioChannels(studioProject.channels);
    }
    setStudioPlaying((p) => !p);
  };

  const handleSelectModule = (id: string | null, shiftKey = false) => {
    if (!id) {
      setSelectedId(null);
      setMultiSelectedIds([]);
      return;
    }
    if (shiftKey) {
      setMultiSelectedIds((prev) => {
        const base = prev.length === 0 && selectedId ? [selectedId] : prev;
        if (base.includes(id)) {
          return base.filter((x) => x !== id);
        }
        return [...base, id];
      });
      setSelectedId(id);
    } else {
      setSelectedId(id);
      setMultiSelectedIds([id]);
    }
  };

  const handleSelectTab = (tabId: string) => {
    setActiveTabId(tabId);
    setSelectedId(null);
    setMultiSelectedIds([]);
    setContextMenu(null);
  };

  const handleAddTab = () => {
    const newId = `tab-${Date.now().toString(36)}`;
    const newLabel = `Pane ${tabs.length + 1}`;
    setTabs((prev) => [...prev, { id: newId, label: newLabel }]);
    setActiveTabId(newId);
    setSelectedId(null);
    setMultiSelectedIds([]);
  };

  const handleRenameTab = (tabId: string, label: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, label } : t)));
  };

  const handleDeleteTab = (tabId: string) => {
    if (tabs.length <= 1) return;
    const remaining = tabs.filter((t) => t.id !== tabId);
    setTabs(remaining);
    setModules((prev) => prev.filter((m) => (m.tabId ?? tabs[0].id) !== tabId));
    if (activeTabId === tabId) {
      setActiveTabId(remaining[0].id);
    }
    setSelectedId(null);
    setMultiSelectedIds([]);
  };

  const handleAddFromPalette = (def: PaletteItemDefinition) => {
    const pw = Math.max(76, def.defaultW * BASE_CELL_W - BASE_GAP);
    const ph = Math.max(62, def.defaultH * BASE_CELL_H - BASE_GAP);
    const fallbackTabId = tabs[0]?.id ?? 'tab-3xosc';
    const tabModules = modules.filter((m) => (m.tabId ?? fallbackTabId) === activeTabId);
    const slot = findOpenPixelSlot(pw, ph, tabModules);
    const mod = createModuleFromPalette(def, 0, 0, slot.px, slot.py, activeTabId);
    setModules((prev) => [...prev, mod]);
    setSelectedId(mod.id);
    setMultiSelectedIds([mod.id]);
  };

  const handleDropNewModule = (def: PaletteItemDefinition, px: number, py: number) => {
    const mod = createModuleFromPalette(def, 0, 0, px, py, activeTabId);
    setModules((prev) => [...prev, mod]);
    setSelectedId(mod.id);
    setMultiSelectedIds([mod.id]);
  };

  const handleMoveModule = useCallback((id: string, px: number, py: number) => {
    setModules((prev) =>
      prev.map((m) => (m.id === id ? { ...m, px, py } : m))
    );
  }, []);

  const handleMoveGroup = useCallback((groupId: string, dx: number, dy: number) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.groupId !== groupId) return m;
        const r = getModulePixelRect(m);
        return {
          ...m,
          px: Math.max(0, r.px + dx),
          py: Math.max(24, r.py + dy),
        };
      })
    );
  }, []);

  const handleResizeModule = useCallback((id: string, pw: number, ph: number) => {
    setModules((prev) =>
      prev.map((m) => (m.id === id ? { ...m, pw, ph } : m))
    );
  }, []);

  const handleDeleteModule = (id: string) => {
    pushUndoSnapshot(modules);
    setModules((prev) => prev.filter((m) => m.id !== id));
    setMultiSelectedIds((prev) => prev.filter((x) => x !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleUndoModules = () => {
    if (undoStack.length === 0) return;
    const prevSnapshot = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setModules(prevSnapshot);
    setSelectedId(null);
    setMultiSelectedIds([]);
  };

  const handleClearBoard = () => {
    pushUndoSnapshot(modules);
    synthEngine.allNotesOff();
    const fallbackTabId = tabs[0]?.id ?? 'tab-3xosc';
    setModules((prev) => prev.filter((m) => (m.tabId ?? fallbackTabId) !== activeTabId));
    setSelectedId(null);
    setMultiSelectedIds([]);
    setCompactMode(false);
    setContextMenu(null);
  };

  const handleDuplicateModule = (id: string) => {
    const source = modules.find((m) => m.id === id);
    if (!source) return;
    const rect = getModulePixelRect(source);
    const targetTabId = source.tabId ?? activeTabId;
    const fallbackTabId = tabs[0]?.id ?? 'tab-3xosc';
    const tabModules = modules.filter((m) => (m.tabId ?? fallbackTabId) === targetTabId);
    const slot = findOpenPixelSlot(rect.pw, rect.ph, tabModules);
    const clone: SynthModule = {
      ...source,
      id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tabId: targetTabId,
      label: `${source.label} Copy`,
      px: slot.px,
      py: slot.py,
      pw: rect.pw,
      ph: rect.ph,
      groupId: undefined,
      midi: { ...source.midi },
      secondaryMidi: source.secondaryMidi ? { ...source.secondaryMidi } : undefined,
      config: { ...source.config },
      lfo: source.lfo ? { ...source.lfo } : undefined,
      values: {
        ...source.values,
        adsr: source.values.adsr ? { ...source.values.adsr } : undefined,
        adsrEnvelopes: source.values.adsrEnvelopes
          ? structuredClone(source.values.adsrEnvelopes)
          : undefined,
        adsrLfos: source.values.adsrLfos
          ? structuredClone(source.values.adsrLfos)
          : undefined,
        seqSteps: source.values.seqSteps
          ? source.values.seqSteps.map((s) => ({ ...s }))
          : undefined,
      },
    };
    setModules((prev) => [...prev, clone]);
    setSelectedId(clone.id);
    setMultiSelectedIds([clone.id]);
  };

  const handleGlueSelected = () => {
    if (multiSelectedIds.length < 2) return;
    const groupId = `grp-${Date.now()}`;
    const newGroup: ModuleGroup = {
      id: groupId,
      name: `Rack ${groups.length + 1}`,
      accent: 'amber',
      compact: true,
    };

    setModules((prev) => {
      const selected = prev.filter((m) => multiSelectedIds.includes(m.id));
      const rects = selected.map((m) => ({ m, r: getModulePixelRect(m) }));
      const anchorX = Math.min(...rects.map((x) => x.r.px));
      const anchorY = Math.max(28, Math.min(...rects.map((x) => x.r.py)));

      const sorted = [...rects].sort((a, b) => a.r.py - b.r.py || a.r.px - b.r.px);
      let curX = anchorX;
      let curY = anchorY;
      let rowMaxH = 0;
      const maxRowW = 680;
      const gap = 4;

      const packedMap = new Map<string, SynthModule>();
      sorted.forEach(({ m, r }) => {
        if (curX > anchorX && curX + r.pw - anchorX > maxRowW) {
          curX = anchorX;
          curY += rowMaxH + gap;
          rowMaxH = 0;
        }
        packedMap.set(m.id, {
          ...m,
          px: curX,
          py: curY,
          pw: r.pw,
          ph: r.ph,
          groupId,
        });
        curX += r.pw + gap;
        rowMaxH = Math.max(rowMaxH, r.ph);
      });

      return prev.map((m) => packedMap.get(m.id) ?? m);
    });

    setGroups((prev) => [...prev, newGroup]);
    setCompactMode(true);
  };

  const handleGlueAllCompact = () => {
    const groupId = `grp-master-${Date.now()}`;
    const activeTabObj = tabs.find((t) => t.id === activeTabId);
    const fallbackTabId = tabs[0]?.id ?? 'tab-3xosc';
    const masterGroup: ModuleGroup = {
      id: groupId,
      name: `${activeTabObj?.label ?? '3xOsc'} Rack`,
      accent: 'amber',
      compact: true,
    };

    setModules((prev) => {
      const onTab = prev.filter((m) => (m.tabId ?? fallbackTabId) === activeTabId);
      const offTab = prev.filter((m) => (m.tabId ?? fallbackTabId) !== activeTabId);
      const withRects = onTab.map((m) => ({ m, r: getModulePixelRect(m) }));
      const sorted = [...withRects].sort((a, b) => a.r.py - b.r.py || a.r.px - b.r.px);

      let curX = 24;
      let curY = 40;
      let rowMaxH = 0;
      const maxRowW = 920;
      const gap = 4;

      const packed = sorted.map(({ m, r }) => {
        const compactPh = m.type === 'knob' ? Math.min(r.ph, 70) : r.ph;
        if (curX > 24 && curX + r.pw - 24 > maxRowW) {
          curX = 24;
          curY += rowMaxH + gap;
          rowMaxH = 0;
        }
        const placed: SynthModule = {
          ...m,
          px: curX,
          py: curY,
          pw: r.pw,
          ph: compactPh,
          groupId,
        };
        curX += r.pw + gap;
        rowMaxH = Math.max(rowMaxH, compactPh);
        return placed;
      });
      return [...offTab, ...packed];
    });

    setGroups((prev) => [...prev, masterGroup]);
    setCompactMode(true);
  };

  const handleUngroup = (groupId: string) => {
    const remainingGroups = groups.filter((g) => g.id !== groupId);
    setGroups(remainingGroups);
    setModules((prev) =>
      prev.map((m) => (m.groupId === groupId ? { ...m, groupId: undefined } : m))
    );
    if (remainingGroups.length === 0) {
      setCompactMode(false);
    }
  };

  const handleRemoveFromGroup = (moduleId: string) => {
    setModules((prev) =>
      prev.map((m) => (m.id === moduleId ? { ...m, groupId: undefined } : m))
    );
  };

  const handleUpdateModule = (
    id: string,
    updater: (prev: SynthModule) => SynthModule
  ) => {
    setModules((prev) => prev.map((m) => (m.id === id ? updater(m) : m)));
  };

  const handleModuleValueChange = (id: string, patch: Partial<ModuleValues>) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const nextValues: ModuleValues = { ...m.values, ...patch };
        const updated: SynthModule = { ...m, values: nextValues };

        if (m.type === 'adsr' && patch.adsr) {
          midiEngine.sendMappedControl(`${m.label} Attack`, m.midi, patch.adsr.attack);
        } else {
          if (patch.primary !== undefined) {
            midiEngine.sendMappedControl(m.label, m.midi, patch.primary);
          }
          if (patch.secondary !== undefined && m.secondaryMidi) {
            midiEngine.sendMappedControl(
              `${m.label} Y`,
              m.secondaryMidi,
              patch.secondary
            );
          }
        }
        syncModuleToSynth(updated);
        return updated;
      })
    );
  };

  const handleModuleLfoChange = useCallback((id: string, lfo: ComponentLfoConfig) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const updated: SynthModule = { ...m, lfo };
        if (!isLfoModActive(lfo) && m.midi.synthTarget && m.midi.synthTarget !== 'none') {
          synthEngine.setParam(m.midi.synthTarget, m.values.primary);
        }
        return updated;
      })
    );
  }, []);

  const handleDeleteModulation = useCallback((id: string) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        if (m.midi.synthTarget && m.midi.synthTarget !== 'none') {
          synthEngine.setParam(m.midi.synthTarget, m.values.primary);
        }
        return { ...m, lfo: undefined };
      })
    );
  }, []);

  const handleTriggerNote = async (
    mod: SynthModule,
    note: number,
    velocity: number,
    isOn: boolean
  ) => {
    if (isOn) {
      noteRetrigTimeRef.current = performance.now();
      if (!audioEnabled) {
        await synthEngine.ensureStarted();
      }
      if (mod.midi.enabled) {
        midiEngine.sendNoteOn(mod.label, mod.midi.channel, note, velocity);
      }
      if (mod.midi.synthTarget !== 'none') {
        synthEngine.noteOn(note, velocity / 127);
      }
    } else {
      if (mod.midi.enabled) {
        midiEngine.sendNoteOff(mod.label, mod.midi.channel, note);
      }
      synthEngine.noteOff(note);
    }
  };

  const handleTriggerDrum = async (
    mod: SynthModule,
    padIdx: number,
    note: number,
    velocity: number,
    isOn: boolean
  ) => {
    if (isOn) {
      if (!audioEnabled) {
        await synthEngine.ensureStarted();
      }
      if (mod.midi.enabled) {
        midiEngine.sendNoteOn(mod.label, mod.midi.channel, note, velocity);
      }
      if (mod.midi.synthTarget !== 'none') {
        synthEngine.triggerDrum(padIdx, velocity / 127);
      }
    } else if (mod.midi.enabled) {
      midiEngine.sendNoteOff(mod.label, mod.midi.channel, note);
    }
  };

  const handleStoreSnapshot = (id: PerformanceSnapshot['id']) => {
    const stateMap: Record<string, ModuleValues> = {};
    modules.forEach((m) => {
      stateMap[m.id] = {
        ...m.values,
        adsr: m.values.adsr ? { ...m.values.adsr } : undefined,
        adsrEnvelopes: m.values.adsrEnvelopes
          ? structuredClone(m.values.adsrEnvelopes)
          : undefined,
        adsrLfos: m.values.adsrLfos
          ? structuredClone(m.values.adsrLfos)
          : undefined,
        seqSteps: m.values.seqSteps ? m.values.seqSteps.map((s) => ({ ...s })) : undefined,
      };
    });
    setSnapshots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, stored: true, moduleStates: stateMap } : s))
    );
    setActiveSnapshotId(id);
  };

  const handleRecallSnapshot = (id: PerformanceSnapshot['id']) => {
    const snap = snapshots.find((s) => s.id === id);
    if (!snap || !snap.stored) return;
    setModules((prev) =>
      prev.map((m) => {
        const saved = snap.moduleStates[m.id];
        if (!saved) return m;
        const next: SynthModule = {
          ...m,
          values: {
            ...saved,
            adsr: saved.adsr ? { ...saved.adsr } : undefined,
            adsrEnvelopes: saved.adsrEnvelopes
              ? structuredClone(saved.adsrEnvelopes)
              : undefined,
            adsrLfos: saved.adsrLfos
              ? structuredClone(saved.adsrLfos)
              : undefined,
            seqSteps: saved.seqSteps ? saved.seqSteps.map((s) => ({ ...s })) : undefined,
          },
        };
        if (m.midi.enabled && m.type !== 'scope' && m.type !== 'keyboard' && m.type !== 'pads') {
          midiEngine.sendMappedControl(m.label, m.midi, next.values.primary);
          if (m.secondaryMidi && next.values.secondary !== undefined) {
            midiEngine.sendMappedControl(`${m.label} Y`, m.secondaryMidi, next.values.secondary);
          }
        }
        return next;
      })
    );
    setActiveSnapshotId(id);
  };

  const handleLoadPreset = (preset: SynthLayoutPreset) => {
    setActivePresetId(preset.id);
    setRigName(preset.name);
    setGrid(preset.grid);
    setBpm(preset.bpm);
    const nextTabs =
      preset.tabs && preset.tabs.length > 0
        ? preset.tabs
        : [{ id: 'tab-1', label: 'Surface 1' }];
    setTabs(nextTabs);
    setActiveTabId(nextTabs[0].id);
    setGroups(preset.groups ?? []);
    const hydrated = hydrateModulesWithPixels(
      preset.modules.map((m) => ({
        ...m,
        tabId: m.tabId ?? nextTabs[0].id,
        midi: { ...m.midi },
        config: { ...m.config },
        lfo: m.lfo ? { ...m.lfo } : undefined,
        values: {
          ...m.values,
          adsr: m.values.adsr ? { ...m.values.adsr } : undefined,
          adsrEnvelopes: m.values.adsrEnvelopes
            ? structuredClone(m.values.adsrEnvelopes)
            : undefined,
          adsrLfos: m.values.adsrLfos
            ? structuredClone(m.values.adsrLfos)
            : undefined,
        },
      }))
    );
    setModules(hydrated);
    setSelectedId(hydrated[0]?.id ?? null);
    setMultiSelectedIds([]);
    setSnapshots(INITIAL_SNAPSHOTS);
    setActiveSnapshotId(null);
    setView('canvas');
  };

  const handleSaveCustomRig = (name: string, category: string) => {
    const newPreset: SynthLayoutPreset = {
      id: `custom-${Date.now()}`,
      name,
      category,
      description: `Custom freeform surface with ${modules.length} modular controllers.`,
      bpm,
      grid,
      tabs,
      modules: modules.map((m) => ({ ...m })),
      groups,
      isFactory: false,
      updatedAt: new Date().toLocaleDateString(),
    };
    const next = [newPreset, ...customPresets];
    setCustomPresets(next);
    setRigName(name);
    setActivePresetId(newPreset.id);
    try {
      localStorage.setItem(STORAGE_CUSTOM_PRESETS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleDeleteCustomPreset = (id: string) => {
    const next = customPresets.filter((p) => p.id !== id);
    setCustomPresets(next);
    try {
      localStorage.setItem(STORAGE_CUSTOM_PRESETS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleExportJson = () => {
    const payload: SynthLayoutPreset = {
      id: activePresetId,
      name: rigName,
      category: 'Exported Rig',
      description: 'PatchGrid 3xOsc synth surface',
      bpm,
      grid,
      tabs,
      modules,
      groups,
      updatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rigName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.patchgrid.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (jsonText: string): { ok: boolean; error?: string } => {
    try {
      const parsed = JSON.parse(jsonText) as SynthLayoutPreset;
      if (!parsed || !Array.isArray(parsed.modules)) {
        return { ok: false, error: 'Missing required modules array in JSON file.' };
      }
      handleLoadPreset({
        ...parsed,
        id: `imported-${Date.now()}`,
        name: parsed.name || 'Imported Rig',
        grid: parsed.grid || { cols: 12, rows: 8 },
        bpm: parsed.bpm || 120,
      });
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not parse JSON file.' };
    }
  };

  const contextMenuModule = useMemo(
    () => (contextMenu ? modules.find((m) => m.id === contextMenu.moduleId) ?? null : null),
    [contextMenu, modules]
  );

  const contextMenuGroup = useMemo(
    () =>
      contextMenuModule?.groupId
        ? groups.find((g) => g.id === contextMenuModule.groupId)
        : undefined,
    [contextMenuModule, groups]
  );

  const modulationModalModule = useMemo(
    () =>
      modulationModalId
        ? modules.find((m) => m.id === modulationModalId) ?? null
        : null,
    [modulationModalId, modules]
  );

  const navItems: { id: WorkspaceView; label: string }[] = [
    { id: 'canvas', label: 'Surface Canvas' },
    { id: 'studio', label: 'Channel Rack' },
    { id: 'matrix', label: 'MIDI Matrix' },
    { id: 'presets', label: 'Presets & Palettes' },
    { id: 'monitor', label: 'MIDI Monitor' },
  ];

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--pg-canvas)', color: 'var(--pg-text)' }}
    >
      {/* Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (4 Navigation Links) — Zone 3 (1 Primary CTA) */}
      <header
        className="h-13 px-5 flex items-center justify-between gap-8 shrink-0"
        style={{
          backgroundColor: 'var(--pg-surface)',
          borderBottom: '1px solid var(--pg-border)',
        }}
      >
        <span
          className="text-base font-bold tracking-tight whitespace-nowrap shrink-0"
          style={{ color: 'var(--pg-text)' }}
        >
          PatchGrid
        </span>

        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setView(item.id);
                  if (item.id !== 'canvas' && performMode) setPerformMode(false);
                }}
                className="text-xs font-medium whitespace-nowrap shrink-0 py-1 transition-colors"
                style={{
                  color: active ? 'var(--pg-primary)' : 'var(--pg-text-muted)',
                  borderBottom: active ? '2px solid var(--pg-primary)' : '2px solid transparent',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => {
              if (view !== 'canvas') setView('canvas');
              setPerformMode((p) => !p);
            }}
            className="px-4 py-1.5 rounded text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
            style={{
              backgroundColor: performMode ? 'var(--pg-secondary)' : 'var(--pg-primary)',
              color: 'var(--pg-primary-text)',
            }}
          >
            {performMode ? 'Exit Perform' : 'Perform Mode'}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Fallback */}
      <div
        className="flex md:hidden items-center gap-4 px-4 py-2 overflow-x-auto shrink-0"
        style={{
          backgroundColor: 'var(--pg-surface)',
          borderBottom: '1px solid var(--pg-border)',
        }}
      >
        {navItems.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className="text-xs font-medium whitespace-nowrap shrink-0"
              style={{ color: active ? 'var(--pg-primary)' : 'var(--pg-text-muted)' }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Main Workspace Viewport */}
      <main className="flex-1 flex min-h-0 overflow-hidden">
        {view === 'canvas' && (
          <>
            {!performMode &&
              (!paletteCollapsed ? (
                <>
                  <PaletteSidebar
                    widthPx={paletteWidthPx}
                    onCollapse={() => setPaletteCollapsed(true)}
                    onAddModule={handleAddFromPalette}
                    onDragStartItem={setDraggingPaletteItem}
                    onDragEndItem={() => setDraggingPaletteItem(null)}
                  />
                  <div
                    onPointerDown={(e) => {
                      if ((e.target as HTMLElement).closest('button')) return;
                      e.preventDefault();
                      setResizingPalette(true);
                    }}
                    onDoubleClick={() => setPaletteWidthPx(260)}
                    title="Drag to resize Controller Palette · Double-click to reset"
                    className="w-2 shrink-0 flex flex-col items-center justify-center gap-2 cursor-col-resize select-none"
                    style={{
                      backgroundColor: resizingPalette
                        ? `${activePalette.colors.primary}26`
                        : 'var(--pg-panel)',
                      borderRight: '1px solid var(--pg-border-strong)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setPaletteCollapsed(true)}
                      title="Collapse Controller Palette"
                      className="w-4 h-6 rounded flex items-center justify-center hover:bg-white/10"
                      style={{ color: 'var(--pg-text-muted)' }}
                    >
                      <ChevronLeft size={11} />
                    </button>
                    <div
                      className="w-1 h-10 rounded-full"
                      style={{
                        backgroundColor: resizingPalette
                          ? activePalette.colors.primary
                          : 'var(--pg-border-strong)',
                      }}
                    />
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setPaletteCollapsed(false)}
                  title="Expand Controller Palette"
                  className="w-6 shrink-0 flex flex-col items-center justify-center gap-2 hover:bg-white/5 transition-colors"
                  style={{
                    backgroundColor: 'var(--pg-panel)',
                    borderRight: '1px solid var(--pg-border-strong)',
                    color: 'var(--pg-text-muted)',
                  }}
                >
                  <ChevronRight size={13} style={{ color: activePalette.colors.primary }} />
                  <span
                    className="text-[9px] font-mono tracking-widest uppercase"
                    style={{ writingMode: 'vertical-rl' }}
                  >
                    Palette
                  </span>
                </button>
              ))}

            <SurfaceCanvas
              rigName={rigName}
              tabs={tabs}
              activeTabId={activeTabId}
              modules={modules}
              groups={groups}
              selectedId={selectedId}
              multiSelectedIds={multiSelectedIds}
              compactMode={compactMode}
              performMode={performMode}
              palette={activePalette}
              audioEnabled={audioEnabled}
              bpm={bpm}
              transportPlaying={transportPlaying}
              currentStep={currentStep}
              snapshots={snapshots}
              activeSnapshotId={activeSnapshotId}
              draggingPaletteItem={draggingPaletteItem}
              modulatedValues={modulatedValues}
              onSelectTab={handleSelectTab}
              onAddTab={handleAddTab}
              onRenameTab={handleRenameTab}
              onDeleteTab={handleDeleteTab}
              onSelectModule={handleSelectModule}
              onOpenContextMenu={(moduleId, x, y) => setContextMenu({ moduleId, x, y })}
              onDropNewModule={handleDropNewModule}
              onMoveModule={handleMoveModule}
              onMoveGroup={handleMoveGroup}
              onResizeModule={handleResizeModule}
              onDeleteModule={handleDeleteModule}
              onDuplicateModule={handleDuplicateModule}
              onModuleValueChange={handleModuleValueChange}
              onModuleLfoChange={handleModuleLfoChange}
              onTriggerNote={handleTriggerNote}
              onTriggerDrum={handleTriggerDrum}
              onChangePalette={setPaletteId}
              onToggleAudio={handleToggleAudio}
              onToggleTransport={handleToggleTransport}
              onChangeBpm={setBpm}
              onRecallSnapshot={handleRecallSnapshot}
              onStoreSnapshot={handleStoreSnapshot}
              onToggleCompactMode={() => setCompactMode((c) => !c)}
              onGlueSelected={handleGlueSelected}
              onGlueAllCompact={handleGlueAllCompact}
              onUngroup={handleUngroup}
              onClearBoard={handleClearBoard}
              canUndo={undoStack.length > 0}
              onUndo={handleUndoModules}
            />

            {contextMenu && contextMenuModule && (
              <ControllerContextMenu
                module={contextMenuModule}
                allModules={modules}
                group={contextMenuGroup}
                palette={activePalette}
                bpm={bpm}
                x={contextMenu.x}
                y={contextMenu.y}
                onClose={() => setContextMenu(null)}
                onUpdateModule={handleUpdateModule}
                onValueChange={handleModuleValueChange}
                onUpdateLfo={handleModuleLfoChange}
                onOpenModulation={(id) => setModulationModalId(id)}
                onDeleteModulation={handleDeleteModulation}
                onDuplicateModule={handleDuplicateModule}
                onDeleteModule={handleDeleteModule}
                onRemoveFromGroup={handleRemoveFromGroup}
              />
            )}

            {modulationModalModule && (
              <ModulationOverlay
                module={modulationModalModule}
                allModules={modules}
                palette={activePalette}
                bpm={bpm}
                onUpdateLfo={(lfo) => handleModuleLfoChange(modulationModalModule.id, lfo)}
                onDeleteModulation={() => handleDeleteModulation(modulationModalModule.id)}
                onClose={() => setModulationModalId(null)}
              />
            )}
          </>
        )}

        {view === 'studio' && (
          <ChannelRackStudioView
            project={studioProject}
            bpm={bpm}
            audioEnabled={audioEnabled}
            isPlaying={studioPlaying}
            playheadStep={studioPlayheadStep}
            songPlayBar={studioSongPlayBar}
            palette={activePalette}
            masterGain={masterGain}
            masterLimiter={masterLimiter}
            pitoEq={pitoEq}
            onChangeMasterGain={handleMasterGainChange}
            onChangeMasterLimiter={handleMasterLimiterChange}
            onChangePitoEq={handlePitoEqChange}
            onChangeBpm={setBpm}
            onTogglePlay={handleToggleStudioPlay}
            onToggleAudio={handleToggleAudio}
            onUpdateProject={setStudioProject}
            onCaptureMainSurface={() => ({
              tabs: tabs.map((t) => ({ ...t })),
              modules: structuredClone(modules),
              groups: groups.map((g) => ({ ...g })),
              params: extractThreeXOscParamsFromModules(modules, bpm),
            })}
            onAuditionNote={async (channelId, note, isOn, velocity = 0.85) => {
              if (isOn) {
                if (!audioEnabled) {
                  await synthEngine.ensureStarted();
                  synthEngine.syncMixerTracks(
                    studioProject.mixerTracks ?? [],
                    studioProject.masterMixer,
                    Boolean(studioProject.masterMuted)
                  );
                  synthEngine.syncStudioChannels(studioProject.channels);
                }
                synthEngine.channelNoteOn(channelId, note, velocity);
              } else {
                synthEngine.channelNoteOff(channelId, note);
              }
            }}
          />
        )}

        {view === 'matrix' && (
          <MidiMatrixView
            modules={modules}
            palette={activePalette}
            onUpdateModule={handleUpdateModule}
          />
        )}

        {view === 'presets' && (
          <PresetsView
            presets={allPresets}
            activePresetId={activePresetId}
            currentPalette={activePalette}
            onLoadPreset={handleLoadPreset}
            onSaveCurrentRig={handleSaveCustomRig}
            onDeleteCustomPreset={handleDeleteCustomPreset}
            onExportJson={handleExportJson}
            onImportJson={handleImportJson}
            onSelectPalette={setPaletteId}
          />
        )}

        {view === 'monitor' && (
          <MidiMonitorView
            logs={midiLogs}
            inputs={midiInputs}
            outputs={midiOutputs}
            midiSupported={midiSupported}
            selectedOutputId={selectedMidiOutputId}
            paused={midiMonitorPaused}
            onSelectOutput={(id) => {
              setSelectedMidiOutputId(id);
              midiEngine.setSelectedOutputId(id);
            }}
            onTogglePause={() => setMidiMonitorPaused((p) => !p)}
            onClearLogs={() => setMidiLogs([])}
            onRefreshMidi={() => midiEngine.init()}
          />
        )}
      </main>
    </div>
  );
}
