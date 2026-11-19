import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AudioWaveform, Download, PanelLeft, Piano, Sliders, X } from 'lucide-react';
import {
  ComponentLfoConfig,
  ModuleGroup,
  ModuleValues,
  PaletteItemDefinition,
  SamplerConfig,
  StudioChannel,
  SurfaceTab,
  SynthModule,
  ThemePalette,
  ThreeXOscParams,
} from '../types/synth';
import { resolveAccentHex } from '../data/themes';
import {
  BASE_CELL_H,
  BASE_CELL_W,
  BASE_GAP,
  createModuleFromPalette,
  findOpenPixelSlot,
  getModulePixelRect,
  hydrateModulesWithPixels,
} from '../data/presets';
import {
  THREE_X_OSC_CHANNEL_PRESETS,
  buildChannelSurface,
  extractThreeXOscParamsFromModules,
  syncParamsIntoModules,
} from '../audio/threeXOscPresets';
import { evalLfoSample, isLfoModActive, resolveEffectiveLfo } from '../audio/lfoMath';
import { SurfaceCanvas } from './SurfaceCanvas';
import { PaletteSidebar } from './PaletteSidebar';
import { ControllerContextMenu } from './ControllerContextMenu';
import { ModulationOverlay } from './ModulationOverlay';
import { SampleWaveEditor } from './SampleWaveEditor';

interface SurfaceTemplate {
  tabs: SurfaceTab[];
  modules: SynthModule[];
  groups: ModuleGroup[];
  params: ThreeXOscParams;
}

interface StudioThreeXOscModalProps {
  channel: StudioChannel;
  bpm: number;
  audioEnabled: boolean;
  isPlaying: boolean;
  playheadStep: number;
  palette: ThemePalette;
  onChangeChannel: (patch: Partial<StudioChannel>) => void;
  onCaptureMainSurface: () => SurfaceTemplate;
  onAuditionNote: (note: number, isOn: boolean) => void;
  onToggleAudio: () => void;
  onTogglePlay: () => void;
  onClose: () => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function formatMidiNote(midi: number): string {
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${oct}`;
}

export const StudioThreeXOscModal: React.FC<StudioThreeXOscModalProps> = ({
  channel,
  bpm,
  audioEnabled,
  isPlaying,
  playheadStep,
  palette,
  onChangeChannel,
  onCaptureMainSurface,
  onAuditionNote,
  onToggleAudio,
  onTogglePlay,
  onClose,
}) => {
  const accentHex = resolveAccentHex(channel.accent, palette);

  const fallbackSurface = useMemo(
    () => buildChannelSurface(channel.params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channel.id]
  );

  const tabs = channel.surfaceTabs ?? fallbackSurface.surfaceTabs;
  const modules = channel.surfaceModules ?? fallbackSurface.surfaceModules;
  const groups = channel.surfaceGroups ?? fallbackSurface.surfaceGroups;

  const [activeTabId, setActiveTabId] = useState<string>(tabs[0]?.id ?? 'tab-3xosc');
  const [viewMode, setViewMode] = useState<'waveview' | 'surface'>(() =>
    channel.params.sampler?.enabled ? 'waveview' : 'surface'
  );
  const [performMode, setPerformMode] = useState(true);
  const [showPalette, setShowPalette] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);
  const [draggingPaletteItem, setDraggingPaletteItem] =
    useState<PaletteItemDefinition | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    moduleId: string;
    x: number;
    y: number;
  } | null>(null);
  const [modulationModalId, setModulationModalId] = useState<string | null>(null);
  const [modulatedValues, setModulatedValues] = useState<Record<string, number>>({});

  useEffect(() => {
    setViewMode(channel.params.sampler?.enabled ? 'waveview' : 'surface');
  }, [channel.id]);

  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTabId)) {
      setActiveTabId(tabs[0]?.id ?? 'tab-3xosc');
    }
  }, [tabs, activeTabId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !contextMenu && !modulationModalId) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, contextMenu, modulationModalId]);

  // Live LFO preview dots on the channel's Surface Canvas controllers
  const modulesRef = useRef(modules);
  modulesRef.current = modules;
  const startTimeRef = useRef(performance.now());
  const hasActiveLfo = useMemo(
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
    if (!hasActiveLfo) {
      setModulatedValues({});
      return;
    }
    let raf = 0;
    let lastUi = 0;
    const tick = (now: number) => {
      const elapsed = (now - startTimeRef.current) / 1000;
      const lookup = new Map<string, SynthModule>();
      modulesRef.current.forEach((m) => lookup.set(m.id, m));
      const nextUi: Record<string, number> = {};

      modulesRef.current.forEach((mod) => {
        if (!mod.lfo || !mod.lfo.enabled) return;
        const eff = resolveEffectiveLfo(mod.lfo, lookup);
        if (!isLfoModActive(eff)) return;
        const sample = evalLfoSample(eff, elapsed, bpm);
        const signedAmt = (eff.amount - 0.5) * 2;
        const base = mod.values.primary ?? 0.5;
        nextUi[mod.id] = Math.max(0, Math.min(1, base + sample * signedAmt));
      });

      if (now - lastUi >= 30) {
        lastUi = now;
        setModulatedValues(nextUi);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hasActiveLfo, bpm]);

  const commitSurface = (
    nextModules: SynthModule[],
    nextTabs: SurfaceTab[] = tabs,
    nextGroups: ModuleGroup[] = groups,
    extraPatch?: Partial<StudioChannel>
  ) => {
    const nextParams = extractThreeXOscParamsFromModules(
      nextModules,
      bpm,
      channel.params.sampler
    );
    onChangeChannel({
      surfaceTabs: nextTabs,
      surfaceModules: nextModules,
      surfaceGroups: nextGroups,
      params: nextParams,
      ...extraPatch,
    });
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
    () => (modulationModalId ? modules.find((m) => m.id === modulationModalId) ?? null : null),
    [modulationModalId, modules]
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-3 md:p-5"
      style={{ backgroundColor: 'rgba(8, 10, 14, 0.62)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Surface Canvas Instance · ${channel.name}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[1160px] h-[86vh] rounded-lg shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--pg-canvas)',
          border: `1px solid ${accentHex}77`,
          color: 'var(--pg-text)',
        }}
      >
        {/* Channel Surface Instance Modal Header */}
        <div
          className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: 'var(--pg-surface)',
            borderBottom: '1px solid var(--pg-border)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {channel.params.sampler?.enabled ? (
              <AudioWaveform size={14} style={{ color: accentHex }} />
            ) : (
              <Sliders size={14} style={{ color: accentHex }} />
            )}
            <input
              type="text"
              value={channel.name}
              onChange={(e) => onChangeChannel({ name: e.target.value })}
              className="px-2 py-0.5 rounded text-xs font-semibold outline-none w-36"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            />

            {/* Mode Switcher: WaveView Sample Editor vs 3xOsc Surface */}
            <div
              className="flex items-center rounded overflow-hidden shrink-0"
              style={{ border: '1px solid var(--pg-border)' }}
            >
              <button
                type="button"
                onClick={() => setViewMode('waveview')}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold"
                style={{
                  backgroundColor: viewMode === 'waveview' ? `${accentHex}2a` : 'var(--pg-canvas)',
                  color: viewMode === 'waveview' ? accentHex : 'var(--pg-text-muted)',
                }}
              >
                <AudioWaveform size={12} />
                <span>WaveView Sampler</span>
                {channel.params.sampler?.enabled && (
                  <span
                    className="w-1.5 h-1.5 rounded-full ml-0.5"
                    style={{ backgroundColor: accentHex }}
                  />
                )}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('surface')}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold"
                style={{
                  backgroundColor: viewMode === 'surface' ? `${accentHex}2a` : 'var(--pg-canvas)',
                  color: viewMode === 'surface' ? accentHex : 'var(--pg-text-muted)',
                }}
              >
                <Sliders size={12} />
                <span>3xOsc / Filter / Env</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <label
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono"
              style={{
                backgroundColor: 'var(--pg-panel)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text-muted)',
              }}
            >
              <span>Step Note</span>
              <select
                value={channel.rootNote}
                onChange={(e) => onChangeChannel({ rootNote: Number(e.target.value) })}
                className="bg-transparent font-semibold outline-none"
                style={{ color: 'var(--pg-text)' }}
              >
                {Array.from({ length: 108 }, (_, idx) => idx + 12).map((midi) => (
                  <option key={midi} value={midi} className="bg-[#151820] text-[#ECEEF2]">
                    {formatMidiNote(midi)}
                  </option>
                ))}
              </select>
            </label>

            <select
              value=""
              onChange={(e) => {
                const preset = THREE_X_OSC_CHANNEL_PRESETS.find((x) => x.id === e.target.value);
                if (!preset) return;
                const nextParams: ThreeXOscParams = {
                  ...preset.buildParams(),
                  sampler: channel.params.sampler
                    ? { ...channel.params.sampler, enabled: false }
                    : undefined,
                };
                const updatedMods = hydrateModulesWithPixels(
                  syncParamsIntoModules(modules, nextParams)
                );
                onChangeChannel({
                  presetTag: preset.name,
                  rootNote: preset.rootNote,
                  params: nextParams,
                  surfaceTabs: tabs,
                  surfaceModules: updatedMods,
                  surfaceGroups: groups,
                });
              }}
              className="px-2 py-1 rounded text-[11px] outline-none"
              style={{
                backgroundColor: 'var(--pg-panel)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              <option value="">Load 3xOsc Patch...</option>
              {THREE_X_OSC_CHANNEL_PRESETS.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                const tpl = onCaptureMainSurface();
                const nextTabs = tpl.tabs.map((t) => ({ ...t }));
                const nextMods = hydrateModulesWithPixels(
                  syncParamsIntoModules(tpl.modules, tpl.params)
                );
                const nextGrps = tpl.groups.map((g) => ({ ...g }));
                onChangeChannel({
                  presetTag: 'Main Surface',
                  params: { ...tpl.params, sampler: channel.params.sampler },
                  surfaceTabs: nextTabs,
                  surfaceModules: nextMods,
                  surfaceGroups: nextGrps,
                });
              }}
              title="Clone your current main Surface Canvas layout & patch into this channel"
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium"
              style={{
                backgroundColor: 'var(--pg-panel)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              <Download size={12} style={{ color: accentHex }} />
              <span>Clone Main Surface</span>
            </button>

            {viewMode === 'surface' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setPerformMode((p) => {
                      const next = !p;
                      if (next) setShowPalette(false);
                      return next;
                    });
                  }}
                  className="px-2.5 py-1 rounded text-[11px] font-semibold"
                  style={{
                    backgroundColor: !performMode ? palette.colors.primary : 'var(--pg-panel)',
                    color: !performMode ? 'var(--pg-primary-text)' : 'var(--pg-text)',
                    border: '1px solid var(--pg-border)',
                  }}
                >
                  {performMode ? 'Edit Surface' : 'Perform Mode'}
                </button>

                {!performMode && (
                  <button
                    type="button"
                    onClick={() => setShowPalette((v) => !v)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium"
                    style={{
                      backgroundColor: showPalette ? accentHex : 'var(--pg-panel)',
                      color: showPalette ? 'var(--pg-primary-text)' : 'var(--pg-text)',
                      border: '1px solid var(--pg-border)',
                    }}
                  >
                    <PanelLeft size={12} />
                    <span>Palette</span>
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onPointerDown={() => onAuditionNote(channel.rootNote, true)}
              onPointerUp={() => onAuditionNote(channel.rootNote, false)}
              onPointerLeave={() => onAuditionNote(channel.rootNote, false)}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold"
              style={{
                backgroundColor: accentHex,
                color: 'var(--pg-primary-text)',
              }}
            >
              <Piano size={12} />
              <span>Test {formatMidiNote(channel.rootNote)}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:opacity-80"
              style={{ color: 'var(--pg-text-muted)' }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Embedded WaveView Sample Editor OR Live Surface Canvas Instance */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {viewMode === 'waveview' ? (
            <SampleWaveEditor
              channelId={channel.id}
              params={channel.params}
              rootNote={channel.rootNote}
              accentHex={accentHex}
              palette={palette}
              onChangeSampler={(nextSampler: SamplerConfig) => {
                onChangeChannel({
                  presetTag: nextSampler.enabled
                    ? `Sampler · ${nextSampler.sampleName}`
                    : channel.presetTag.startsWith('Sampler')
                      ? '3xOsc Synth'
                      : channel.presetTag,
                  params: {
                    ...channel.params,
                    sampler: nextSampler,
                  },
                });
              }}
              onChangeChannelMeta={(patch) => onChangeChannel(patch)}
              onAuditionNote={onAuditionNote}
            />
          ) : (
            <>
              {!performMode && showPalette && (
                <PaletteSidebar
                  onAddModule={(def) => {
                    const pw = Math.max(76, def.defaultW * BASE_CELL_W - BASE_GAP);
                    const ph = Math.max(62, def.defaultH * BASE_CELL_H - BASE_GAP);
                    const tabMods = modules.filter(
                      (m) => (m.tabId ?? tabs[0]?.id ?? 'tab-3xosc') === activeTabId
                    );
                    const slot = findOpenPixelSlot(pw, ph, tabMods);
                    const mod = createModuleFromPalette(def, 0, 0, slot.px, slot.py, activeTabId);
                    commitSurface([...modules, mod], tabs, groups);
                    setSelectedId(mod.id);
                  }}
                  onDragStartItem={setDraggingPaletteItem}
                  onDragEndItem={() => setDraggingPaletteItem(null)}
                />
              )}

          <SurfaceCanvas
            embedded
            rigName={channel.name}
            tabs={tabs}
            activeTabId={activeTabId}
            modules={modules}
            groups={groups}
            selectedId={selectedId}
            multiSelectedIds={multiSelectedIds}
            compactMode={compactMode}
            performMode={performMode}
            palette={palette}
            audioEnabled={audioEnabled}
            bpm={bpm}
            transportPlaying={isPlaying}
            currentStep={Math.floor(playheadStep)}
            snapshots={[]}
            activeSnapshotId={null}
            draggingPaletteItem={draggingPaletteItem}
            modulatedValues={modulatedValues}
            onSelectTab={(tid) => {
              setActiveTabId(tid);
              setSelectedId(null);
              setMultiSelectedIds([]);
            }}
            onAddTab={() => {
              const newId = `tab-${Date.now().toString(36)}`;
              const nextTabs = [...tabs, { id: newId, label: `Pane ${tabs.length + 1}` }];
              commitSurface(modules, nextTabs, groups);
              setActiveTabId(newId);
            }}
            onRenameTab={(tid, label) => {
              commitSurface(
                modules,
                tabs.map((t) => (t.id === tid ? { ...t, label } : t)),
                groups
              );
            }}
            onDeleteTab={(tid) => {
              if (tabs.length <= 1) return;
              const remaining = tabs.filter((t) => t.id !== tid);
              const nextMods = modules.filter((m) => (m.tabId ?? tabs[0].id) !== tid);
              commitSurface(nextMods, remaining, groups);
              if (activeTabId === tid) setActiveTabId(remaining[0].id);
            }}
            onSelectModule={(id, shiftKey) => {
              if (!id) {
                setSelectedId(null);
                setMultiSelectedIds([]);
              } else if (shiftKey) {
                setMultiSelectedIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                );
                setSelectedId(id);
              } else {
                setSelectedId(id);
                setMultiSelectedIds([id]);
              }
            }}
            onOpenContextMenu={(moduleId, x, y) => setContextMenu({ moduleId, x, y })}
            onDropNewModule={(def, px, py) => {
              const mod = createModuleFromPalette(def, 0, 0, px, py, activeTabId);
              commitSurface([...modules, mod], tabs, groups);
              setSelectedId(mod.id);
            }}
            onMoveModule={(id, px, py) => {
              commitSurface(
                modules.map((m) => (m.id === id ? { ...m, px, py } : m)),
                tabs,
                groups
              );
            }}
            onMoveGroup={(groupId, dx, dy) => {
              commitSurface(
                modules.map((m) => {
                  if (m.groupId !== groupId) return m;
                  const r = getModulePixelRect(m);
                  return { ...m, px: Math.max(0, r.px + dx), py: Math.max(24, r.py + dy) };
                }),
                tabs,
                groups
              );
            }}
            onResizeModule={(id, pw, ph) => {
              commitSurface(
                modules.map((m) => (m.id === id ? { ...m, pw, ph } : m)),
                tabs,
                groups
              );
            }}
            onDeleteModule={(id) => {
              commitSurface(
                modules.filter((m) => m.id !== id),
                tabs,
                groups
              );
            }}
            onDuplicateModule={(id) => {
              const src = modules.find((m) => m.id === id);
              if (!src) return;
              const r = getModulePixelRect(src);
              const tabMods = modules.filter(
                (m) => (m.tabId ?? tabs[0]?.id ?? 'tab-3xosc') === (src.tabId ?? activeTabId)
              );
              const slot = findOpenPixelSlot(r.pw, r.ph, tabMods);
              const clone: SynthModule = {
                ...structuredClone(src),
                id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                label: `${src.label} Copy`,
                px: slot.px,
                py: slot.py,
                groupId: undefined,
              };
              commitSurface([...modules, clone], tabs, groups);
            }}
            onModuleValueChange={(id, vals: Partial<ModuleValues>) => {
              const nextMods = modules.map((m) =>
                m.id === id ? { ...m, values: { ...m.values, ...vals } } : m
              );
              commitSurface(nextMods, tabs, groups, { presetTag: 'Custom Surface' });
            }}
            onModuleLfoChange={(id, lfo: ComponentLfoConfig) => {
              const nextMods = modules.map((m) => (m.id === id ? { ...m, lfo } : m));
              commitSurface(nextMods, tabs, groups);
            }}
            onTriggerNote={(_mod, note, _vel, isOn) => onAuditionNote(note, isOn)}
            onTriggerDrum={(_mod, _pad, note, _vel, isOn) => onAuditionNote(note, isOn)}
            onChangePalette={() => {}}
            onToggleAudio={onToggleAudio}
            onToggleTransport={onTogglePlay}
            onChangeBpm={() => {}}
            onRecallSnapshot={() => {}}
            onStoreSnapshot={() => {}}
            onToggleCompactMode={() => setCompactMode((c) => !c)}
            onGlueSelected={() => {}}
            onGlueAllCompact={() => {}}
            onUngroup={(gid) => {
              commitSurface(
                modules.map((m) => (m.groupId === gid ? { ...m, groupId: undefined } : m)),
                tabs,
                groups.filter((g) => g.id !== gid)
              );
            }}
              onClearBoard={() => {}}
            />
            </>
          )}
        </div>
      </div>

      {contextMenu && contextMenuModule && (
        <ControllerContextMenu
          module={contextMenuModule}
          allModules={modules}
          group={contextMenuGroup}
          palette={palette}
          bpm={bpm}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onUpdateModule={(id, updater) => {
            commitSurface(
              modules.map((m) => (m.id === id ? updater(m) : m)),
              tabs,
              groups
            );
          }}
          onValueChange={(id, vals) => {
            commitSurface(
              modules.map((m) =>
                m.id === id ? { ...m, values: { ...m.values, ...vals } } : m
              ),
              tabs,
              groups
            );
          }}
          onUpdateLfo={(id, lfo) => {
            commitSurface(
              modules.map((m) => (m.id === id ? { ...m, lfo } : m)),
              tabs,
              groups
            );
          }}
          onOpenModulation={(id) => setModulationModalId(id)}
          onDeleteModulation={(id) => {
            commitSurface(
              modules.map((m) => (m.id === id ? { ...m, lfo: undefined } : m)),
              tabs,
              groups
            );
          }}
          onDuplicateModule={(id) => {
            const src = modules.find((m) => m.id === id);
            if (!src) return;
            const r = getModulePixelRect(src);
            const slot = findOpenPixelSlot(r.pw, r.ph, modules);
            const clone: SynthModule = {
              ...structuredClone(src),
              id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              label: `${src.label} Copy`,
              px: slot.px,
              py: slot.py,
              groupId: undefined,
            };
            commitSurface([...modules, clone], tabs, groups);
          }}
          onDeleteModule={(id) => {
            commitSurface(
              modules.filter((m) => m.id !== id),
              tabs,
              groups
            );
          }}
          onRemoveFromGroup={(id) => {
            commitSurface(
              modules.map((m) => (m.id === id ? { ...m, groupId: undefined } : m)),
              tabs,
              groups
            );
          }}
        />
      )}

      {modulationModalModule && (
        <ModulationOverlay
          module={modulationModalModule}
          allModules={modules}
          palette={palette}
          bpm={bpm}
          onUpdateLfo={(lfo) => {
            commitSurface(
              modules.map((m) =>
                m.id === modulationModalModule.id ? { ...m, lfo } : m
              ),
              tabs,
              groups
            );
          }}
          onDeleteModulation={() => {
            commitSurface(
              modules.map((m) =>
                m.id === modulationModalModule.id ? { ...m, lfo: undefined } : m
              ),
              tabs,
              groups
            );
          }}
          onClose={() => setModulationModalId(null)}
        />
      )}
    </div>
  );
};
