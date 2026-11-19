import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Music2, Sparkles, Trash2 } from 'lucide-react';
import {
  PianoRollNote,
  StudioChannel,
  StudioPattern,
  ThemePalette,
} from '../types/synth';
import { resolveAccentHex } from '../data/themes';

interface PianoRollViewProps {
  channels: StudioChannel[];
  selectedChannel: StudioChannel;
  pattern: StudioPattern;
  playheadStep: number; // fractional step in 0..stepsCount
  isPlaying: boolean;
  palette: ThemePalette;
  onSelectChannel: (channelId: string) => void;
  onChangeNotes: (channelId: string, notes: PianoRollNote[]) => void;
  onImportStepsToPianoRoll: (channelId: string) => void;
  onAuditionNote: (channelId: string, note: number, isOn: boolean, velocity?: number) => void;
}

const MIN_PITCH = 12; // C0
const MAX_PITCH = 119; // B8 (9 complete octaves: C0..B8)
const PITCH_COUNT = MAX_PITCH - MIN_PITCH + 1;
const OCTAVE_LIST = [8, 7, 6, 5, 4, 3, 2, 1, 0];
const ROW_H = 16;
const PIANO_W = 64;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_SET = new Set([1, 3, 6, 8, 10]);

const SCALES: Record<string, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  minPent: [0, 3, 5, 7, 10],
};

const CHORD_STAMPS: Record<string, number[]> = {
  single: [0],
  major: [0, 4, 7],
  minor: [0, 3, 7],
  seventh: [0, 4, 7, 10],
  sus4: [0, 5, 7],
  octave: [0, 12],
};

function noteName(midi: number): string {
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${oct}`;
}

export const PianoRollView: React.FC<PianoRollViewProps> = ({
  channels,
  selectedChannel,
  pattern,
  playheadStep,
  isPlaying,
  palette,
  onSelectChannel,
  onChangeNotes,
  onImportStepsToPianoRoll,
  onAuditionNote,
}) => {
  const accentHex = resolveAccentHex(selectedChannel.accent, palette);
  const notes = useMemo(
    () => pattern.notes[selectedChannel.id] ?? [],
    [pattern.notes, selectedChannel.id]
  );

  const [tool, setTool] = useState<'draw' | 'select' | 'erase'>('draw');
  const [snapSteps, setSnapSteps] = useState<number>(1);
  const [stepPx, setStepPx] = useState<number>(34);
  const [chordStamp, setChordStamp] = useState<string>('single');
  const [scaleId, setScaleId] = useState<string>('chromatic');
  const [scaleRoot, setScaleRoot] = useState<number>(0); // 0 = C
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [lastDuration, setLastDuration] = useState<number>(1);
  const [velLaneHeightPx, setVelLaneHeightPx] = useState<number>(58);
  const [velCollapsed, setVelCollapsed] = useState<boolean>(false);
  const [hoveredPitch, setHoveredPitch] = useState<number | null>(null);
  const [activeAuditionPitch, setActiveAuditionPitch] = useState<number | null>(null);
  const velSplitDragRef = useRef<{ startY: number; startH: number } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const velocityScrollRef = useRef<HTMLDivElement>(null);
  const auditionActiveRef = useRef<number | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const dragRef = useRef<{
    kind: 'move' | 'resize' | 'paint';
    targetNoteId: string;
    startClientX: number;
    startClientY: number;
    origPitch: number;
    origStart: number;
    origDur: number;
    snapshotNotes: PianoRollNote[];
    selectedIds: string[];
  } | null>(null);

  const velDragRef = useRef<{
    noteId: string;
    el: HTMLDivElement;
  } | null>(null);

  const scrollToPitch = (pitch: number) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const clamped = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
    const rowIdx = MAX_PITCH - clamped;
    el.scrollTop = Math.max(0, rowIdx * ROW_H - el.clientHeight * 0.44);
  };

  // Center vertically around placed notes (if present) or channel's rootNote on channel switch / mount
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const chNotes = notesRef.current;
    let centerPitch = selectedChannel.rootNote || 60;
    if (chNotes.length > 0) {
      const sorted = [...chNotes].map((n) => n.pitch).sort((a, b) => a - b);
      centerPitch = sorted[Math.floor(sorted.length / 2)];
    }
    const targetPitch = Math.max(MIN_PITCH + 6, Math.min(MAX_PITCH - 6, centerPitch));
    const rowIdx = MAX_PITCH - targetPitch;
    el.scrollTop = Math.max(0, rowIdx * ROW_H - el.clientHeight * 0.44);
  }, [selectedChannel.id, selectedChannel.rootNote]);

  // Delete / Supr key to delete selected notes inside Piano Roll
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (selectedNoteIds.length === 0) return;
      e.preventDefault();
      const delSet = new Set(selectedNoteIds);
      onChangeNotes(
        selectedChannel.id,
        notesRef.current.filter((n) => !delSet.has(n.id))
      );
      setSelectedNoteIds([]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNoteIds, selectedChannel.id, onChangeNotes]);

  const snapStep = (raw: number) =>
    Math.max(0, Math.round(raw / snapSteps) * snapSteps);

  const stopAudition = () => {
    if (auditionActiveRef.current !== null) {
      onAuditionNote(selectedChannel.id, auditionActiveRef.current, false);
      auditionActiveRef.current = null;
      setActiveAuditionPitch(null);
    }
  };

  const triggerAudition = (pitch: number, velocity = 0.85) => {
    if (auditionActiveRef.current === pitch) return;
    stopAudition();
    auditionActiveRef.current = pitch;
    setActiveAuditionPitch(pitch);
    onAuditionNote(selectedChannel.id, pitch, true, velocity);
  };

  // Global pointer drag for Move / Resize / Paint & Velocity lane
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const sDrag = velSplitDragRef.current;
      if (sDrag) {
        const nextH = sDrag.startH + (sDrag.startY - e.clientY);
        if (nextH < 24) {
          setVelCollapsed(true);
        } else {
          setVelCollapsed(false);
          setVelLaneHeightPx(Math.max(36, Math.min(180, Math.round(nextH))));
        }
        return;
      }

      const vDrag = velDragRef.current;
      if (vDrag) {
        const rect = vDrag.el.getBoundingClientRect();
        const rel = 1 - (e.clientY - rect.top) / Math.max(1, rect.height);
        const vel = Math.max(0.08, Math.min(1, Number(rel.toFixed(2))));
        onChangeNotes(
          selectedChannel.id,
          notesRef.current.map((n) => (n.id === vDrag.noteId ? { ...n, velocity: vel } : n))
        );
        return;
      }

      const d = dragRef.current;
      if (!d) return;
      const dxSteps = (e.clientX - d.startClientX) / stepPx;
      const dyRows = Math.round((e.clientY - d.startClientY) / ROW_H);

      if (d.kind === 'resize') {
        const nextDur = Math.max(
          snapSteps,
          Math.round((d.origDur + dxSteps) / snapSteps) * snapSteps
        );
        const clampedDur = Math.min(pattern.stepsCount - d.origStart, nextDur);
        setLastDuration(clampedDur);
        onChangeNotes(
          selectedChannel.id,
          d.snapshotNotes.map((n) =>
            n.id === d.targetNoteId ? { ...n, durationSteps: clampedDur } : n
          )
        );
      } else if (d.kind === 'move' || d.kind === 'paint') {
        const deltaSteps = Math.round(dxSteps / snapSteps) * snapSteps;
        const deltaPitch = -dyRows;
        const moveSet = new Set(d.selectedIds);
        const nextPrimaryPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, d.origPitch + deltaPitch));
        if (nextPrimaryPitch !== auditionActiveRef.current) {
          triggerAudition(nextPrimaryPitch, 0.82);
        }
        onChangeNotes(
          selectedChannel.id,
          d.snapshotNotes.map((n) => {
            if (!moveSet.has(n.id)) return n;
            return {
              ...n,
              pitch: Math.max(MIN_PITCH, Math.min(MAX_PITCH, n.pitch + deltaPitch)),
              startStep: Math.max(
                0,
                Math.min(pattern.stepsCount - snapSteps, n.startStep + deltaSteps)
              ),
            };
          })
        );
      }
    };

    const onUp = () => {
      if (dragRef.current || velDragRef.current || velSplitDragRef.current) {
        dragRef.current = null;
        velDragRef.current = null;
        velSplitDragRef.current = null;
        stopAudition();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  });

  const gridW = pattern.stepsCount * stepPx;
  const gridH = PITCH_COUNT * ROW_H;
  const scaleIntervals = new Set(SCALES[scaleId] ?? SCALES.chromatic);

  const handleGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;
    if (tool === 'erase') return;
    if (tool === 'select') {
      setSelectedNoteIds([]);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;

    const rawStep = relX / stepPx;
    const floored = Math.max(0, Math.floor(rawStep / snapSteps) * snapSteps);
    const startStep = Math.min(pattern.stepsCount - snapSteps, floored);
    const rowIdx = Math.max(0, Math.min(PITCH_COUNT - 1, Math.floor(relY / ROW_H)));
    const pitch = MAX_PITCH - rowIdx;

    const offsets = CHORD_STAMPS[chordStamp] ?? [0];
    const dur = Math.min(pattern.stepsCount - startStep, Math.max(snapSteps, lastDuration));
    const created: PianoRollNote[] = offsets
      .map((off, idx) => {
        const p = pitch + off;
        if (p < MIN_PITCH || p > MAX_PITCH) return null;
        return {
          id: `pr-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
          pitch: p,
          startStep,
          durationSteps: dur,
          velocity: 0.84,
        };
      })
      .filter((n): n is PianoRollNote => n !== null);

    if (created.length === 0) return;

    const nextNotes = [...notes, ...created];
    onChangeNotes(selectedChannel.id, nextNotes);
    const createdIds = created.map((c) => c.id);
    setSelectedNoteIds(createdIds);
    triggerAudition(created[0].pitch, 0.84);

    if (created.length === 1) {
      dragRef.current = {
        kind: 'paint',
        targetNoteId: created[0].id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origPitch: created[0].pitch,
        origStart: created[0].startStep,
        origDur: created[0].durationSteps,
        snapshotNotes: nextNotes,
        selectedIds: createdIds,
      };
    }
  };

  const transposeSelectedOrAll = (semitones: number) => {
    const hasSel = selectedNoteIds.length > 0;
    const selSet = new Set(selectedNoteIds);
    onChangeNotes(
      selectedChannel.id,
      notes.map((n) => {
        if (hasSel && !selSet.has(n.id)) return n;
        return {
          ...n,
          pitch: Math.max(MIN_PITCH, Math.min(MAX_PITCH, n.pitch + semitones)),
        };
      })
    );
  };

  return (
    <div
      className="flex flex-col h-full min-h-0 overflow-hidden"
      style={{ backgroundColor: 'var(--pg-canvas)' }}
    >
      {/* Piano Roll Toolbar */}
      <div
        className="px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0"
        style={{
          backgroundColor: 'var(--pg-surface)',
          borderBottom: '1px solid var(--pg-border)',
        }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Music2 size={13} style={{ color: accentHex }} />
          <span className="text-[11px] font-semibold" style={{ color: 'var(--pg-text)' }}>
            Piano Roll
          </span>

          {/* Target 3xOsc Channel Picker */}
          <select
            value={selectedChannel.id}
            onChange={(e) => {
              onSelectChannel(e.target.value);
              setSelectedNoteIds([]);
            }}
            className="px-2 py-0.5 rounded text-[11px] font-semibold outline-none"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: `1px solid ${accentHex}77`,
              color: 'var(--pg-text)',
            }}
          >
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name} ({pattern.notes[ch.id]?.length ?? 0} notes)
              </option>
            ))}
          </select>

          {/* Tools */}
          <div className="flex items-center rounded overflow-hidden" style={{ border: '1px solid var(--pg-border)' }}>
            {(['draw', 'select', 'erase'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTool(t)}
                className="px-2 py-0.5 text-[10px] font-medium capitalize"
                style={{
                  backgroundColor: tool === t ? accentHex : 'var(--pg-panel)',
                  color: tool === t ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Snap */}
          <select
            value={snapSteps}
            onChange={(e) => setSnapSteps(Number(e.target.value))}
            title="Grid Snap"
            className="px-1.5 py-0.5 rounded text-[10px] font-mono outline-none"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-text)',
            }}
          >
            <option value={0.25}>Snap 1/4 Step</option>
            <option value={0.5}>Snap 1/2 Step</option>
            <option value={1}>Snap 1 Step</option>
            <option value={2}>Snap 1/2 Beat</option>
            <option value={4}>Snap 1 Beat</option>
          </select>

          {/* Chord Stamp */}
          <select
            value={chordStamp}
            onChange={(e) => setChordStamp(e.target.value)}
            title="Note / Chord Stamp"
            className="px-1.5 py-0.5 rounded text-[10px] font-mono outline-none"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-text)',
            }}
          >
            <option value="single">Single Note</option>
            <option value="major">Chord: Major</option>
            <option value="minor">Chord: Minor</option>
            <option value="seventh">Chord: Min7</option>
            <option value="sus4">Chord: Sus4</option>
            <option value="octave">Chord: Octave</option>
          </select>

          {/* Scale Highlight */}
          <div className="flex items-center gap-1">
            <select
              value={scaleRoot}
              onChange={(e) => setScaleRoot(Number(e.target.value))}
              title="Scale Root"
              className="px-1 py-0.5 rounded text-[10px] font-mono outline-none"
              style={{
                backgroundColor: 'var(--pg-panel)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              {NOTE_NAMES.map((n, idx) => (
                <option key={n} value={idx}>
                  {n}
                </option>
              ))}
            </select>
            <select
              value={scaleId}
              onChange={(e) => setScaleId(e.target.value)}
              title="Scale Highlight"
              className="px-1.5 py-0.5 rounded text-[10px] font-mono outline-none"
              style={{
                backgroundColor: 'var(--pg-panel)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              <option value="chromatic">Chromatic</option>
              <option value="minor">Natural Minor</option>
              <option value="major">Major</option>
              <option value="dorian">Dorian</option>
              <option value="phrygian">Phrygian</option>
              <option value="minPent">Minor Pentatonic</option>
            </select>
          </div>
        </div>

        {/* Right Scoring Actions */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => transposeSelectedOrAll(12)}
            title="Transpose +1 Octave"
            className="px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-0.5"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-text-muted)',
            }}
          >
            <ArrowUp size={10} />
            <span>8va</span>
          </button>
          <button
            type="button"
            onClick={() => transposeSelectedOrAll(-12)}
            title="Transpose -1 Octave"
            className="px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-0.5"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-text-muted)',
            }}
          >
            <ArrowDown size={10} />
            <span>8vb</span>
          </button>

          <button
            type="button"
            onClick={() => onImportStepsToPianoRoll(selectedChannel.id)}
            title="Convert this channel's step sequencer rhythm into Piano Roll notes"
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-text)',
            }}
          >
            <Sparkles size={10} style={{ color: accentHex }} />
            <span>Steps → Piano Roll</span>
          </button>

          <select
            value=""
            onChange={(e) => {
              const oct = Number(e.target.value);
              if (Number.isFinite(oct)) {
                scrollToPitch((oct + 1) * 12 + 5); // Center around F of selected octave
              }
            }}
            title="Jump to Piano Octave (C0–B8)"
            className="px-1.5 py-0.5 rounded text-[10px] font-mono outline-none"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-text)',
            }}
          >
            <option value="" disabled>
              Oct C0–B8
            </option>
            {OCTAVE_LIST.map((oct) => (
              <option key={oct} value={oct}>
                Oct {oct} (C{oct}–B{oct})
              </option>
            ))}
          </select>

          <select
            value={stepPx}
            onChange={(e) => setStepPx(Number(e.target.value))}
            title="Horizontal Zoom"
            className="px-1.5 py-0.5 rounded text-[10px] font-mono outline-none"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-text)',
            }}
          >
            <option value={24}>Zoom 75%</option>
            <option value={34}>Zoom 100%</option>
            <option value={48}>Zoom 140%</option>
          </select>

          <button
            type="button"
            onClick={() => {
              onChangeNotes(selectedChannel.id, []);
              setSelectedNoteIds([]);
            }}
            title="Clear Piano Roll notes for this channel"
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-alert)',
            }}
          >
            <Trash2 size={10} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Main Sticky Keyboard + Grid Area */}
      <div
        ref={scrollContainerRef}
        onScroll={(e) => {
          if (velocityScrollRef.current) {
            velocityScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
        className="flex-1 min-h-0 overflow-auto relative select-none"
      >
        <div style={{ width: `${PIANO_W + gridW}px`, minHeight: `${22 + gridH}px` }} className="relative">
          {/* Sticky Top Bar/Beat Ruler */}
          <div className="sticky top-0 z-20 flex" style={{ height: '22px' }}>
            <div
              className="sticky left-0 z-30 shrink-0 flex items-center justify-center text-[9px] font-mono font-bold"
              style={{
                width: `${PIANO_W}px`,
                backgroundColor: 'var(--pg-surface)',
                borderRight: '1px solid var(--pg-border-strong)',
                borderBottom: '1px solid var(--pg-border)',
                color: hoveredPitch !== null || activeAuditionPitch !== null ? accentHex : 'var(--pg-text-dim)',
              }}
            >
              {activeAuditionPitch !== null
                ? noteName(activeAuditionPitch)
                : hoveredPitch !== null
                  ? noteName(hoveredPitch)
                  : 'C0–B8'}
            </div>
            <div
              className="relative flex"
              style={{
                width: `${gridW}px`,
                backgroundColor: 'var(--pg-panel)',
                borderBottom: '1px solid var(--pg-border)',
              }}
            >
              {Array.from({ length: pattern.stepsCount }, (_, stepIdx) => {
                const isBarStart = stepIdx % 16 === 0;
                const isBeatStart = stepIdx % 4 === 0;
                const isAltBeat = Math.floor(stepIdx / 4) % 2 === 1;
                const activeStep = isPlaying && Math.floor(playheadStep) === stepIdx;
                return (
                  <div
                    key={stepIdx}
                    style={{
                      width: `${stepPx}px`,
                      borderLeft: isBarStart
                        ? '1px solid var(--pg-border-strong)'
                        : isBeatStart
                          ? '1px solid var(--pg-border)'
                          : 'none',
                      backgroundColor: activeStep
                        ? `${accentHex}33`
                        : isAltBeat
                          ? 'rgba(255,255,255,0.025)'
                          : 'transparent',
                      color: activeStep
                        ? accentHex
                        : isBarStart
                          ? 'var(--pg-text)'
                          : 'var(--pg-text-dim)',
                    }}
                    className="h-full shrink-0 flex items-center pl-1 text-[9px] font-mono tabular-nums"
                  >
                    {isBarStart
                      ? `${Math.floor(stepIdx / 16) + 1}`
                      : isBeatStart
                        ? `${Math.floor(stepIdx / 16) + 1}.${Math.floor((stepIdx % 16) / 4) + 1}`
                        : ''}
                  </div>
                );
              })}
              {isPlaying && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 pointer-events-none z-20"
                  style={{
                    left: `${playheadStep * stepPx}px`,
                    backgroundColor: palette.colors.secondary,
                  }}
                />
              )}
            </div>
          </div>

          {/* Keyboard + Pitch Rows */}
          <div className="flex relative" style={{ height: `${gridH}px` }}>
            {/* Sticky Left Piano Keys (9 complete octaves C0..B8) */}
            <div
              className="sticky left-0 z-10 shrink-0"
              style={{
                width: `${PIANO_W}px`,
                height: `${gridH}px`,
                backgroundColor: '#e6e9ef',
                borderRight: '1px solid var(--pg-border-strong)',
              }}
              onPointerLeave={() => {
                setHoveredPitch(null);
                stopAudition();
              }}
            >
              {Array.from({ length: PITCH_COUNT }, (_, idx) => {
                const pitch = MAX_PITCH - idx;
                const pc = ((pitch % 12) + 12) % 12;
                const isBlack = BLACK_SET.has(pc);
                const isC = pc === 0;
                const isF = pc === 5;
                const isRoot = pitch === selectedChannel.rootNote;
                const isHovered = hoveredPitch === pitch;
                const isActive = activeAuditionPitch === pitch;
                const showLabel = isC || isRoot || isHovered || isActive;
                return (
                  <div
                    key={pitch}
                    onPointerEnter={() => setHoveredPitch(pitch)}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      triggerAudition(pitch, 0.85);
                    }}
                    onPointerUp={stopAudition}
                    style={{
                      height: `${ROW_H}px`,
                      backgroundColor: isActive
                        ? accentHex
                        : isBlack
                          ? '#e6e9ef'
                          : isHovered
                            ? '#cfd6e2'
                            : '#eceff4',
                      borderBottom: isC
                        ? '1px solid #3f4656'
                        : isF
                          ? '1px solid rgba(17,24,39,0.32)'
                          : 'none',
                      borderTop: pitch === MAX_PITCH ? '1px solid #3f4656' : 'none',
                    }}
                    className="relative flex items-center justify-end pr-1 text-[9px] font-mono cursor-pointer select-none"
                  >
                    {/* White-key seam behind black keys (between C/D, D/E, F/G, G/A, A/B) */}
                    {isBlack && !isActive && (
                      <div
                        className="absolute right-0 left-[58%] top-1/2 h-[1px] pointer-events-none"
                        style={{ backgroundColor: 'rgba(17,24,39,0.28)' }}
                      />
                    )}

                    {/* Raised Black Key Body on left 58% */}
                    {isBlack && (
                      <div
                        className="absolute left-0 top-[0.5px] bottom-[0.5px] w-[58%] rounded-r-[2px] flex items-center pl-1 pointer-events-none"
                        style={{
                          background: isActive
                            ? accentHex
                            : isHovered
                              ? 'linear-gradient(90deg, #272d3d 0%, #374056 100%)'
                              : 'linear-gradient(90deg, #11141c 0%, #222736 92%, #2e3447 100%)',
                          boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.45), 1px 0 2px rgba(0,0,0,0.25)',
                        }}
                      />
                    )}

                    {/* Root note indicator dot */}
                    {isRoot && !isActive && (
                      <span
                        className="w-1.5 h-1.5 rounded-full mr-0.5 shrink-0 relative z-10 pointer-events-none"
                        style={{ backgroundColor: accentHex }}
                      />
                    )}

                    {showLabel && (
                      <span
                        className="relative z-10 font-bold leading-none pointer-events-none"
                        style={{
                          color: isActive
                            ? '#090b10'
                            : isBlack
                              ? '#1f2937'
                              : isC
                                ? '#0f172a'
                                : '#334155',
                          fontSize: isC ? '9px' : '8px',
                        }}
                      >
                        {noteName(pitch)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Interactive Note Grid */}
            <div
              className="relative"
              style={{ width: `${gridW}px`, height: `${gridH}px` }}
              onPointerDown={handleGridPointerDown}
              onPointerMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const rowIdx = Math.max(
                  0,
                  Math.min(PITCH_COUNT - 1, Math.floor((e.clientY - rect.top) / ROW_H))
                );
                setHoveredPitch(MAX_PITCH - rowIdx);
              }}
              onPointerLeave={() => setHoveredPitch(null)}
              onContextMenu={(e) => e.preventDefault()}
            >
              {/* Pitch Lane Backgrounds */}
              {Array.from({ length: PITCH_COUNT }, (_, idx) => {
                const pitch = MAX_PITCH - idx;
                const pc = ((pitch % 12) + 12) % 12;
                const isBlack = BLACK_SET.has(pc);
                const inScale = scaleIntervals.has(((pc - scaleRoot) % 12 + 12) % 12);
                const isC = pc === 0;
                const isHovered = hoveredPitch === pitch;
                return (
                  <div
                    key={pitch}
                    style={{
                      height: `${ROW_H}px`,
                      backgroundColor: isHovered
                        ? 'rgba(255, 255, 255, 0.08)'
                        : !inScale
                          ? 'rgba(6, 7, 10, 0.52)'
                          : isBlack
                            ? 'rgba(255, 255, 255, 0.015)'
                            : 'rgba(255, 255, 255, 0.042)',
                      borderBottom: isC
                        ? '1px solid var(--pg-border-strong)'
                        : '1px solid rgba(255,255,255,0.045)',
                    }}
                  />
                );
              })}

              {/* Vertical Beat & Step Grid Lines + Alternating Beat Shading */}
              <div className="absolute inset-0 pointer-events-none flex">
                {Array.from({ length: pattern.stepsCount }, (_, stepIdx) => {
                  const isBar = stepIdx % 16 === 0;
                  const isBeat = stepIdx % 4 === 0;
                  const isAltBeat = Math.floor(stepIdx / 4) % 2 === 1;
                  return (
                    <div
                      key={stepIdx}
                      style={{
                        width: `${stepPx}px`,
                        backgroundColor: isAltBeat ? 'rgba(0,0,0,0.14)' : 'transparent',
                        borderLeft: isBar
                          ? '1px solid var(--pg-border-strong)'
                          : isBeat
                            ? '1px solid var(--pg-border)'
                            : '1px solid rgba(255,255,255,0.03)',
                      }}
                      className="h-full shrink-0"
                    />
                  );
                })}
              </div>

              {/* Placed Notes */}
              {notes.map((n) => {
                const rowIdx = MAX_PITCH - n.pitch;
                if (rowIdx < 0 || rowIdx >= PITCH_COUNT) return null;
                const isSel = selectedNoteIds.includes(n.id);
                const leftPx = n.startStep * stepPx;
                const widthPx = Math.max(8, n.durationSteps * stepPx);
                return (
                  <div
                    key={n.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (e.button === 2 || tool === 'erase') {
                        onChangeNotes(
                          selectedChannel.id,
                          notes.filter((x) => x.id !== n.id)
                        );
                        setSelectedNoteIds((prev) => prev.filter((id) => id !== n.id));
                        return;
                      }
                      if (e.button !== 0) return;

                      let nextSel: string[];
                      if (e.shiftKey) {
                        nextSel = isSel
                          ? selectedNoteIds.filter((id) => id !== n.id)
                          : [...selectedNoteIds, n.id];
                      } else if (isSel) {
                        nextSel = selectedNoteIds;
                      } else {
                        nextSel = [n.id];
                      }
                      setSelectedNoteIds(nextSel);
                      triggerAudition(n.pitch, n.velocity);

                      dragRef.current = {
                        kind: 'move',
                        targetNoteId: n.id,
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        origPitch: n.pitch,
                        origStart: n.startStep,
                        origDur: n.durationSteps,
                        snapshotNotes: notes,
                        selectedIds: nextSel.length > 0 ? nextSel : [n.id],
                      };
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onChangeNotes(
                        selectedChannel.id,
                        notes.filter((x) => x.id !== n.id)
                      );
                    }}
                    style={{
                      left: `${leftPx + 0.5}px`,
                      top: `${rowIdx * ROW_H + 1}px`,
                      width: `${Math.max(7, widthPx - 1)}px`,
                      height: `${ROW_H - 2}px`,
                      backgroundColor: isSel ? '#ffffff' : accentHex,
                      color: '#090b10',
                      border: `1px solid ${isSel ? accentHex : 'rgba(0,0,0,0.45)'}`,
                      opacity: 0.45 + n.velocity * 0.55,
                    }}
                    className="absolute rounded-[3px] px-1 flex items-center justify-between text-[9px] font-mono font-bold cursor-grab active:cursor-grabbing overflow-hidden shadow-sm"
                  >
                    <span className="truncate pointer-events-none">{noteName(n.pitch)}</span>
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.button !== 0) return;
                        dragRef.current = {
                          kind: 'resize',
                          targetNoteId: n.id,
                          startClientX: e.clientX,
                          startClientY: e.clientY,
                          origPitch: n.pitch,
                          origStart: n.startStep,
                          origDur: n.durationSteps,
                          snapshotNotes: notes,
                          selectedIds: [n.id],
                        };
                      }}
                      title="Drag edge to resize note duration"
                      className="w-2 h-full shrink-0 cursor-ew-resize hover:bg-black/25 -mr-1"
                    />
                  </div>
                );
              })}

              {/* Live Playhead */}
              {isPlaying && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 pointer-events-none z-20"
                  style={{
                    left: `${playheadStep * stepPx}px`,
                    backgroundColor: palette.colors.secondary,
                    boxShadow: `0 0 8px ${palette.colors.secondary}`,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Resizable & Collapsible Velocity Lane Splitter */}
      <div
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          e.preventDefault();
          velSplitDragRef.current = {
            startY: e.clientY,
            startH: velCollapsed ? 24 : velLaneHeightPx,
          };
        }}
        onDoubleClick={() => {
          setVelCollapsed(false);
          setVelLaneHeightPx(58);
        }}
        title="Drag to resize Velocity Lane · Double-click to reset"
        className="h-3.5 shrink-0 px-2 flex items-center justify-between cursor-row-resize select-none"
        style={{
          backgroundColor: 'var(--pg-panel)',
          borderTop: '1px solid var(--pg-border-strong)',
          borderBottom: velCollapsed ? 'none' : '1px solid var(--pg-border)',
        }}
      >
        <button
          type="button"
          onClick={() => setVelCollapsed((c) => !c)}
          title={velCollapsed ? 'Expand Velocity Lane' : 'Collapse Velocity Lane'}
          className="flex items-center gap-1 text-[9px] font-mono hover:opacity-80"
          style={{ color: velCollapsed ? palette.colors.primary : 'var(--pg-text-muted)' }}
        >
          {velCollapsed ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          <span>VEL</span>
        </button>
        <div
          className="w-8 h-0.5 rounded-full pointer-events-none"
          style={{ backgroundColor: 'var(--pg-border-strong)' }}
        />
        <span className="text-[8px] font-mono pointer-events-none" style={{ color: 'var(--pg-text-dim)' }}>
          {velCollapsed ? 'Hidden' : `${velLaneHeightPx}px`}
        </span>
      </div>

      {/* Bottom Note Velocity Lane */}
      {!velCollapsed && (
        <div
          className="shrink-0 flex overflow-hidden"
          style={{
            height: `${velLaneHeightPx}px`,
            backgroundColor: 'var(--pg-surface)',
          }}
        >
          <div
            className="shrink-0 flex items-center justify-center text-[9px] font-mono"
            style={{
              width: `${PIANO_W}px`,
              borderRight: '1px solid var(--pg-border-strong)',
              color: 'var(--pg-text-muted)',
            }}
          >
            VEL
          </div>
          <div ref={velocityScrollRef} className="flex-1 overflow-hidden relative">
            <div className="relative h-full" style={{ width: `${gridW}px` }}>
              <div className="absolute inset-0 flex pointer-events-none">
                {Array.from({ length: pattern.stepsCount }, (_, stepIdx) => {
                  const isBar = stepIdx % 16 === 0;
                  const isBeat = stepIdx % 4 === 0;
                  return (
                    <div
                      key={stepIdx}
                      style={{
                        width: `${stepPx}px`,
                        borderLeft: isBar
                          ? '1px solid var(--pg-border-strong)'
                          : isBeat
                            ? '1px solid var(--pg-border)'
                            : '1px solid rgba(255,255,255,0.025)',
                      }}
                      className="h-full shrink-0"
                    />
                  );
                })}
              </div>
              {notes.map((n) => {
                const barH = Math.max(12, Math.round(n.velocity * 100));
                return (
                  <div
                    key={`vel-${n.id}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const container = e.currentTarget;
                      const rect = container.getBoundingClientRect();
                      const rel = 1 - (e.clientY - rect.top) / Math.max(1, rect.height);
                      const vel = Math.max(0.08, Math.min(1, Number(rel.toFixed(2))));
                      onChangeNotes(
                        selectedChannel.id,
                        notes.map((x) => (x.id === n.id ? { ...x, velocity: vel } : x))
                      );
                      velDragRef.current = { noteId: n.id, el: container };
                    }}
                    title={`${noteName(n.pitch)} Vel ${Math.round(n.velocity * 127)}`}
                    style={{ left: `${n.startStep * stepPx}px`, width: '12px' }}
                    className="absolute top-0 bottom-0 flex items-end justify-start pl-[1px] cursor-ns-resize group"
                  >
                    <div
                      className="w-1.5 rounded-t"
                      style={{
                        height: `${barH}%`,
                        backgroundColor: accentHex,
                      }}
                    />
                  </div>
                );
              })}
              {isPlaying && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 pointer-events-none z-10"
                  style={{
                    left: `${playheadStep * stepPx}px`,
                    backgroundColor: palette.colors.secondary,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
