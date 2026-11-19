import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  AudioWaveform,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  Layers,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat,
  Sliders,
  Trash2,
} from 'lucide-react';
import {
  MixerChannelStrip,
  MixerTrackState,
  ModuleGroup,
  PianoRollNote,
  StudioChannel,
  StudioPattern,
  StudioProjectState,
  SurfaceTab,
  SynthModule,
  ThemePalette,
  ThreeXOscParams,
} from '../types/synth';
import { MasterLimiterState } from '../audio/synthEngine';
import { PitochonchoEqState } from '../audio/pitochonchoEq';
import { createDefaultMixerStrip } from '../audio/mixerFxEngine';
import { resolveAccentHex } from '../data/themes';
import {
  THREE_X_OSC_CHANNEL_PRESETS,
  createMixerTrack,
  createSamplerStudioChannel,
  createStudioChannelFromPreset,
} from '../audio/threeXOscPresets';
import { RotaryMiniWheel } from './controllers/RotaryMiniWheel';
import { PianoRollView } from './PianoRollView';
import { PlaylistArrangementView } from './PlaylistArrangementView';
import { StudioThreeXOscModal } from './StudioThreeXOscModal';
import { MasterMixerPanel } from './MasterMixerPanel';

const STEP_CELL_W = 28; // Exact pixel pitch per 16th step across LEDs, step pads, and PR previews

interface ChannelRackStudioViewProps {
  project: StudioProjectState;
  bpm: number;
  audioEnabled: boolean;
  isPlaying: boolean;
  playheadStep: number;     // current step within active pattern (0..stepsCount)
  songPlayBar: number;      // current bar in song arrangement mode
  palette: ThemePalette;
  masterGain: number;
  masterLimiter: MasterLimiterState;
  pitoEq: PitochonchoEqState;
  onChangeMasterGain: (v: number) => void;
  onChangeMasterLimiter: (patch: Partial<MasterLimiterState>) => void;
  onChangePitoEq: (next: PitochonchoEqState) => void;
  onChangeBpm: (bpm: number) => void;
  onTogglePlay: () => void;
  onToggleAudio: () => void;
  onUpdateProject: (updater: (prev: StudioProjectState) => StudioProjectState) => void;
  onCaptureMainSurface: () => {
    tabs: SurfaceTab[];
    modules: SynthModule[];
    groups: ModuleGroup[];
    params: ThreeXOscParams;
  };
  onAuditionNote: (channelId: string, note: number, isOn: boolean, velocity?: number) => void;
}

type StudioPaneLayout = 'split' | 'rack' | 'pianoroll' | 'playlist';

export const ChannelRackStudioView: React.FC<ChannelRackStudioViewProps> = ({
  project,
  bpm,
  audioEnabled,
  isPlaying,
  playheadStep,
  songPlayBar,
  palette,
  masterGain,
  masterLimiter,
  pitoEq,
  onChangeMasterGain,
  onChangeMasterLimiter,
  onChangePitoEq,
  onChangeBpm,
  onTogglePlay,
  onToggleAudio,
  onUpdateProject,
  onCaptureMainSurface,
  onAuditionNote,
}) => {
  const [layout, setLayout] = useState<StudioPaneLayout>('split');
  const [bottomTab, setBottomTab] = useState<'pianoroll' | 'playlist'>('pianoroll');
  const [showMixer, setShowMixer] = useState(true);
  const [rackSplitPct, setRackSplitPct] = useState(42);
  const [rackCollapsed, setRackCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [mixerWidthPx, setMixerWidthPx] = useState(286);
  const [activeSplitter, setActiveSplitter] = useState<'vertical' | 'horizontal' | null>(null);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const studioBodyRef = useRef<HTMLDivElement>(null);
  const leftWorkspaceRef = useRef<HTMLDivElement>(null);

  const stepPaintRef = useRef<{
    active: boolean;
    channelId: string;
    value: boolean;
  } | null>(null);

  useEffect(() => {
    if (!activeSplitter) return;
    const onMove = (e: PointerEvent) => {
      if (activeSplitter === 'vertical') {
        const box = leftWorkspaceRef.current?.getBoundingClientRect();
        if (!box || box.height <= 40) return;
        const pct = ((e.clientY - box.top) / box.height) * 100;
        if (pct < 7) {
          setRackCollapsed(true);
          setBottomCollapsed(false);
        } else if (pct > 93) {
          setBottomCollapsed(true);
          setRackCollapsed(false);
        } else {
          setRackCollapsed(false);
          setBottomCollapsed(false);
          setRackSplitPct(Math.max(12, Math.min(88, pct)));
        }
      } else if (activeSplitter === 'horizontal') {
        const box = studioBodyRef.current?.getBoundingClientRect();
        if (!box || box.width <= 100) return;
        const rawW = box.right - e.clientX;
        const maxW = Math.max(520, Math.round(box.width * 0.82));
        if (rawW < 105) {
          setShowMixer(false);
          setActiveSplitter(null);
        } else {
          setShowMixer(true);
          setMixerWidthPx(Math.max(195, Math.min(maxW, Math.round(rawW))));
        }
      }
    };
    const onUp = () => setActiveSplitter(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [activeSplitter]);

  const requestMixerWidth = (targetW: number) => {
    const boxW = studioBodyRef.current?.getBoundingClientRect().width ?? 1200;
    const maxW = Math.max(520, Math.round(boxW * 0.8));
    setShowMixer(true);
    setMixerWidthPx(Math.max(210, Math.min(maxW, Math.round(targetW))));
  };

  const activePattern = useMemo(
    () =>
      project.patterns.find((p) => p.id === project.activePatternId) ?? project.patterns[0],
    [project.patterns, project.activePatternId]
  );

  const selectedChannel = useMemo(
    () =>
      project.channels.find((c) => c.id === project.selectedChannelId) ??
      project.channels[0],
    [project.channels, project.selectedChannelId]
  );

  const editingChannel = useMemo(
    () =>
      editingChannelId
        ? project.channels.find((c) => c.id === editingChannelId) ?? null
        : null,
    [project.channels, editingChannelId]
  );

  const mixerTracks = useMemo(
    () => project.mixerTracks ?? [],
    [project.mixerTracks]
  );
  const masterMixer = useMemo(
    () => project.masterMixer ?? createDefaultMixerStrip(0.5),
    [project.masterMixer]
  );

  const handleAddMixerTrack = () => {
    onUpdateProject((prev) => {
      const existing = prev.mixerTracks ?? [];
      const nextIdx =
        existing.length === 0 ? 1 : Math.max(...existing.map((t) => t.index)) + 1;
      return {
        ...prev,
        mixerTracks: [...existing, createMixerTrack(nextIdx)],
      };
    });
  };

  const handleUpdateMixerTrack = (
    trackIndex: number,
    patch: Partial<MixerTrackState>
  ) => {
    onUpdateProject((prev) => ({
      ...prev,
      mixerTracks: (prev.mixerTracks ?? []).map((t) =>
        t.index === trackIndex ? { ...t, ...patch } : t
      ),
    }));
  };

  const handleDeleteMixerTrack = (trackIndex: number) => {
    onUpdateProject((prev) => {
      const existing = prev.mixerTracks ?? [];
      if (existing.length <= 1) return prev;
      return {
        ...prev,
        mixerTracks: existing
          .filter((t) => t.index !== trackIndex)
          .map((t) => {
            if (!Array.isArray(t.sends)) return t;
            const hadTarget = t.sends.some((s) => s.targetIndex === trackIndex);
            if (!hadTarget) return t;
            const cleaned = t.sends.filter((s) => s.targetIndex !== trackIndex);
            return {
              ...t,
              sends: cleaned.length > 0 ? cleaned : [{ targetIndex: 0, amount: 1 }],
            };
          }),
        channels: prev.channels.map((c) =>
          (c.mixerTrack ?? 0) === trackIndex ? { ...c, mixerTrack: 0 } : c
        ),
      };
    });
  };

  const handleUpdateMasterMixer = (patch: Partial<MixerChannelStrip>) => {
    onUpdateProject((prev) => ({
      ...prev,
      masterMixer: {
        ...(prev.masterMixer ?? createDefaultMixerStrip(0.5)),
        ...patch,
      },
    }));
  };

  const updateChannel = (channelId: string, patch: Partial<StudioChannel>) => {
    onUpdateProject((prev) => ({
      ...prev,
      channels: prev.channels.map((c) => (c.id === channelId ? { ...c, ...patch } : c)),
    }));
  };

  const addThreeXOscChannel = (presetId: string, fromSurface = false) => {
    const idx = project.channels.length;
    const assignedTrack = idx + 1;
    const tpl = fromSurface ? onCaptureMainSurface() : undefined;
    const newCh = createStudioChannelFromPreset(
      presetId,
      idx,
      fromSurface ? `3xOsc Surface #${idx + 1}` : undefined,
      tpl?.params,
      tpl ? { tabs: tpl.tabs, modules: tpl.modules, groups: tpl.groups } : undefined,
      assignedTrack
    );
    onUpdateProject((prev) => {
      const prevTracks = prev.mixerTracks ?? [];
      const hasTrack = prevTracks.some((t) => t.index === assignedTrack);
      const nextTracks = hasTrack
        ? prevTracks
        : [
            ...prevTracks,
            createMixerTrack(
              assignedTrack,
              newCh.name.replace(/^3xOsc\s+/, ''),
              newCh.accent
            ),
          ];
      return {
        ...prev,
        channels: [...prev.channels, newCh],
        selectedChannelId: newCh.id,
        mixerTracks: nextTracks,
        patterns: prev.patterns.map((pat) => ({
          ...pat,
          steps: {
            ...pat.steps,
            [newCh.id]: Array.from({ length: pat.stepsCount }, () => false),
          },
          notes: {
            ...pat.notes,
            [newCh.id]: [],
          },
        })),
      };
    });
    setAddMenuOpen(false);
  };

  const addSamplerChannel = (sampleId = 'builtin-808-kick') => {
    const idx = project.channels.length;
    const assignedTrack = idx + 1;
    const newCh = createSamplerStudioChannel(idx, sampleId, assignedTrack);
    onUpdateProject((prev) => {
      const prevTracks = prev.mixerTracks ?? [];
      const hasTrack = prevTracks.some((t) => t.index === assignedTrack);
      const nextTracks = hasTrack
        ? prevTracks
        : [
            ...prevTracks,
            createMixerTrack(assignedTrack, newCh.name, newCh.accent),
          ];
      return {
        ...prev,
        channels: [...prev.channels, newCh],
        selectedChannelId: newCh.id,
        mixerTracks: nextTracks,
        patterns: prev.patterns.map((pat) => ({
          ...pat,
          steps: {
            ...pat.steps,
            [newCh.id]: Array.from({ length: pat.stepsCount }, () => false),
          },
          notes: {
            ...pat.notes,
            [newCh.id]: [],
          },
        })),
      };
    });
    setAddMenuOpen(false);
    setEditingChannelId(newCh.id);
  };

  const cloneChannel = (ch: StudioChannel) => {
    const clone: StudioChannel = {
      ...ch,
      id: `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      name: `${ch.name} Copy`,
      params: structuredClone(ch.params),
      surfaceTabs: ch.surfaceTabs ? ch.surfaceTabs.map((t) => ({ ...t })) : undefined,
      surfaceModules: ch.surfaceModules ? structuredClone(ch.surfaceModules) : undefined,
      surfaceGroups: ch.surfaceGroups ? ch.surfaceGroups.map((g) => ({ ...g })) : undefined,
    };
    onUpdateProject((prev) => ({
      ...prev,
      channels: [...prev.channels, clone],
      selectedChannelId: clone.id,
      patterns: prev.patterns.map((pat) => ({
        ...pat,
        steps: {
          ...pat.steps,
          [clone.id]: [...(pat.steps[ch.id] ?? Array.from({ length: pat.stepsCount }, () => false))],
        },
        notes: {
          ...pat.notes,
          [clone.id]: (pat.notes[ch.id] ?? []).map((n) => ({
            ...n,
            id: `pr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          })),
        },
      })),
    }));
  };

  const deleteChannel = (channelId: string) => {
    if (project.channels.length <= 1) return;
    onUpdateProject((prev) => {
      const remaining = prev.channels.filter((c) => c.id !== channelId);
      const nextSelected =
        prev.selectedChannelId === channelId ? remaining[0]?.id ?? '' : prev.selectedChannelId;
      return {
        ...prev,
        channels: remaining,
        selectedChannelId: nextSelected,
      };
    });
    if (editingChannelId === channelId) setEditingChannelId(null);
  };

  const setStepVal = (channelId: string, stepIdx: number, val: boolean) => {
    onUpdateProject((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pat) => {
        if (pat.id !== activePattern.id) return pat;
        const arr = [...(pat.steps[channelId] ?? Array.from({ length: pat.stepsCount }, () => false))];
        while (arr.length < pat.stepsCount) arr.push(false);
        arr[stepIdx] = val;
        return {
          ...pat,
          steps: { ...pat.steps, [channelId]: arr },
        };
      }),
    }));
  };

  const handleStepGridSizeChange = (stepsCount: number) => {
    onUpdateProject((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pat) => {
        if (pat.id !== activePattern.id) return pat;
        const nextSteps: Record<string, boolean[]> = {};
        Object.entries(pat.steps).forEach(([cid, arr]) => {
          const resized = Array.from({ length: stepsCount }, (_, i) => arr[i] ?? false);
          nextSteps[cid] = resized;
        });
        return { ...pat, stepsCount, steps: nextSteps };
      }),
    }));
  };

  const handleAddPattern = () => {
    const nextNum = project.patterns.length + 1;
    const newPat: StudioPattern = {
      id: `pat-${Date.now().toString(36)}`,
      name: `Pattern ${nextNum}`,
      stepsCount: 16,
      steps: Object.fromEntries(
        project.channels.map((c) => [c.id, Array.from({ length: 16 }, () => false)])
      ),
      notes: Object.fromEntries(project.channels.map((c) => [c.id, []])),
    };
    onUpdateProject((prev) => ({
      ...prev,
      patterns: [...prev.patterns, newPat],
      activePatternId: newPat.id,
    }));
  };

  const handleClonePattern = () => {
    const clone: StudioPattern = {
      id: `pat-${Date.now().toString(36)}`,
      name: `${activePattern.name} (Copy)`,
      stepsCount: activePattern.stepsCount,
      steps: Object.fromEntries(
        Object.entries(activePattern.steps).map(([k, v]) => [k, [...v]])
      ),
      notes: Object.fromEntries(
        Object.entries(activePattern.notes).map(([k, arr]) => [
          k,
          arr.map((n) => ({
            ...n,
            id: `pr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          })),
        ])
      ),
    };
    onUpdateProject((prev) => ({
      ...prev,
      patterns: [...prev.patterns, clone],
      activePatternId: clone.id,
    }));
  };

  const handleImportStepsToPianoRoll = (channelId: string) => {
    const ch = project.channels.find((c) => c.id === channelId);
    if (!ch) return;
    const bools = activePattern.steps[channelId] ?? [];
    const generated: PianoRollNote[] = [];
    bools.forEach((on, stepIdx) => {
      if (!on) return;
      generated.push({
        id: `pr-${Date.now().toString(36)}-${stepIdx}`,
        pitch: ch.rootNote,
        startStep: stepIdx,
        durationSteps: 0.9,
        velocity: 0.85,
      });
    });
    onUpdateProject((prev) => ({
      ...prev,
      channels: prev.channels.map((c) =>
        c.id === channelId ? { ...c, usePianoRoll: true } : c
      ),
      patterns: prev.patterns.map((pat) =>
        pat.id === activePattern.id
          ? { ...pat, notes: { ...pat.notes, [channelId]: generated } }
          : pat
      ),
    }));
  };

  const showRack = layout === 'split' || layout === 'rack';
  const showBottom = layout === 'split' || layout === 'pianoroll' || layout === 'playlist';
  const activeBottomMode =
    layout === 'pianoroll' ? 'pianoroll' : layout === 'playlist' ? 'playlist' : bottomTab;

  return (
    <div
      className="flex-1 flex flex-col min-h-0 overflow-hidden"
      style={{ backgroundColor: 'var(--pg-canvas)', color: 'var(--pg-text)' }}
      onPointerUp={() => {
        stepPaintRef.current = null;
      }}
    >
      {/* FL Studio-Style Studio Transport & Pattern Toolbar */}
      <div
        className="px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 shrink-0"
        style={{
          backgroundColor: 'var(--pg-surface)',
          borderBottom: '1px solid var(--pg-border)',
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* PAT / SONG Mode Switch */}
          <div
            className="flex items-center rounded overflow-hidden"
            style={{ border: '1px solid var(--pg-border-strong)' }}
          >
            <button
              type="button"
              onClick={() => onUpdateProject((p) => ({ ...p, songMode: false }))}
              className="px-2.5 py-1 text-[11px] font-mono font-bold"
              style={{
                backgroundColor: !project.songMode ? palette.colors.primary : 'var(--pg-panel)',
                color: !project.songMode ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
              }}
              title="Loop Active Pattern"
            >
              PAT
            </button>
            <button
              type="button"
              onClick={() => onUpdateProject((p) => ({ ...p, songMode: true }))}
              className="px-2.5 py-1 text-[11px] font-mono font-bold"
              style={{
                backgroundColor: project.songMode ? palette.colors.secondary : 'var(--pg-panel)',
                color: project.songMode ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
              }}
              title="Loop Playlist Song Arrangement"
            >
              SONG
            </button>
          </div>

          {/* Play / Stop */}
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold"
            style={{
              backgroundColor: isPlaying ? palette.colors.secondary : 'var(--pg-panel)',
              color: isPlaying ? 'var(--pg-primary-text)' : 'var(--pg-text)',
              border: '1px solid var(--pg-border-strong)',
            }}
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            <span>{isPlaying ? 'Stop' : 'Play'}</span>
          </button>

          {/* Loop Status Pill */}
          <span
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
              color: isPlaying ? palette.colors.primary : 'var(--pg-text-muted)',
            }}
            title="Pattern and Song loops seamlessly"
          >
            <Repeat size={10} />
            <span>{project.songMode ? 'Loop Song' : 'Loop Pattern'}</span>
          </span>

          {/* Audio Status */}
          {!audioEnabled && (
            <button
              type="button"
              onClick={onToggleAudio}
              className="px-2.5 py-1 rounded text-[11px] font-semibold"
              style={{
                backgroundColor: palette.colors.alert,
                color: '#ffffff',
              }}
            >
              Enable Audio
            </button>
          )}

          {/* BPM */}
          <div
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
            }}
          >
            <span className="text-[10px]" style={{ color: 'var(--pg-text-muted)' }}>
              BPM
            </span>
            <input
              type="number"
              min={50}
              max={200}
              value={bpm}
              onChange={(e) =>
                onChangeBpm(Math.max(50, Math.min(200, Number(e.target.value) || 120)))
              }
              className="w-11 bg-transparent text-right font-semibold outline-none tabular-nums"
              style={{ color: 'var(--pg-text)' }}
            />
          </div>

          {/* Swing */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
            }}
          >
            <span style={{ color: 'var(--pg-text-muted)' }}>SWING</span>
            <input
              type="range"
              min={0}
              max={0.7}
              step={0.02}
              value={project.swing}
              onChange={(e) =>
                onUpdateProject((p) => ({ ...p, swing: Number(e.target.value) }))
              }
              className="w-16 accent-amber-500 h-1"
            />
            <span className="w-7 text-right tabular-nums" style={{ color: palette.colors.primary }}>
              {Math.round(project.swing * 100)}%
            </span>
          </div>

          {/* Pattern Selector + Add / Clone + Steps */}
          <div className="flex items-center gap-1">
            <select
              value={activePattern.id}
              onChange={(e) =>
                onUpdateProject((p) => ({ ...p, activePatternId: e.target.value }))
              }
              className="px-2 py-1 rounded text-xs font-medium outline-none"
              style={{
                backgroundColor: 'var(--pg-panel)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              {project.patterns.map((pat) => (
                <option key={pat.id} value={pat.id}>
                  {pat.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddPattern}
              title="New Pattern"
              className="p-1.5 rounded"
              style={{
                backgroundColor: 'var(--pg-panel)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              <Plus size={12} />
            </button>
            <button
              type="button"
              onClick={handleClonePattern}
              title="Clone Active Pattern"
              className="p-1.5 rounded"
              style={{
                backgroundColor: 'var(--pg-panel)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text-muted)',
              }}
            >
              <Copy size={12} />
            </button>

            <select
              value={activePattern.stepsCount}
              onChange={(e) => handleStepGridSizeChange(Number(e.target.value))}
              title="Pattern Steps"
              className="px-1.5 py-1 rounded text-[11px] font-mono outline-none"
              style={{
                backgroundColor: 'var(--pg-panel)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              <option value={16}>16 Steps</option>
              <option value={32}>32 Steps</option>
              <option value={64}>64 Steps</option>
            </select>
          </div>
        </div>

        {/* Right: Add 3xOsc Synths + View Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setAddMenuOpen((v) => !v)}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold"
              style={{
                backgroundColor: palette.colors.primary,
                color: 'var(--pg-primary-text)',
              }}
            >
              <Plus size={13} />
              <span>Add Channel ({project.channels.length})</span>
            </button>

            {addMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setAddMenuOpen(false)}
                />
                <div
                  className="absolute right-0 mt-1 w-64 rounded-md p-1.5 z-40 shadow-xl flex flex-col gap-0.5"
                  style={{
                    backgroundColor: 'var(--pg-panel)',
                    border: '1px solid var(--pg-border-strong)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => addSamplerChannel('builtin-808-kick')}
                    className="w-full text-left px-2 py-1.5 rounded text-xs font-semibold flex items-center justify-between hover:bg-white/5"
                    style={{ color: palette.colors.secondary }}
                  >
                    <span className="flex items-center gap-1.5">
                      <AudioWaveform size={12} />
                      <span>Sampler (WAV / MP3 WaveView)</span>
                    </span>
                    <span className="text-[9px] font-mono opacity-80">NEW</span>
                  </button>
                  <div className="grid grid-cols-2 gap-1 px-1 pb-1">
                    {(
                      [
                        { id: 'builtin-808-kick', label: '808 Kick' },
                        { id: 'builtin-crisp-snare', label: 'Crisp Snare' },
                        { id: 'builtin-warm-chord', label: 'Warm Chord' },
                        { id: 'builtin-pluck-bell', label: 'Pluck Bell' },
                      ] as const
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => addSamplerChannel(s.id)}
                        className="px-1.5 py-1 rounded text-[10px] font-mono text-left truncate hover:bg-white/10"
                        style={{
                          backgroundColor: 'var(--pg-canvas)',
                          border: '1px solid var(--pg-border)',
                          color: 'var(--pg-text-muted)',
                        }}
                      >
                        + {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="my-1" style={{ borderTop: '1px solid var(--pg-border)' }} />
                  <button
                    type="button"
                    onClick={() => addThreeXOscChannel('supersaw-lead', true)}
                    className="w-full text-left px-2 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 hover:bg-white/5"
                    style={{ color: palette.colors.primary }}
                  >
                    <Download size={12} />
                    <span>Load From Surface 3xOsc</span>
                  </button>
                  <div className="my-1" style={{ borderTop: '1px solid var(--pg-border)' }} />
                  {THREE_X_OSC_CHANNEL_PRESETS.map((pr) => (
                    <button
                      key={pr.id}
                      type="button"
                      onClick={() => addThreeXOscChannel(pr.id, false)}
                      className="w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between hover:bg-white/5"
                      style={{ color: 'var(--pg-text)' }}
                    >
                      <span>3xOsc · {pr.name}</span>
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: resolveAccentHex(pr.accent, palette) }}
                      />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowMixer((m) => !m)}
            title="Toggle Master Mixer & Limiter Strip"
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold"
            style={{
              backgroundColor: showMixer ? `${palette.colors.secondary}26` : 'var(--pg-panel)',
              border: `1px solid ${showMixer ? palette.colors.secondary : 'var(--pg-border)'}`,
              color: showMixer ? palette.colors.secondary : 'var(--pg-text-muted)',
            }}
          >
            <AudioLines size={12} />
            <span>Master Mixer</span>
          </button>

          <div
            className="flex items-center rounded overflow-hidden"
            style={{ border: '1px solid var(--pg-border)' }}
          >
            {(
              [
                { id: 'split', label: 'Rack + Score' },
                { id: 'rack', label: 'Rack' },
                { id: 'pianoroll', label: 'Piano Roll' },
                { id: 'playlist', label: 'Playlist' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setLayout(opt.id);
                  setRackCollapsed(false);
                  setBottomCollapsed(false);
                }}
                className="px-2 py-1 text-[11px] font-medium"
                style={{
                  backgroundColor: layout === opt.id ? 'var(--pg-panel)' : 'var(--pg-canvas)',
                  color: layout === opt.id ? palette.colors.primary : 'var(--pg-text-muted)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Studio Body: Left Workspace (Rack + Piano Roll/Playlist) + Right Master Mixer Channel */}
      <div
        ref={studioBodyRef}
        className={`flex-1 min-h-0 flex overflow-hidden ${
          activeSplitter === 'vertical'
            ? 'select-none cursor-row-resize'
            : activeSplitter === 'horizontal'
              ? 'select-none cursor-col-resize'
              : ''
        }`}
      >
        <div
          ref={leftWorkspaceRef}
          className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden"
        >
          {/* Top Section: FL Studio Channel Rack (Unified Pixel-Locked Step Sequencer) */}
          {showRack && !(layout === 'split' && rackCollapsed) && (
            <div
              className={`${
                layout === 'split' && !bottomCollapsed ? 'shrink-0' : 'flex-1'
              } min-h-0 flex flex-col overflow-hidden`}
              style={{
                height:
                  layout === 'split' && !bottomCollapsed
                    ? `${rackSplitPct}%`
                    : undefined,
                backgroundColor: 'var(--pg-surface)',
              }}
            >
              <div className="flex-1 min-h-0 overflow-auto relative">
                <div
                  style={{
                    minWidth: `${366 + activePattern.stepsCount * STEP_CELL_W + 96}px`,
                  }}
                  className="flex flex-col"
                >
                  {/* Sticky Beat Ruler & Step Playhead LED Bar */}
                  <div
                    className="sticky top-0 z-20 flex items-center shrink-0"
                    style={{
                      backgroundColor: 'var(--pg-panel)',
                      borderBottom: '1px solid var(--pg-border-strong)',
                    }}
                  >
                    <div
                      className="sticky left-0 z-30 w-[366px] shrink-0 px-3 py-1.5 text-[11px] font-semibold flex items-center justify-between"
                      style={{
                        backgroundColor: 'var(--pg-panel)',
                        borderRight: '1px solid var(--pg-border)',
                        color: 'var(--pg-text-muted)',
                      }}
                    >
                      <span>Channel Rack · {project.channels.length} 3xOsc</span>
                      <span className="text-[9px] font-mono" style={{ color: 'var(--pg-text-dim)' }}>
                        MIX · 4/4 · {activePattern.stepsCount} Steps
                      </span>
                    </div>

                    <div
                      className="flex items-center shrink-0 relative"
                      style={{ width: `${activePattern.stepsCount * STEP_CELL_W}px` }}
                    >
                      {Array.from({ length: activePattern.stepsCount }, (_, s) => {
                        const active = isPlaying && Math.floor(playheadStep) === s;
                        const isBarStart = s % 16 === 0;
                        const isBeatStart = s % 4 === 0;
                        const beatLabel = isBarStart
                          ? `${Math.floor(s / 16) + 1}`
                          : isBeatStart
                            ? `${Math.floor(s / 16) + 1}.${Math.floor((s % 16) / 4) + 1}`
                            : '';
                        return (
                          <div
                            key={s}
                            style={{
                              width: `${STEP_CELL_W}px`,
                              borderLeft: isBarStart
                                ? '1px solid var(--pg-border-strong)'
                                : isBeatStart
                                  ? '1px solid var(--pg-border)'
                                  : '1px solid transparent',
                            }}
                            className="shrink-0 flex flex-col items-center justify-center py-0.5 gap-0.5"
                          >
                            <span
                              className="text-[8px] font-mono leading-none tabular-nums h-2.5"
                              style={{
                                color: active
                                  ? palette.colors.primary
                                  : isBarStart
                                    ? 'var(--pg-text)'
                                    : 'var(--pg-text-dim)',
                              }}
                            >
                              {beatLabel}
                            </span>
                            <div
                              className="w-5 h-1.5 rounded-full"
                              style={{
                                backgroundColor: active
                                  ? palette.colors.primary
                                  : isBeatStart
                                    ? 'var(--pg-border-strong)'
                                    : 'var(--pg-canvas)',
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>

                    <div className="w-[96px] shrink-0 px-2 text-[9px] font-mono text-right" style={{ color: 'var(--pg-text-dim)' }}>
                      SCORE
                    </div>
                  </div>

                  {/* Channel Rows */}
                  <div className="flex flex-col divide-y" style={{ borderColor: 'var(--pg-border)' }}>
                    {project.channels.map((ch) => {
                      const accentHex = resolveAccentHex(ch.accent, palette);
                      const isSelected = ch.id === selectedChannel.id;
                      const chSteps = activePattern.steps[ch.id] ?? [];
                      const chNotes = activePattern.notes[ch.id] ?? [];
                      const showingPianoPreview = ch.usePianoRoll || chNotes.length > 0;
                      const gridWidthPx = activePattern.stepsCount * STEP_CELL_W;

                      return (
                        <div
                          key={ch.id}
                          onClick={() =>
                            onUpdateProject((p) => ({ ...p, selectedChannelId: ch.id }))
                          }
                          className="flex items-center transition-colors"
                          style={{
                            backgroundColor: isSelected ? 'var(--pg-panel)' : 'var(--pg-canvas)',
                          }}
                        >
                          {/* Sticky Left Channel Strip Controls */}
                          <div
                            className="sticky left-0 z-10 w-[366px] shrink-0 flex items-center gap-1.5 px-2.5 py-1"
                            style={{
                              backgroundColor: isSelected ? 'var(--pg-panel)' : 'var(--pg-canvas)',
                              borderRight: '1px solid var(--pg-border)',
                            }}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateChannel(ch.id, { muted: !ch.muted });
                              }}
                              title={ch.muted ? 'Unmute Channel' : 'Mute Channel'}
                              className="w-4 h-6 rounded-sm flex items-center justify-center text-[9px] font-bold"
                              style={{
                                backgroundColor: !ch.muted ? palette.colors.secondary : 'var(--pg-surface)',
                                color: !ch.muted ? '#090b10' : 'var(--pg-text-dim)',
                                border: '1px solid var(--pg-border)',
                              }}
                            >
                              {ch.muted ? 'M' : ''}
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateChannel(ch.id, { solo: !ch.solo });
                              }}
                              title="Solo Channel"
                              className="w-5 h-6 rounded-sm text-[9px] font-mono font-bold"
                              style={{
                                backgroundColor: ch.solo ? palette.colors.primary : 'var(--pg-surface)',
                                color: ch.solo ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
                                border: '1px solid var(--pg-border)',
                              }}
                            >
                              S
                            </button>

                            <div className="w-11 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <RotaryMiniWheel
                                size="sm"
                                label="PAN"
                                value={ch.pan}
                                bipolar
                                accentHex={accentHex}
                                readout={`${Math.round((ch.pan - 0.5) * 200)}`}
                                defaultValue={0.5}
                                onChange={(v) => updateChannel(ch.id, { pan: v })}
                              />
                            </div>

                            <div className="w-11 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <RotaryMiniWheel
                                size="sm"
                                label="VOL"
                                value={ch.volume}
                                accentHex={accentHex}
                                readout={`${Math.round(ch.volume * 100)}`}
                                defaultValue={0.8}
                                onChange={(v) => updateChannel(ch.id, { volume: v })}
                              />
                            </div>

                            {/* FL-Studio-Style Mixer Channel Routing Selector */}
                            <div
                              className="w-10 shrink-0 flex flex-col items-center"
                              onClick={(e) => e.stopPropagation()}
                              title="Route Channel to Mixer Track (M = Main, 1..N = Insert Track)"
                            >
                              <select
                                aria-label={`Mixer track for ${ch.name}`}
                                value={ch.mixerTrack ?? 0}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === '__new__') {
                                    const nextIdx =
                                      mixerTracks.length === 0
                                        ? 1
                                        : Math.max(...mixerTracks.map((t) => t.index)) + 1;
                                    onUpdateProject((prev) => ({
                                      ...prev,
                                      mixerTracks: [
                                        ...(prev.mixerTracks ?? []),
                                        createMixerTrack(nextIdx),
                                      ],
                                      channels: prev.channels.map((c) =>
                                        c.id === ch.id ? { ...c, mixerTrack: nextIdx } : c
                                      ),
                                    }));
                                    requestMixerWidth(Math.max(mixerWidthPx, 560));
                                  } else {
                                    updateChannel(ch.id, { mixerTrack: Number(raw) });
                                  }
                                }}
                                className="w-10 h-6 px-0.5 rounded text-center text-[10px] font-mono font-bold outline-none cursor-pointer"
                                style={{
                                  backgroundColor: 'var(--pg-surface)',
                                  border: `1px solid ${
                                    (ch.mixerTrack ?? 0) > 0
                                      ? `${accentHex}88`
                                      : 'var(--pg-border)'
                                  }`,
                                  color:
                                    (ch.mixerTrack ?? 0) > 0
                                      ? accentHex
                                      : palette.colors.primary,
                                }}
                              >
                                <option value={0}>M</option>
                                {mixerTracks.map((tr) => (
                                  <option key={tr.id} value={tr.index}>
                                    {tr.index} · {tr.name}
                                  </option>
                                ))}
                                <option value="__new__">+ New Ch</option>
                              </select>
                            </div>

                            {/* Channel Name / 3xOsc Surface + WaveView Sampler Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateProject((p) => ({ ...p, selectedChannelId: ch.id }));
                                setEditingChannelId(ch.id);
                              }}
                              title={
                                ch.params.sampler?.enabled
                                  ? 'Open WaveView Sample Editor & 3xOsc Filter/Envelopes'
                                  : 'Open 3xOsc Surface & WaveView Sampler'
                              }
                              className="flex-1 min-w-0 px-2 py-1 rounded text-left flex items-center justify-between gap-1 hover:brightness-110"
                              style={{
                                backgroundColor: 'var(--pg-surface)',
                                borderLeft: `3px solid ${accentHex}`,
                                borderTop: `1px solid ${isSelected ? accentHex : 'var(--pg-border)'}`,
                                borderRight: `1px solid ${isSelected ? accentHex : 'var(--pg-border)'}`,
                                borderBottom: `1px solid ${isSelected ? accentHex : 'var(--pg-border)'}`,
                              }}
                            >
                              <div className="min-w-0">
                                <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--pg-text)' }}>
                                  {ch.name}
                                </div>
                                <div className="text-[9px] font-mono truncate" style={{ color: 'var(--pg-text-dim)' }}>
                                  {ch.params.sampler?.enabled
                                    ? `SAMPLER · ${ch.params.sampler.sampleName}`
                                    : `${ch.presetTag} · ${ch.params.filterType.toUpperCase()}`}
                                </div>
                              </div>
                              {ch.params.sampler?.enabled ? (
                                <AudioWaveform size={11} style={{ color: accentHex }} className="shrink-0" />
                              ) : (
                                <Sliders size={11} style={{ color: accentHex }} className="shrink-0" />
                              )}
                            </button>
                          </div>

                          {/* Unified Step Sequencer Grid OR Pixel-Aligned Mini Piano Roll Preview */}
                          <div className="shrink-0 py-1" style={{ width: `${gridWidthPx}px` }}>
                            {showingPianoPreview && chNotes.length > 0 ? (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateProject((p) => ({ ...p, selectedChannelId: ch.id }));
                                  setBottomTab('pianoroll');
                                  if (layout === 'rack') setLayout('split');
                                }}
                                title="Piano Roll notes active — click to edit in Piano Roll"
                                className="h-8 rounded-sm relative cursor-pointer overflow-hidden"
                                style={{
                                  width: `${gridWidthPx}px`,
                                  backgroundColor: 'var(--pg-surface)',
                                  border: `1px solid ${accentHex}66`,
                                }}
                              >
                                {/* Beat-locked background columns matching Step Sequencer */}
                                <div className="absolute inset-0 flex pointer-events-none">
                                  {Array.from({ length: activePattern.stepsCount }, (_, sIdx) => {
                                    const isAltBeat = Math.floor(sIdx / 4) % 2 === 1;
                                    const isBarLine = sIdx % 16 === 0;
                                    const isBeatLine = sIdx % 4 === 0;
                                    return (
                                      <div
                                        key={sIdx}
                                        style={{
                                          width: `${STEP_CELL_W}px`,
                                          backgroundColor: isAltBeat ? 'rgba(255,255,255,0.025)' : 'transparent',
                                          borderLeft: isBarLine
                                            ? '1px solid var(--pg-border-strong)'
                                            : isBeatLine
                                              ? '1px solid var(--pg-border)'
                                              : 'none',
                                        }}
                                        className="h-full shrink-0"
                                      />
                                    );
                                  })}
                                </div>

                                {(() => {
                                  const pitches = chNotes.map((x) => x.pitch);
                                  const minP = Math.min(36, ...pitches);
                                  const maxP = Math.max(84, ...pitches);
                                  const span = Math.max(12, maxP - minP);
                                  return chNotes.map((n) => {
                                    const leftPx = n.startStep * STEP_CELL_W;
                                    const widthPx = Math.max(4, n.durationSteps * STEP_CELL_W - 1);
                                    const topPct = Math.max(
                                      8,
                                      Math.min(82, ((maxP - n.pitch) / span) * 74 + 8)
                                    );
                                    return (
                                      <div
                                        key={n.id}
                                        style={{
                                          left: `${leftPx}px`,
                                          width: `${widthPx}px`,
                                          top: `${topPct}%`,
                                          height: '4px',
                                          backgroundColor: accentHex,
                                        }}
                                        className="absolute rounded-xs"
                                      />
                                    );
                                  });
                                })()}

                                {isPlaying && (
                                  <div
                                    className="absolute top-0 bottom-0 w-0.5 pointer-events-none"
                                    style={{
                                      left: `${playheadStep * STEP_CELL_W}px`,
                                      backgroundColor: palette.colors.secondary,
                                    }}
                                  />
                                )}

                                <span
                                  className="sticky right-1 float-right mt-1 mr-1 text-[9px] font-mono px-1 rounded pointer-events-none"
                                  style={{
                                    backgroundColor: 'var(--pg-canvas)',
                                    color: accentHex,
                                  }}
                                >
                                  Piano Roll ({chNotes.length})
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center" style={{ width: `${gridWidthPx}px` }}>
                                {Array.from({ length: activePattern.stepsCount }, (_, stepIdx) => {
                                  const on = Boolean(chSteps[stepIdx]);
                                  const isAltBlock = Math.floor(stepIdx / 4) % 2 === 1;
                                  const isBarLine = stepIdx % 16 === 0;
                                  const isBeatLine = stepIdx % 4 === 0;
                                  const isPlayStep = isPlaying && Math.floor(playheadStep) === stepIdx;
                                  return (
                                    <div
                                      key={stepIdx}
                                      style={{
                                        width: `${STEP_CELL_W}px`,
                                        borderLeft: isBarLine
                                          ? '1px solid var(--pg-border-strong)'
                                          : isBeatLine
                                            ? '1px solid var(--pg-border)'
                                            : '1px solid transparent',
                                      }}
                                      className="shrink-0 flex items-center justify-center"
                                    >
                                      <button
                                        type="button"
                                        onPointerDown={(e) => {
                                          e.stopPropagation();
                                          const nextVal = e.button === 2 ? false : !on;
                                          setStepVal(ch.id, stepIdx, nextVal);
                                          stepPaintRef.current = {
                                            active: true,
                                            channelId: ch.id,
                                            value: nextVal,
                                          };
                                          if (nextVal) {
                                            onAuditionNote(ch.id, ch.rootNote, true, 0.82);
                                            window.setTimeout(
                                              () => onAuditionNote(ch.id, ch.rootNote, false),
                                              120
                                            );
                                          }
                                        }}
                                        onPointerEnter={() => {
                                          const paint = stepPaintRef.current;
                                          if (paint && paint.active && paint.channelId === ch.id) {
                                            setStepVal(ch.id, stepIdx, paint.value);
                                          }
                                        }}
                                        onContextMenu={(e) => {
                                          e.preventDefault();
                                          setStepVal(ch.id, stepIdx, false);
                                        }}
                                        className="w-[23px] h-8 rounded-sm transition-colors"
                                        style={{
                                          backgroundColor: on
                                            ? accentHex
                                            : isAltBlock
                                              ? '#2c313f'
                                              : '#1e222d',
                                          border: isPlayStep
                                            ? '1.5px solid #ffffff'
                                            : `1px solid ${on ? accentHex : 'var(--pg-border)'}`,
                                          boxShadow: on ? `0 0 6px ${accentHex}55` : 'none',
                                        }}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Right Channel Quick Actions: Toggle PR, Clone, Delete */}
                          <div className="w-[96px] shrink-0 flex items-center justify-end gap-1 px-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateProject((p) => ({ ...p, selectedChannelId: ch.id }));
                                setBottomTab('pianoroll');
                                if (layout === 'rack') setLayout('split');
                              }}
                              title="Score this channel in Piano Roll"
                              className="p-1.5 rounded hover:opacity-90"
                              style={{
                                backgroundColor: isSelected ? `${accentHex}22` : 'var(--pg-surface)',
                                border: '1px solid var(--pg-border)',
                                color: isSelected ? accentHex : 'var(--pg-text-muted)',
                              }}
                            >
                              <Music2 size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                cloneChannel(ch);
                              }}
                              title="Clone 3xOsc Channel"
                              className="p-1.5 rounded hover:opacity-90"
                              style={{
                                backgroundColor: 'var(--pg-surface)',
                                border: '1px solid var(--pg-border)',
                                color: 'var(--pg-text-muted)',
                              }}
                            >
                              <Copy size={11} />
                            </button>
                            {project.channels.length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteChannel(ch.id);
                                }}
                                title="Delete 3xOsc Channel"
                                className="p-1.5 rounded hover:opacity-90"
                                style={{
                                  backgroundColor: 'var(--pg-surface)',
                                  border: '1px solid var(--pg-border)',
                                  color: 'var(--pg-alert)',
                                }}
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Resizable & Collapsible Horizontal Splitter between Channel Rack & Piano Roll / Playlist */}
          {layout === 'split' && (
            <div
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                e.preventDefault();
                setActiveSplitter('vertical');
              }}
              onDoubleClick={() => {
                setRackCollapsed(false);
                setBottomCollapsed(false);
                setRackSplitPct(42);
              }}
              title="Drag to resize panes · Double-click to reset split"
              className="h-6 shrink-0 px-2 flex items-center justify-between gap-2 cursor-row-resize select-none group transition-colors"
              style={{
                backgroundColor:
                  activeSplitter === 'vertical'
                    ? `${palette.colors.primary}22`
                    : 'var(--pg-panel)',
                borderTop: '1px solid var(--pg-border-strong)',
                borderBottom: '1px solid var(--pg-border-strong)',
              }}
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (rackCollapsed) {
                      setRackCollapsed(false);
                    } else {
                      setBottomCollapsed(false);
                      setRackCollapsed(true);
                    }
                  }}
                  title={rackCollapsed ? 'Expand Channel Rack' : 'Collapse Channel Rack'}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium hover:bg-white/10"
                  style={{
                    color: rackCollapsed ? palette.colors.primary : 'var(--pg-text-muted)',
                    backgroundColor: rackCollapsed ? `${palette.colors.primary}1a` : 'transparent',
                  }}
                >
                  {rackCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                  <span>{rackCollapsed ? 'Show Rack' : 'Collapse Rack'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2 pointer-events-none">
                <div
                  className="w-12 h-1 rounded-full transition-colors"
                  style={{
                    backgroundColor:
                      activeSplitter === 'vertical'
                        ? palette.colors.primary
                        : 'var(--pg-border-strong)',
                  }}
                />
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (bottomCollapsed) {
                      setBottomCollapsed(false);
                    } else {
                      setRackCollapsed(false);
                      setBottomCollapsed(true);
                    }
                  }}
                  title={
                    bottomCollapsed
                      ? 'Expand Piano Roll / Playlist'
                      : 'Collapse Piano Roll / Playlist'
                  }
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium hover:bg-white/10"
                  style={{
                    color: bottomCollapsed ? palette.colors.primary : 'var(--pg-text-muted)',
                    backgroundColor: bottomCollapsed ? `${palette.colors.primary}1a` : 'transparent',
                  }}
                >
                  {bottomCollapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  <span>
                    {bottomCollapsed
                      ? `Show ${bottomTab === 'pianoroll' ? 'Piano Roll' : 'Playlist'}`
                      : `Collapse ${bottomTab === 'pianoroll' ? 'Piano Roll' : 'Playlist'}`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Bottom Section: Piano Roll / Playlist Arrangement Tabs */}
          {showBottom && selectedChannel && !(layout === 'split' && bottomCollapsed) && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {layout === 'split' && (
              <div
                className="px-3 flex items-center gap-2 shrink-0"
                style={{
                  backgroundColor: 'var(--pg-panel)',
                  borderBottom: '1px solid var(--pg-border)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setBottomTab('pianoroll')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
                  style={{
                    color:
                      bottomTab === 'pianoroll'
                        ? palette.colors.primary
                        : 'var(--pg-text-muted)',
                    borderBottom:
                      bottomTab === 'pianoroll'
                        ? `2px solid ${palette.colors.primary}`
                        : '2px solid transparent',
                  }}
                >
                  <Music2 size={12} />
                  <span>Piano Roll ({selectedChannel.name})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab('playlist')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
                  style={{
                    color:
                      bottomTab === 'playlist'
                        ? palette.colors.primary
                        : 'var(--pg-text-muted)',
                    borderBottom:
                      bottomTab === 'playlist'
                        ? `2px solid ${palette.colors.primary}`
                        : '2px solid transparent',
                  }}
                >
                  <Layers size={12} />
                  <span>Arrangement Playlist ({project.playlistClips.length} clips)</span>
                </button>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-hidden">
              {activeBottomMode === 'pianoroll' ? (
                <PianoRollView
                  channels={project.channels}
                  selectedChannel={selectedChannel}
                  pattern={activePattern}
                  playheadStep={playheadStep}
                  isPlaying={isPlaying}
                  palette={palette}
                  onSelectChannel={(cid) =>
                    onUpdateProject((p) => ({ ...p, selectedChannelId: cid }))
                  }
                  onChangeNotes={(cid, nextNotes) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      channels: prev.channels.map((c) =>
                        c.id === cid ? { ...c, usePianoRoll: nextNotes.length > 0 } : c
                      ),
                      patterns: prev.patterns.map((pat) =>
                        pat.id === activePattern.id
                          ? { ...pat, notes: { ...pat.notes, [cid]: nextNotes } }
                          : pat
                      ),
                    }))
                  }
                  onImportStepsToPianoRoll={handleImportStepsToPianoRoll}
                  onAuditionNote={onAuditionNote}
                />
              ) : (
                <PlaylistArrangementView
                  patterns={project.patterns}
                  activePatternId={activePattern.id}
                  clips={project.playlistClips}
                  totalBars={project.totalBars}
                  songPlayBar={songPlayBar}
                  songPlaying={isPlaying && project.songMode}
                  palette={palette}
                  onSelectPattern={(pid) =>
                    onUpdateProject((p) => ({ ...p, activePatternId: pid }))
                  }
                  onPlaceClip={(trackIndex, startBar, patternId) => {
                    const pat = project.patterns.find((x) => x.id === patternId);
                    const lenBars = Math.max(1, Math.round((pat?.stepsCount ?? 16) / 16));
                    onUpdateProject((prev) => ({
                      ...prev,
                      playlistClips: [
                        ...prev.playlistClips,
                        {
                          id: `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
                          trackIndex,
                          startBar,
                          lengthBars: lenBars,
                          patternId,
                        },
                      ],
                    }));
                  }}
                  onDeleteClip={(clipId) =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      playlistClips: prev.playlistClips.filter((c) => c.id !== clipId),
                    }))
                  }
                  onExpandBars={() =>
                    onUpdateProject((prev) => ({
                      ...prev,
                      totalBars: Math.min(64, prev.totalBars + 8),
                    }))
                  }
                  onClearArrangement={() =>
                    onUpdateProject((prev) => ({ ...prev, playlistClips: [] }))
                  }
                />
              )}
            </div>
          </div>
        )}
        </div>

        {/* Docked Expandable Master + Multi-Channel Mixer Console (Resizable Leftward + Collapsible) */}
        {selectedChannel && showMixer ? (
          <>
            <div
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                e.preventDefault();
                setActiveSplitter('horizontal');
              }}
              onDoubleClick={() => setMixerWidthPx(286)}
              title="Drag leftward to expand Mixer Console · Double-click to reset"
              className="w-2 shrink-0 flex flex-col items-center justify-center gap-2 cursor-col-resize select-none group transition-colors"
              style={{
                backgroundColor:
                  activeSplitter === 'horizontal'
                    ? `${palette.colors.primary}26`
                    : 'var(--pg-panel)',
                borderLeft: '1px solid var(--pg-border-strong)',
                borderRight: '1px solid var(--pg-border)',
              }}
            >
              <button
                type="button"
                onClick={() => setShowMixer(false)}
                title="Collapse Mixer Console"
                className="w-4 h-6 rounded flex items-center justify-center hover:bg-white/10"
                style={{ color: 'var(--pg-text-muted)' }}
              >
                <ChevronRight size={11} />
              </button>
              <div
                className="w-1 h-10 rounded-full"
                style={{
                  backgroundColor:
                    activeSplitter === 'horizontal'
                      ? palette.colors.primary
                      : 'var(--pg-border-strong)',
                }}
              />
            </div>

            <div
              style={{ width: `${mixerWidthPx}px` }}
              className="shrink-0 min-h-0 overflow-hidden"
            >
              <MasterMixerPanel
                channels={project.channels}
                tracks={mixerTracks}
                masterMixer={masterMixer}
                masterMuted={Boolean(project.masterMuted)}
                selectedChannelId={selectedChannel.id}
                masterGain={masterGain}
                masterLimiter={masterLimiter}
                pitoEq={pitoEq}
                bpm={bpm}
                audioEnabled={audioEnabled}
                mixerWidthPx={mixerWidthPx}
                palette={palette}
                onSelectChannel={(cid) =>
                  onUpdateProject((p) => ({ ...p, selectedChannelId: cid }))
                }
                onUpdateChannel={updateChannel}
                onUpdateMasterMixer={handleUpdateMasterMixer}
                onToggleMasterMuted={() =>
                  onUpdateProject((prev) => ({
                    ...prev,
                    masterMuted: !prev.masterMuted,
                  }))
                }
                onUpdateTrack={handleUpdateMixerTrack}
                onAddTrack={handleAddMixerTrack}
                onDeleteTrack={handleDeleteMixerTrack}
                onRequestMixerWidth={requestMixerWidth}
                onChangeMasterGain={onChangeMasterGain}
                onChangeMasterLimiter={onChangeMasterLimiter}
                onChangePitoEq={onChangePitoEq}
                onCollapse={() => setShowMixer(false)}
              />
            </div>
          </>
        ) : (
          selectedChannel && (
            <button
              type="button"
              onClick={() => setShowMixer(true)}
              title="Expand Master Mixer & Limiter"
              className="w-6 shrink-0 flex flex-col items-center justify-center gap-2 hover:bg-white/5 transition-colors"
              style={{
                backgroundColor: 'var(--pg-panel)',
                borderLeft: '1px solid var(--pg-border-strong)',
                color: 'var(--pg-text-muted)',
              }}
            >
              <ChevronLeft size={13} style={{ color: palette.colors.secondary }} />
              <span
                className="text-[9px] font-mono tracking-widest uppercase"
                style={{ writingMode: 'vertical-rl' }}
              >
                Mixer
              </span>
            </button>
          )
        )}
      </div>

      {/* 3xOsc Per-Channel Surface Canvas Instance Modal */}
      {editingChannel && (
        <StudioThreeXOscModal
          channel={editingChannel}
          bpm={bpm}
          audioEnabled={audioEnabled}
          isPlaying={isPlaying}
          playheadStep={playheadStep}
          palette={palette}
          onChangeChannel={(patch) => updateChannel(editingChannel.id, patch)}
          onCaptureMainSurface={onCaptureMainSurface}
          onAuditionNote={(note, isOn) => onAuditionNote(editingChannel.id, note, isOn, 0.85)}
          onToggleAudio={onToggleAudio}
          onTogglePlay={onTogglePlay}
          onClose={() => setEditingChannelId(null)}
        />
      )}
    </div>
  );
};
