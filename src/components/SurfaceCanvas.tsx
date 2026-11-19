import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Eraser,
  Layers,
  Link2,
  Magnet,
  Maximize2,
  Minimize2,
  Palette,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Ungroup,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ComponentLfoConfig,
  ModuleGroup,
  ModuleValues,
  PaletteId,
  PaletteItemDefinition,
  PerformanceSnapshot,
  SnapMode,
  SurfaceTab,
  SynthModule,
  ThemePalette,
} from '../types/synth';
import {
  BASE_CELL_W,
  BASE_CELL_H,
  BASE_GAP,
  PALETTE_CONTROLLERS,
  getModulePixelRect,
} from '../data/presets';
import { THEME_PALETTES, resolveAccentHex } from '../data/themes';
import { ModuleRenderer } from './controllers/ModuleRenderer';

interface SurfaceCanvasProps {
  rigName: string;
  tabs: SurfaceTab[];
  activeTabId: string;
  modules: SynthModule[];
  groups: ModuleGroup[];
  selectedId: string | null;
  multiSelectedIds: string[];
  compactMode: boolean;
  performMode: boolean;
  palette: ThemePalette;
  audioEnabled: boolean;
  bpm: number;
  transportPlaying: boolean;
  currentStep: number;
  snapshots: PerformanceSnapshot[];
  activeSnapshotId: string | null;
  draggingPaletteItem: PaletteItemDefinition | null;
  modulatedValues: Record<string, number>;
  onSelectTab: (tabId: string) => void;
  onAddTab: () => void;
  onRenameTab: (tabId: string, label: string) => void;
  onDeleteTab: (tabId: string) => void;
  onSelectModule: (id: string | null, shiftKey?: boolean) => void;
  onOpenContextMenu: (id: string, clientX: number, clientY: number) => void;
  onDropNewModule: (def: PaletteItemDefinition, px: number, py: number) => void;
  onMoveModule: (id: string, px: number, py: number) => void;
  onMoveGroup: (groupId: string, dx: number, dy: number) => void;
  onResizeModule: (id: string, pw: number, ph: number) => void;
  onDeleteModule: (id: string) => void;
  onDuplicateModule: (id: string) => void;
  onModuleValueChange: (id: string, values: Partial<ModuleValues>) => void;
  onModuleLfoChange: (id: string, lfo: ComponentLfoConfig) => void;
  onTriggerNote: (module: SynthModule, note: number, velocity: number, isOn: boolean) => void;
  onTriggerDrum: (
    module: SynthModule,
    padIdx: number,
    note: number,
    velocity: number,
    isOn: boolean
  ) => void;
  onChangePalette: (id: PaletteId) => void;
  onToggleAudio: () => void;
  onToggleTransport: () => void;
  onChangeBpm: (bpm: number) => void;
  onRecallSnapshot: (id: PerformanceSnapshot['id']) => void;
  onStoreSnapshot: (id: PerformanceSnapshot['id']) => void;
  onToggleCompactMode: () => void;
  onGlueSelected: () => void;
  onGlueAllCompact: () => void;
  onUngroup: (groupId: string) => void;
  onClearBoard: () => void;
  canUndo?: boolean;
  onUndo?: () => void;
  embedded?: boolean;
}

const BOARD_W = 1600;
const BOARD_H = 1040;

export const SurfaceCanvas: React.FC<SurfaceCanvasProps> = ({
  rigName,
  tabs,
  activeTabId,
  modules,
  groups,
  selectedId,
  multiSelectedIds,
  compactMode,
  performMode,
  palette,
  audioEnabled,
  bpm,
  transportPlaying,
  currentStep,
  snapshots,
  activeSnapshotId,
  draggingPaletteItem,
  modulatedValues,
  onSelectTab,
  onAddTab,
  onRenameTab,
  onDeleteTab,
  onSelectModule,
  onOpenContextMenu,
  onDropNewModule,
  onMoveModule,
  onMoveGroup,
  onResizeModule,
  onDeleteModule,
  onDuplicateModule,
  onModuleValueChange,
  onModuleLfoChange,
  onTriggerNote,
  onTriggerDrum,
  onChangePalette,
  onToggleAudio,
  onToggleTransport,
  onChangeBpm,
  onRecallSnapshot,
  onStoreSnapshot,
  onToggleCompactMode,
  onGlueSelected,
  onGlueAllCompact,
  onUngroup,
  onClearBoard,
  canUndo,
  onUndo,
  embedded = false,
}) => {
  const boardRef = useRef<HTMLDivElement>(null);
  const [paletteMenuOpen, setPaletteMenuOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [snapMode, setSnapMode] = useState<SnapMode>('free');
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [tabDraft, setTabDraft] = useState('');

  const [dropPreview, setDropPreview] = useState<{
    px: number;
    py: number;
    pw: number;
    ph: number;
  } | null>(null);

  const tapTimesRef = useRef<number[]>([]);

  const snapValue = (v: number): number => {
    if (snapMode === 'fine') return Math.round(v / 8) * 8;
    if (snapMode === 'grid') return Math.round(v / 24) * 24;
    return Math.round(v);
  };

  const clientToBoard = (clientX: number, clientY: number) => {
    const el = boardRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / zoom,
      y: (clientY - rect.top) / zoom,
    };
  };

  const handleTapTempo = () => {
    const now = performance.now();
    const recent = tapTimesRef.current.filter((t) => now - t < 2200);
    recent.push(now);
    tapTimesRef.current = recent;
    if (recent.length >= 2) {
      const diffs: number[] = [];
      for (let i = 1; i < recent.length; i++) {
        diffs.push(recent[i] - recent[i - 1]);
      }
      const avgMs = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const nextBpm = Math.max(50, Math.min(200, Math.round(60000 / avgMs)));
      onChangeBpm(nextBpm);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (performMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    const dragName = e.dataTransfer.getData('application/x-patchgrid-name');
    const dragType = e.dataTransfer.getData('application/x-patchgrid-type');
    const def =
      draggingPaletteItem ||
      (dragName ? PALETTE_CONTROLLERS.find((p) => p.name === dragName) : undefined) ||
      PALETTE_CONTROLLERS.find((p) => p.type === dragType);
    if (!def) return;

    const pt = clientToBoard(e.clientX, e.clientY);
    const pw = Math.max(76, def.defaultW * BASE_CELL_W - BASE_GAP);
    const ph = Math.max(62, def.defaultH * BASE_CELL_H - BASE_GAP);
    const px = Math.max(8, Math.min(BOARD_W - pw - 8, snapValue(pt.x - pw / 2)));
    const py = Math.max(8, Math.min(BOARD_H - ph - 8, snapValue(pt.y - ph / 2)));
    setDropPreview({ px, py, pw, ph });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDropPreview(null);
    if (performMode) return;

    const name = e.dataTransfer.getData('application/x-patchgrid-name');
    const type = e.dataTransfer.getData('application/x-patchgrid-type');
    const def =
      draggingPaletteItem ||
      (name ? PALETTE_CONTROLLERS.find((p) => p.name === name) : undefined) ||
      PALETTE_CONTROLLERS.find((p) => p.type === type);
    if (!def) return;

    const pt = clientToBoard(e.clientX, e.clientY);
    const pw = Math.max(76, def.defaultW * BASE_CELL_W - BASE_GAP);
    const ph = Math.max(62, def.defaultH * BASE_CELL_H - BASE_GAP);
    const px = Math.max(8, Math.min(BOARD_W - pw - 8, snapValue(pt.x - pw / 2)));
    const py = Math.max(8, Math.min(BOARD_H - ph - 8, snapValue(pt.y - ph / 2)));
    onDropNewModule(def, px, py);
  };

  const activeDragRef = useRef<{
    kind: 'move' | 'resize' | 'group';
    id: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    lastDx: number;
    lastDy: number;
  } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = activeDragRef.current;
      if (!drag) return;

      const rawDx = (e.clientX - drag.startClientX) / zoom;
      const rawDy = (e.clientY - drag.startClientY) / zoom;

      if (drag.kind === 'move') {
        const nextX = Math.max(0, Math.min(BOARD_W - drag.origW, snapValue(drag.origX + rawDx)));
        const nextY = Math.max(0, Math.min(BOARD_H - drag.origH, snapValue(drag.origY + rawDy)));
        onMoveModule(drag.id, nextX, nextY);
      } else if (drag.kind === 'resize') {
        const nextW = Math.max(72, Math.min(BOARD_W - drag.origX, snapValue(drag.origW + rawDx)));
        const nextH = Math.max(58, Math.min(BOARD_H - drag.origY, snapValue(drag.origH + rawDy)));
        onResizeModule(drag.id, nextW, nextH);
      } else if (drag.kind === 'group') {
        const snappedDx = snapValue(rawDx);
        const snappedDy = snapValue(rawDy);
        const stepDx = snappedDx - drag.lastDx;
        const stepDy = snappedDy - drag.lastDy;
        if (stepDx !== 0 || stepDy !== 0) {
          drag.lastDx = snappedDx;
          drag.lastDy = snappedDy;
          onMoveGroup(drag.id, stepDx, stepDy);
        }
      }
    };

    const onUp = () => {
      activeDragRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [zoom, snapMode, onMoveModule, onResizeModule, onMoveGroup]);

  const handleStartMove = (mod: SynthModule, e: React.PointerEvent<HTMLDivElement>) => {
    if (performMode) return;
    e.stopPropagation();
    const rect = getModulePixelRect(mod);
    activeDragRef.current = {
      kind: 'move',
      id: mod.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: rect.px,
      origY: rect.py,
      origW: rect.pw,
      origH: rect.ph,
      lastDx: 0,
      lastDy: 0,
    };
  };

  const handleStartResize = (mod: SynthModule, e: React.PointerEvent<HTMLDivElement>) => {
    if (performMode) return;
    e.stopPropagation();
    const rect = getModulePixelRect(mod);
    activeDragRef.current = {
      kind: 'resize',
      id: mod.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: rect.px,
      origY: rect.py,
      origW: rect.pw,
      origH: rect.ph,
      lastDx: 0,
      lastDy: 0,
    };
  };

  const handleStartMoveGroup = (groupId: string, e: React.PointerEvent<HTMLDivElement>) => {
    if (performMode) return;
    e.stopPropagation();
    activeDragRef.current = {
      kind: 'group',
      id: groupId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: 0,
      origY: 0,
      origW: 0,
      origH: 0,
      lastDx: 0,
      lastDy: 0,
    };
  };

  const handleWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    setZoom((z) => Math.max(0.5, Math.min(1.6, Number((z + delta).toFixed(2)))));
  };

  const visibleModules = useMemo(() => {
    const fallbackTabId = tabs[0]?.id ?? 'tab-3xosc';
    return modules.filter((m) => (m.tabId ?? fallbackTabId) === activeTabId);
  }, [modules, tabs, activeTabId]);

  const groupBoxes = useMemo(() => {
    return groups
      .map((grp) => {
        const members = visibleModules.filter((m) => m.groupId === grp.id);
        if (members.length === 0) return null;
        const rects = members.map(getModulePixelRect);
        const minX = Math.min(...rects.map((r) => r.px));
        const minY = Math.min(...rects.map((r) => r.py));
        const maxX = Math.max(...rects.map((r) => r.px + r.pw));
        const maxY = Math.max(...rects.map((r) => r.py + r.ph));
        return {
          group: grp,
          px: minX - 6,
          py: minY - 24,
          pw: maxX - minX + 12,
          ph: maxY - minY + 30,
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
  }, [groups, visibleModules]);

  return (
    <div className="relative flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      {/* Workspace Control Toolbar */}
      {!embedded && (
        <div
          className="px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 shrink-0"
          style={{
            backgroundColor: 'var(--pg-surface)',
            borderBottom: '1px solid var(--pg-border)',
          }}
        >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xs font-semibold truncate max-w-[165px]" style={{ color: 'var(--pg-text)' }}>
            {rigName}
          </span>
          <span style={{ color: 'var(--pg-text-dim)' }} aria-hidden="true">·</span>

          {/* Transport + BPM */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleTransport}
              title={transportPlaying ? 'Pause sequencer clock' : 'Start sequencer clock'}
              className="w-7 h-7 rounded flex items-center justify-center transition-colors"
              style={{
                backgroundColor: transportPlaying ? 'var(--pg-secondary)' : 'var(--pg-panel)',
                color: transportPlaying ? 'var(--pg-primary-text)' : 'var(--pg-text)',
                border: '1px solid var(--pg-border)',
              }}
            >
              {transportPlaying ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <div
              className="flex items-center rounded px-2 py-1 gap-1"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
              }}
            >
              <span className="text-[10px] font-medium" style={{ color: 'var(--pg-text-muted)' }}>
                BPM
              </span>
              <input
                type="number"
                min={50}
                max={200}
                value={bpm}
                onChange={(e) => onChangeBpm(Math.max(50, Math.min(200, Number(e.target.value) || 120)))}
                className="w-9 bg-transparent text-xs font-mono tabular-nums text-right outline-none"
                style={{ color: 'var(--pg-text)' }}
              />
            </div>
            <button
              type="button"
              onClick={handleTapTempo}
              className="px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap"
              style={{
                backgroundColor: 'var(--pg-panel)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text-muted)',
              }}
            >
              Tap
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleAudio}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors"
            style={{
              backgroundColor: audioEnabled ? 'var(--pg-secondary)' : 'var(--pg-panel)',
              color: audioEnabled ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
              border: '1px solid var(--pg-border)',
            }}
          >
            {audioEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
            <span>{audioEnabled ? 'Audio On' : 'Audio'}</span>
          </button>
        </div>

        {/* Right Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {!performMode && (
            <>
              <div
                className="flex items-center gap-1 px-2 py-1 rounded"
                title="Positioning snap mode"
                style={{
                  backgroundColor: 'var(--pg-panel)',
                  border: '1px solid var(--pg-border)',
                }}
              >
                <Magnet size={12} style={{ color: 'var(--pg-text-muted)' }} />
                <select
                  value={snapMode}
                  onChange={(e) => setSnapMode(e.target.value as SnapMode)}
                  className="bg-transparent text-xs outline-none"
                  style={{ color: 'var(--pg-text)' }}
                >
                  <option value="free" className="bg-[#151820] text-[#ECEEF2]">Free Move</option>
                  <option value="fine" className="bg-[#151820] text-[#ECEEF2]">8px Snap</option>
                  <option value="grid" className="bg-[#151820] text-[#ECEEF2]">24px Grid</option>
                </select>
              </div>

              {multiSelectedIds.length >= 2 && (
                <button
                  type="button"
                  onClick={onGlueSelected}
                  title="Glue Shift-selected controllers into a compact group"
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--pg-secondary)',
                    color: 'var(--pg-primary-text)',
                  }}
                >
                  <Link2 size={12} />
                  <span>Glue ({multiSelectedIds.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={onGlueAllCompact}
                title="Glue all controllers into compact view"
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--pg-panel)',
                  border: '1px solid var(--pg-border)',
                  color: 'var(--pg-text)',
                }}
              >
                <Layers size={12} style={{ color: 'var(--pg-primary)' }} />
                <span>Glue All</span>
              </button>

              <button
                type="button"
                onClick={onToggleCompactMode}
                title="Toggle compact view"
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap"
                style={{
                  backgroundColor: compactMode ? 'var(--pg-primary)' : 'var(--pg-panel)',
                  color: compactMode ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
                  border: '1px solid var(--pg-border)',
                }}
              >
                <Minimize2 size={12} />
                <span>Compact</span>
              </button>

              {canUndo && onUndo && (
                <button
                  type="button"
                  onClick={onUndo}
                  title="Undo last controller edit or delete (Ctrl+Z)"
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--pg-panel)',
                    border: '1px solid var(--pg-border)',
                    color: 'var(--pg-text)',
                  }}
                >
                  <RotateCcw size={12} style={{ color: 'var(--pg-primary)' }} />
                  <span>Undo</span>
                </button>
              )}

              {visibleModules.length > 0 && (
                <button
                  type="button"
                  onClick={onClearBoard}
                  title="Erase all components from the active tab pane"
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--pg-panel)',
                    border: '1px solid var(--pg-border)',
                    color: 'var(--pg-alert)',
                  }}
                >
                  <Eraser size={12} />
                  <span>Clear</span>
                </button>
              )}
            </>
          )}

          {/* Performance Snapshots A/B/C/D */}
          <div className="flex items-center gap-1" title="Click to recall scene · Shift+Click to store">
            {snapshots.map((snap) => {
              const isActive = activeSnapshotId === snap.id;
              return (
                <button
                  key={snap.id}
                  type="button"
                  onClick={(e) => {
                    if (e.shiftKey || !snap.stored) {
                      onStoreSnapshot(snap.id);
                    } else {
                      onRecallSnapshot(snap.id);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onStoreSnapshot(snap.id);
                  }}
                  title={
                    snap.stored
                      ? `Recall Scene ${snap.id} (Shift+Click to overwrite)`
                      : `Store Scene ${snap.id}`
                  }
                  className="w-6 h-6 rounded text-[11px] font-mono tabular-nums font-semibold transition-colors"
                  style={{
                    backgroundColor: isActive
                      ? 'var(--pg-primary)'
                      : snap.stored
                        ? 'var(--pg-panel)'
                        : 'var(--pg-canvas)',
                    color: isActive
                      ? 'var(--pg-primary-text)'
                      : snap.stored
                        ? 'var(--pg-text)'
                        : 'var(--pg-text-dim)',
                    border: '1px solid var(--pg-border)',
                  }}
                >
                  {snap.id}
                </button>
              );
            })}
          </div>

          {/* Color Palette Switcher */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPaletteMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap"
              style={{
                backgroundColor: 'var(--pg-panel)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              <Palette size={13} style={{ color: 'var(--pg-primary)' }} />
              <span>{palette.name}</span>
            </button>

            {paletteMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setPaletteMenuOpen(false)}
                />
                <div
                  className="absolute right-0 mt-1.5 w-64 rounded-md p-1.5 z-40 shadow-xl"
                  style={{
                    backgroundColor: 'var(--pg-panel)',
                    border: '1px solid var(--pg-border-strong)',
                  }}
                >
                  <div
                    className="px-2 py-1 text-[11px] font-semibold"
                    style={{ color: 'var(--pg-text-muted)' }}
                  >
                    Surface Color Palettes
                  </div>
                  {THEME_PALETTES.map((p) => {
                    const current = p.id === palette.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onChangePalette(p.id);
                          setPaletteMenuOpen(false);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded flex items-center justify-between gap-2 transition-colors"
                        style={{
                          backgroundColor: current ? 'var(--pg-module-hover)' : 'transparent',
                        }}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate" style={{ color: 'var(--pg-text)' }}>
                            {p.name}
                          </div>
                          <div className="text-[10px] truncate" style={{ color: 'var(--pg-text-dim)' }}>
                            {p.subtitle}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.colors.canvas, border: '1px solid var(--pg-border-strong)' }} />
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.colors.primary }} />
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.colors.secondary }} />
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.colors.tertiary }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        </div>
      )}

      {/* Surface Tab Pane Bar */}
      <div
        className="px-4 flex items-center gap-1 shrink-0 overflow-x-auto"
        style={{
          backgroundColor: 'var(--pg-canvas)',
          borderBottom: '1px solid var(--pg-border)',
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const fallbackTabId = tabs[0]?.id ?? 'tab-3xosc';
          const count = modules.filter((m) => (m.tabId ?? fallbackTabId) === tab.id).length;
          const isEditing = editingTabId === tab.id;

          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              onDoubleClick={() => {
                if (performMode) return;
                setEditingTabId(tab.id);
                setTabDraft(tab.label);
              }}
              className="group relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium cursor-pointer select-none whitespace-nowrap transition-colors"
              style={{
                backgroundColor: isActive ? 'var(--pg-surface)' : 'transparent',
                color: isActive ? 'var(--pg-text)' : 'var(--pg-text-muted)',
                borderBottom: isActive
                  ? '2px solid var(--pg-primary)'
                  : '2px solid transparent',
                borderRight: '1px solid var(--pg-border)',
              }}
              title={performMode ? tab.label : `${tab.label} (Double-click to rename)`}
            >
              {isEditing ? (
                <input
                  type="text"
                  autoFocus
                  value={tabDraft}
                  onChange={(e) => setTabDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => {
                    if (tabDraft.trim()) onRenameTab(tab.id, tabDraft.trim());
                    setEditingTabId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (tabDraft.trim()) onRenameTab(tab.id, tabDraft.trim());
                      setEditingTabId(null);
                    } else if (e.key === 'Escape') {
                      setEditingTabId(null);
                    }
                  }}
                  className="w-28 px-1 py-0.5 rounded text-xs outline-none"
                  style={{
                    backgroundColor: 'var(--pg-panel)',
                    border: '1px solid var(--pg-primary)',
                    color: 'var(--pg-text)',
                  }}
                />
              ) : (
                <>
                  <span>{tab.label}</span>
                  <span
                    className="text-[10px] font-mono tabular-nums"
                    style={{ color: isActive ? 'var(--pg-primary)' : 'var(--pg-text-dim)' }}
                  >
                    {count}
                  </span>
                </>
              )}

              {!performMode && tabs.length > 1 && !isEditing && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTab(tab.id);
                  }}
                  title={`Remove ${tab.label} tab`}
                  className="ml-0.5 opacity-0 group-hover:opacity-75 hover:!opacity-100 transition-opacity"
                  style={{ color: 'var(--pg-text-muted)' }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}

        {!performMode && (
          <button
            type="button"
            onClick={onAddTab}
            title="Add new surface tab pane"
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap hover:opacity-90 transition-opacity"
            style={{ color: 'var(--pg-text-muted)' }}
          >
            <Plus size={12} />
            <span>Tab</span>
          </button>
        )}
      </div>

      {/* Freeform Wire-Free Modular Surface Canvas with Zoom */}
      <div
        className="flex-1 overflow-auto pg-dot-grid relative"
        onWheel={handleWheelZoom}
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelectModule(null, false);
        }}
      >
        <div
          style={{
            width: `${Math.round(BOARD_W * zoom)}px`,
            height: `${Math.round(BOARD_H * zoom)}px`,
          }}
          className="relative"
        >
          <div
            ref={boardRef}
            onDragOver={handleDragOver}
            onDragLeave={() => setDropPreview(null)}
            onDrop={handleDrop}
            onClick={(e) => {
              if (e.target === e.currentTarget) onSelectModule(null, false);
            }}
            className="relative origin-top-left"
            style={{
              width: BOARD_W,
              height: BOARD_H,
              transform: `scale(${zoom})`,
            }}
          >
            {/* Empty Canvas Hint */}
            {visibleModules.length === 0 && !performMode && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="px-5 py-4 rounded-md text-center"
                  style={{
                    backgroundColor: 'var(--pg-surface)',
                    border: '1px dashed var(--pg-border-strong)',
                  }}
                >
                  <p className="text-xs font-semibold" style={{ color: 'var(--pg-text)' }}>
                    Clean Surface Tab Pane
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--pg-text-muted)' }}>
                    Drag or click any controller from the left palette to position it on this tab.
                  </p>
                </div>
              </div>
            )}

            {/* Glued Group Rack Frames */}
            {groupBoxes.map(({ group, px, py, pw, ph }) => {
              const gColor = resolveAccentHex(group.accent, palette);
              return (
                <div
                  key={`grp-box-${group.id}`}
                  style={{
                    left: px,
                    top: py,
                    width: pw,
                    height: ph,
                    border: `1.5px solid ${gColor}66`,
                    backgroundColor: `${gColor}0B`,
                    borderRadius: '8px',
                    zIndex: 2,
                  }}
                  className="absolute pointer-events-none"
                >
                  {!performMode && (
                    <div
                      onPointerDown={(e) => handleStartMoveGroup(group.id, e)}
                      title="Drag to move entire glued group"
                      className="pointer-events-auto inline-flex items-center gap-2 px-2.5 py-0.5 rounded-tl-md rounded-br text-[10px] font-mono cursor-grab active:cursor-grabbing"
                      style={{
                        backgroundColor: 'var(--pg-surface)',
                        color: gColor,
                        borderRight: `1px solid ${gColor}55`,
                        borderBottom: `1px solid ${gColor}55`,
                      }}
                    >
                      <span>{group.name}</span>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onUngroup(group.id);
                        }}
                        title="Ungroup rack"
                        className="hover:opacity-75"
                      >
                        <Ungroup size={10} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Drag-from-palette ghost preview */}
            {dropPreview && !performMode && (
              <div
                className="absolute rounded-md pointer-events-none z-30"
                style={{
                  left: dropPreview.px,
                  top: dropPreview.py,
                  width: dropPreview.pw,
                  height: dropPreview.ph,
                  backgroundColor: `${palette.colors.primary}22`,
                  border: `2px dashed ${palette.colors.primary}`,
                }}
              />
            )}

            {/* Freeform Positioned Modular Controllers on Active Tab */}
            {visibleModules.map((mod) => {
              const rect = getModulePixelRect(mod);
              const modGroup = mod.groupId
                ? groups.find((g) => g.id === mod.groupId)
                : undefined;

              return (
                <div
                  key={mod.id}
                  style={{
                    left: rect.px,
                    top: rect.py,
                    width: rect.pw,
                    height: rect.ph,
                    zIndex: selectedId === mod.id ? 25 : 10,
                  }}
                  className="absolute"
                >
                  <ModuleRenderer
                    module={mod}
                    group={modGroup}
                    palette={palette}
                    isSelected={selectedId === mod.id}
                    isMultiSelected={multiSelectedIds.includes(mod.id)}
                    compactMode={compactMode}
                    performMode={performMode}
                    audioEnabled={audioEnabled}
                    bpm={bpm}
                    currentStep={currentStep}
                    transportPlaying={transportPlaying}
                    modulatedValue={modulatedValues[mod.id]}
                    onSelect={(shiftKey) => onSelectModule(mod.id, shiftKey)}
                    onOpenContextMenu={(cx, cy) => onOpenContextMenu(mod.id, cx, cy)}
                    onDelete={() => onDeleteModule(mod.id)}
                    onDuplicate={() => onDuplicateModule(mod.id)}
                    onStartMove={(e) => handleStartMove(mod, e)}
                    onStartResize={(e) => handleStartResize(mod, e)}
                    onValueChange={(vals) => onModuleValueChange(mod.id, vals)}
                    onLfoChange={(lfo) => onModuleLfoChange(mod.id, lfo)}
                    onTriggerNote={(note, vel, isOn) => onTriggerNote(mod, note, vel, isOn)}
                    onTriggerDrum={(padIdx, note, vel, isOn) =>
                      onTriggerDrum(mod, padIdx, note, vel, isOn)
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Bottom-Right Zoom In / Out Widget */}
      <div
        className="absolute bottom-4 right-4 flex items-center gap-1 px-2 py-1 rounded-md shadow-lg z-30"
        style={{
          backgroundColor: 'var(--pg-panel)',
          border: '1px solid var(--pg-border-strong)',
        }}
      >
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
          title="Zoom out"
          className="p-1 rounded hover:opacity-80"
          style={{ color: 'var(--pg-text-muted)' }}
        >
          <ZoomOut size={13} />
        </button>
        <span className="text-xs font-mono tabular-nums w-11 text-center" style={{ color: 'var(--pg-text)' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.1).toFixed(2))))}
          title="Zoom in"
          className="p-1 rounded hover:opacity-80"
          style={{ color: 'var(--pg-text-muted)' }}
        >
          <ZoomIn size={13} />
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          title="Reset zoom to 100%"
          className="p-1 rounded hover:opacity-80"
          style={{ color: 'var(--pg-text-muted)' }}
        >
          <Maximize2 size={12} />
        </button>
      </div>
    </div>
  );
};
