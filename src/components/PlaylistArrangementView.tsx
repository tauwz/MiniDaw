import React from 'react';
import { Layers, Plus, Trash2 } from 'lucide-react';
import {
  PlaylistClip,
  StudioPattern,
  ThemePalette,
} from '../types/synth';

interface PlaylistArrangementViewProps {
  patterns: StudioPattern[];
  activePatternId: string;
  clips: PlaylistClip[];
  totalBars: number;
  songPlayBar: number;
  songPlaying: boolean;
  palette: ThemePalette;
  onSelectPattern: (patternId: string) => void;
  onPlaceClip: (trackIndex: number, startBar: number, patternId: string) => void;
  onDeleteClip: (clipId: string) => void;
  onExpandBars: () => void;
  onClearArrangement: () => void;
}

const TRACK_COUNT = 8;
const PATTERN_COLORS = [
  '#f59e0b',
  '#10b981',
  '#38bdf8',
  '#a78bfa',
  '#fb7185',
  '#f97316',
];

export const PlaylistArrangementView: React.FC<PlaylistArrangementViewProps> = ({
  patterns,
  activePatternId,
  clips,
  totalBars,
  songPlayBar,
  songPlaying,
  palette,
  onSelectPattern,
  onPlaceClip,
  onDeleteClip,
  onExpandBars,
  onClearArrangement,
}) => {
  const getPatternColor = (patternId: string) => {
    const idx = patterns.findIndex((p) => p.id === patternId);
    return PATTERN_COLORS[Math.max(0, idx) % PATTERN_COLORS.length];
  };

  return (
    <div
      className="flex flex-col h-full min-h-0 overflow-hidden"
      style={{ backgroundColor: 'var(--pg-canvas)' }}
    >
      {/* Playlist Header Toolbar */}
      <div
        className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0"
        style={{
          backgroundColor: 'var(--pg-surface)',
          borderBottom: '1px solid var(--pg-border)',
        }}
      >
        <div className="flex items-center gap-2">
          <Layers size={13} style={{ color: palette.colors.primary }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--pg-text)' }}>
            Arrangement Playlist
          </span>
          <span className="text-[10px] font-mono" style={{ color: 'var(--pg-text-dim)' }}>
            Click slot to place active pattern · Right-click clip to remove · Switch to SONG mode to score
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onExpandBars}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-text)',
            }}
          >
            <Plus size={11} />
            <span>+8 Bars ({totalBars})</span>
          </button>
          <button
            type="button"
            onClick={onClearArrangement}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-alert)',
            }}
          >
            <Trash2 size={11} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Main Split: Pattern Picker + Track Bar Grid */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Pattern Picker Column */}
        <div
          className="w-48 shrink-0 flex flex-col overflow-y-auto p-2 gap-1"
          style={{
            backgroundColor: 'var(--pg-surface)',
            borderRight: '1px solid var(--pg-border)',
          }}
        >
          <div
            className="text-[10px] font-semibold uppercase tracking-wider px-1 pb-1"
            style={{ color: 'var(--pg-text-muted)' }}
          >
            Pattern Clips
          </div>
          {patterns.map((pat) => {
            const active = pat.id === activePatternId;
            const color = getPatternColor(pat.id);
            const barsSpan = Math.max(1, Math.round(pat.stepsCount / 16));
            return (
              <button
                key={pat.id}
                type="button"
                onClick={() => onSelectPattern(pat.id)}
                className="w-full text-left px-2 py-1.5 rounded flex items-center justify-between gap-1.5 text-xs transition-colors"
                style={{
                  backgroundColor: active ? `${color}26` : 'var(--pg-panel)',
                  border: `1px solid ${active ? color : 'var(--pg-border)'}`,
                  color: 'var(--pg-text)',
                }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate font-medium">{pat.name}</span>
                </div>
                <span
                  className="text-[10px] font-mono shrink-0"
                  style={{ color: 'var(--pg-text-dim)' }}
                >
                  {barsSpan}b
                </span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Track x Bar Grid */}
        <div className="flex-1 overflow-auto relative">
          <div style={{ minWidth: `${100 + totalBars * 64}px` }}>
            {/* Bar Ruler Header */}
            <div
              className="flex sticky top-0 z-10"
              style={{
                backgroundColor: 'var(--pg-panel)',
                borderBottom: '1px solid var(--pg-border)',
              }}
            >
              <div
                className="w-24 shrink-0 px-2 py-1 text-[10px] font-mono font-semibold"
                style={{
                  color: 'var(--pg-text-muted)',
                  borderRight: '1px solid var(--pg-border)',
                }}
              >
                TRACK
              </div>
              {Array.from({ length: totalBars }, (_, barIdx) => {
                const isPlayBar = songPlaying && Math.floor(songPlayBar) === barIdx;
                return (
                  <div
                    key={barIdx}
                    className="w-16 shrink-0 px-1.5 py-1 text-[10px] font-mono tabular-nums text-center"
                    style={{
                      backgroundColor: isPlayBar ? `${palette.colors.primary}33` : 'transparent',
                      color: isPlayBar ? palette.colors.primary : 'var(--pg-text-muted)',
                      borderRight: '1px solid var(--pg-border)',
                    }}
                  >
                    Bar {barIdx + 1}
                  </div>
                );
              })}
            </div>

            {/* Arrangement Tracks */}
            {Array.from({ length: TRACK_COUNT }, (_, trackIdx) => {
              const trackClips = clips.filter((c) => c.trackIndex === trackIdx);
              return (
                <div
                  key={trackIdx}
                  className="flex relative h-9"
                  style={{ borderBottom: '1px solid var(--pg-border)' }}
                >
                  <div
                    className="w-24 shrink-0 px-2 flex items-center text-[11px] font-mono"
                    style={{
                      backgroundColor: 'var(--pg-surface)',
                      color: 'var(--pg-text-muted)',
                      borderRight: '1px solid var(--pg-border)',
                    }}
                  >
                    Track {trackIdx + 1}
                  </div>

                  {/* Bar slots */}
                  <div className="flex relative">
                    {Array.from({ length: totalBars }, (_, barIdx) => (
                      <div
                        key={barIdx}
                        onClick={() => onPlaceClip(trackIdx, barIdx, activePatternId)}
                        className="w-16 h-full shrink-0 cursor-pointer hover:bg-white/5 transition-colors"
                        style={{
                          backgroundColor:
                            barIdx % 4 === 0 ? 'rgba(255,255,255,0.018)' : 'transparent',
                          borderRight: '1px solid var(--pg-border)',
                        }}
                      />
                    ))}

                    {/* Placed Pattern Clips */}
                    {trackClips.map((clip) => {
                      const pat = patterns.find((p) => p.id === clip.patternId);
                      const color = getPatternColor(clip.patternId);
                      return (
                        <div
                          key={clip.id}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDeleteClip(clip.id);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectPattern(clip.patternId);
                          }}
                          title={`${pat?.name ?? 'Pattern'} (Right-click to remove)`}
                          style={{
                            left: `${clip.startBar * 64 + 2}px`,
                            width: `${Math.max(60, clip.lengthBars * 64 - 4)}px`,
                            top: '3px',
                            bottom: '3px',
                            backgroundColor: `${color}38`,
                            border: `1px solid ${color}`,
                          }}
                          className="absolute rounded px-1.5 flex items-center justify-between gap-1 cursor-pointer select-none overflow-hidden"
                        >
                          <span
                            className="text-[10px] font-semibold truncate"
                            style={{ color: 'var(--pg-text)' }}
                          >
                            {pat?.name ?? 'Pattern'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Song Playhead Line */}
            {songPlaying && (
              <div
                className="absolute top-6 bottom-0 w-0.5 pointer-events-none z-20"
                style={{
                  left: `${96 + songPlayBar * 64}px`,
                  backgroundColor: palette.colors.primary,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
