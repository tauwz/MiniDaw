import React, { useMemo, useState } from 'react';
import { SynthModule } from '../../types/synth';

interface KeyboardModuleProps {
  module: SynthModule;
  accentHex: string;
  onTriggerNote: (note: number, velocity: number, isOn: boolean) => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const SCALE_INTERVALS: Record<string, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  minorPentatonic: [0, 3, 5, 7, 10],
};

export const KeyboardModule: React.FC<KeyboardModuleProps> = ({
  module,
  accentHex,
  onTriggerNote,
}) => {
  const baseOctave = module.config.octave ?? 3;
  const octaves = module.config.octaves ?? 2;
  const scale = module.config.scale ?? 'chromatic';
  const [pressedNotes, setPressedNotes] = useState<Record<number, boolean>>({});

  const keys = useMemo(() => {
    const startMidi = (baseOctave + 1) * 12;
    if (scale !== 'chromatic') {
      const intervals = SCALE_INTERVALS[scale] || SCALE_INTERVALS.major;
      const list: { midi: number; label: string; isBlack: boolean }[] = [];
      for (let o = 0; o < octaves; o++) {
        intervals.forEach((iv) => {
          const midi = startMidi + o * 12 + iv;
          const name = NOTE_NAMES[midi % 12];
          list.push({
            midi,
            label: `${name}${Math.floor(midi / 12) - 1}`,
            isBlack: false,
          });
        });
      }
      // Add top octave root
      const topMidi = startMidi + octaves * 12;
      list.push({
        midi: topMidi,
        label: `C${Math.floor(topMidi / 12) - 1}`,
        isBlack: false,
      });
      return list;
    }

    const totalSemis = octaves * 12 + 1;
    return Array.from({ length: totalSemis }, (_, idx) => {
      const midi = startMidi + idx;
      const noteName = NOTE_NAMES[midi % 12];
      return {
        midi,
        label: `${noteName}${Math.floor(midi / 12) - 1}`,
        isBlack: noteName.includes('#'),
      };
    });
  }, [baseOctave, octaves, scale]);

  const pressKey = (midi: number, e: React.PointerEvent) => {
    e.stopPropagation();
    if (pressedNotes[midi]) return;
    setPressedNotes((prev) => ({ ...prev, [midi]: true }));
    onTriggerNote(midi, 102, true);
  };

  const releaseKey = (midi: number, e: React.PointerEvent) => {
    e.stopPropagation();
    if (!pressedNotes[midi]) return;
    setPressedNotes((prev) => ({ ...prev, [midi]: false }));
    onTriggerNote(midi, 0, false);
  };

  const whiteKeys = keys.filter((k) => !k.isBlack);

  if (scale !== 'chromatic') {
    return (
      <div className="touch-surface flex flex-col w-full h-full gap-1 select-none">
        <div className="flex-1 flex gap-1 min-h-0">
          {keys.map((k) => {
            const active = Boolean(pressedNotes[k.midi]);
            return (
              <button
                key={k.midi}
                type="button"
                onPointerDown={(e) => pressKey(k.midi, e)}
                onPointerUp={(e) => releaseKey(k.midi, e)}
                onPointerLeave={(e) => releaseKey(k.midi, e)}
                onPointerCancel={(e) => releaseKey(k.midi, e)}
                className="flex-1 rounded-b flex flex-col items-center justify-end pb-1.5 transition-colors duration-75 min-w-0"
                style={{
                  backgroundColor: active ? accentHex : 'var(--pg-surface)',
                  border: `1px solid ${active ? accentHex : 'var(--pg-border-strong)'}`,
                  color: active ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
                }}
              >
                <span className="text-[10px] font-mono leading-none truncate">{k.label}</span>
              </button>
            );
          })}
        </div>
        <div className="text-[10px] font-mono leading-none flex justify-between px-0.5" style={{ color: 'var(--pg-text-dim)' }}>
          <span>Scale: {scale}</span>
          <span>Oct {baseOctave}</span>
        </div>
      </div>
    );
  }

  // Chromatic piano layout
  const whiteCount = whiteKeys.length;
  return (
    <div className="touch-surface flex flex-col w-full h-full gap-1 select-none">
      <div className="relative flex-1 flex gap-[2px] min-h-0">
        {whiteKeys.map((k) => {
          const active = Boolean(pressedNotes[k.midi]);
          return (
            <button
              key={k.midi}
              type="button"
              onPointerDown={(e) => pressKey(k.midi, e)}
              onPointerUp={(e) => releaseKey(k.midi, e)}
              onPointerLeave={(e) => releaseKey(k.midi, e)}
              onPointerCancel={(e) => releaseKey(k.midi, e)}
              className="flex-1 rounded-b flex items-end justify-center pb-1.5 transition-colors duration-75 min-w-0"
              style={{
                backgroundColor: active ? accentHex : 'var(--pg-surface)',
                border: `1px solid ${active ? accentHex : 'var(--pg-border-strong)'}`,
                color: active ? 'var(--pg-primary-text)' : 'var(--pg-text-dim)',
              }}
            >
              {k.label.startsWith('C') && (
                <span className="text-[9px] font-mono leading-none">{k.label}</span>
              )}
            </button>
          );
        })}

        {/* Black keys overlaid accurately */}
        {keys.map((k) => {
          if (!k.isBlack) return null;
          const prevWhiteIdx = whiteKeys.findIndex((wk) => wk.midi === k.midi - 1);
          if (prevWhiteIdx < 0) return null;
          const leftPct = ((prevWhiteIdx + 0.68) / whiteCount) * 100;
          const widthPct = (0.64 / whiteCount) * 100;
          const active = Boolean(pressedNotes[k.midi]);

          return (
            <button
              key={k.midi}
              type="button"
              onPointerDown={(e) => pressKey(k.midi, e)}
              onPointerUp={(e) => releaseKey(k.midi, e)}
              onPointerLeave={(e) => releaseKey(k.midi, e)}
              onPointerCancel={(e) => releaseKey(k.midi, e)}
              className="absolute top-0 h-[58%] z-10 rounded-b transition-colors duration-75"
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                backgroundColor: active ? accentHex : 'var(--pg-canvas)',
                border: `1px solid ${active ? accentHex : 'var(--pg-border-strong)'}`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
