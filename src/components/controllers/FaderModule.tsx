import React, { useEffect, useRef, useState } from 'react';
import { ComponentLfoConfig, ModuleValues, SynthModule } from '../../types/synth';
import {
  DEFAULT_COMPONENT_LFO,
  formatLfoAmountPct,
  isLfoModActive,
} from '../../audio/lfoMath';

interface FaderModuleProps {
  module: SynthModule;
  accentHex: string;
  performMode: boolean;
  modulatedValue?: number;
  onValueChange: (values: Partial<ModuleValues>) => void;
  onLfoChange: (lfo: ComponentLfoConfig) => void;
  onOpenContextMenu: (clientX: number, clientY: number) => void;
  onStartMoveLabel: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export const FaderModule: React.FC<FaderModuleProps> = ({
  module,
  accentHex,
  performMode,
  modulatedValue,
  onValueChange,
  onLfoChange,
  onOpenContextMenu,
  onStartMoveLabel,
}) => {
  const value = Math.max(0, Math.min(1, module.values.primary ?? 0.5));
  const lfo = module.lfo;
  const lfoActive = isLfoModActive(lfo) || (Boolean(lfo?.enabled) && modulatedValue !== undefined);
  const liveModVal =
    lfoActive && modulatedValue !== undefined
      ? Math.max(0, Math.min(1, modulatedValue))
      : value;

  const trackRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rightModDragging, setRightModDragging] = useState(false);
  const [editingNumeric, setEditingNumeric] = useState(false);
  const [draftInput, setDraftInput] = useState('');
  const rightDragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    startAmt: number;
  } | null>(null);

  useEffect(() => {
    if (editingNumeric) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingNumeric]);

  const updateFromClientY = (clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rel = 1 - (clientY - rect.top) / Math.max(1, rect.height);
    const clamped = Math.max(0, Math.min(1, rel));
    onValueChange({ primary: clamped });
  };

  const commitNumericValue = (raw: string) => {
    const parsed = Number(raw.trim());
    if (!Number.isNaN(parsed)) {
      const clampedMidi = Math.max(0, Math.min(127, parsed));
      const min = module.midi.minValue;
      const max = module.midi.maxValue;
      const norm =
        max !== min
          ? Math.max(0, Math.min(1, (clampedMidi - min) / (max - min)))
          : clampedMidi / 127;
      onValueChange({ primary: norm });
    }
    setEditingNumeric(false);
    setDraftInput('');
  };

  const openNumericPad = (initialChar?: string) => {
    const currentMidi = Math.round(
      module.midi.minValue + value * (module.midi.maxValue - module.midi.minValue)
    );
    setDraftInput(initialChar ?? String(currentMidi));
    setEditingNumeric(true);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.focus();

    if (e.button === 0 && e.ctrlKey) {
      onOpenContextMenu(e.clientX, e.clientY);
      return;
    }

    if (e.button === 2) {
      e.currentTarget.setPointerCapture(e.pointerId);
      const baseLfo = lfo ?? DEFAULT_COMPONENT_LFO;
      rightDragRef.current = {
        active: true,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
        startAmt: baseLfo.amount ?? 0.5,
      };
      return;
    }

    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    updateFromClientY(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rDrag = rightDragRef.current;
    if (rDrag && rDrag.active) {
      const dx = e.clientX - rDrag.startX;
      const dy = e.clientY - rDrag.startY;
      if (!rDrag.moved && Math.hypot(dx, dy) >= 4) {
        rDrag.moved = true;
        setRightModDragging(true);
      }
      if (rDrag.moved) {
        const sensitivity = e.shiftKey ? 360 : 150;
        const nextAmt = Math.max(
          0,
          Math.min(1, rDrag.startAmt + (rDrag.startY - e.clientY) / sensitivity)
        );
        const baseLfo = lfo ?? DEFAULT_COMPONENT_LFO;
        onLfoChange({
          ...baseLfo,
          enabled: Math.abs(nextAmt - 0.5) > 0.004,
          amount: nextAmt,
        });
      }
      return;
    }

    if (!dragging) return;
    updateFromClientY(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const rDrag = rightDragRef.current;
    if (rDrag && rDrag.active) {
      const didMove = rDrag.moved;
      rightDragRef.current = null;
      setRightModDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (!didMove && e.type !== 'pointercancel') {
        onOpenContextMenu(e.clientX, e.clientY);
      }
      return;
    }

    if (!dragging) return;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editingNumeric) return;
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      openNumericPad(e.key);
      return;
    }
    const step = e.shiftKey ? 10 / 127 : 1 / 127;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === '+') {
      e.preventDefault();
      onValueChange({ primary: Math.min(1, value + step) });
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === '-') {
      e.preventDefault();
      onValueChange({ primary: Math.max(0, value - step) });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      openNumericPad();
    }
  };

  const bipolar = Boolean(module.config.bipolar);
  const lfoDepth = lfo ? Math.abs((lfo.amount - 0.5) * 2) : 0;
  const spanMin = Math.max(0, value - lfoDepth);
  const spanMax = Math.min(1, value + lfoDepth);
  const animBottom = Math.min(value, liveModVal);
  const animHeight = Math.abs(liveModVal - value);
  const fillBottom = bipolar ? Math.min(0.5, value) : 0;
  const fillHeight = bipolar ? Math.abs(value - 0.5) : value;

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="touch-surface relative flex flex-col items-center justify-between w-full h-full px-1.5 pt-2 pb-1.5 select-none outline-none overflow-hidden"
      title="Drag fader · Right-drag up/down for LFO +/- depth · Right-click for MIDI & Modulation · Type 0–127"
    >
      {/* Padded outer rail container so cap never clips outside */}
      <div
        className="relative flex-1 w-full max-w-[46px] py-2.5 flex items-center justify-center min-h-0"
        onDoubleClick={(e) => {
          e.stopPropagation();
          openNumericPad();
        }}
      >
        {/* Scale tick marks */}
        <div className="absolute inset-y-2.5 inset-x-0 flex flex-col justify-between pointer-events-none px-1">
          {[0, 1, 2, 3, 4, 5, 6].map((tick) => (
            <div key={tick} className="flex items-center justify-between w-full">
              <span
                className={bipolar && tick === 3 ? 'w-2 h-[1.5px]' : 'w-1.5 h-[1px]'}
                style={{
                  backgroundColor:
                    bipolar && tick === 3
                      ? accentHex
                      : tick % 2 === 0
                        ? 'var(--pg-border-strong)'
                        : 'var(--pg-border)',
                }}
              />
              <span
                className={bipolar && tick === 3 ? 'w-2 h-[1.5px]' : 'w-1.5 h-[1px]'}
                style={{
                  backgroundColor:
                    bipolar && tick === 3
                      ? accentHex
                      : tick % 2 === 0
                        ? 'var(--pg-border-strong)'
                        : 'var(--pg-border)',
                }}
              />
            </div>
          ))}
        </div>

        {/* Exact interactive track region */}
        <div
          ref={trackRef}
          tabIndex={-1}
          className="relative w-8 h-full flex items-center justify-center cursor-ns-resize outline-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {/* Recessed fader slot */}
          <div
            className="relative w-2.5 h-full rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--pg-canvas)', border: '1px solid var(--pg-border)' }}
          >
            {/* Base value fill */}
            <div
              className="absolute inset-x-0 rounded-full"
              style={{
                bottom: `${fillBottom * 100}%`,
                height: `${fillHeight * 100}%`,
                backgroundColor: accentHex,
                opacity: 0.72,
              }}
            />

            {/* LFO Span Band */}
            {lfoActive && (
              <div
                className="absolute inset-x-0 pointer-events-none"
                style={{
                  bottom: `${spanMin * 100}%`,
                  height: `${(spanMax - spanMin) * 100}%`,
                  backgroundColor: accentHex,
                  opacity: 0.25,
                }}
              />
            )}

            {/* Animated Back-and-Forth LFO Position Fill */}
            {lfoActive && animHeight > 0.004 && (
              <div
                className="absolute inset-x-0 pointer-events-none"
                style={{
                  bottom: `${animBottom * 100}%`,
                  height: `${animHeight * 100}%`,
                  backgroundColor: 'var(--pg-text)',
                  opacity: 0.55,
                }}
              />
            )}
          </div>

          {/* Animated LFO Position Marker */}
          {lfoActive && (
            <div
              className="absolute left-1/2 w-5 h-[2.5px] rounded-full pointer-events-none z-10"
              style={{
                bottom: `${liveModVal * 100}%`,
                transform: 'translate(-50%, 50%)',
                backgroundColor: 'var(--pg-text)',
                boxShadow: `0 0 6px ${accentHex}`,
              }}
            />
          )}

          {/* Tactile fader cap strictly clamped inside rail */}
          <div
            className="absolute left-1/2 w-7 h-3.5 rounded-[3px] flex items-center justify-center shadow-sm pointer-events-none"
            style={{
              bottom: `${value * 100}%`,
              transform: 'translate(-50%, 50%)',
              backgroundColor: 'var(--pg-surface)',
              border: `1.5px solid ${dragging || rightModDragging ? accentHex : 'var(--pg-border-strong)'}`,
            }}
          >
            <div className="w-4 h-[2px] rounded-full" style={{ backgroundColor: accentHex }} />
          </div>
        </div>

        {/* Transient Right-Drag LFO Amount HUD */}
        {rightModDragging && lfo && (
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-mono tabular-nums font-semibold whitespace-nowrap z-20 pointer-events-none shadow"
            style={{
              backgroundColor: 'var(--pg-canvas)',
              border: `1px solid ${accentHex}`,
              color: accentHex,
            }}
          >
            LFO {formatLfoAmountPct(lfo.amount)}
          </div>
        )}

        {/* Transient Numeric Pad Input Overlay */}
        {editingNumeric && (
          <div
            className="absolute inset-0 flex items-center justify-center z-20"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              value={draftInput}
              onChange={(e) => setDraftInput(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => commitNumericValue(draftInput)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  commitNumericValue(draftInput);
                } else if (e.key === 'Escape') {
                  setEditingNumeric(false);
                  setDraftInput('');
                }
              }}
              placeholder="0–127"
              className="w-14 px-1.5 py-0.5 rounded text-center text-xs font-mono font-semibold outline-none shadow-md"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: `1.5px solid ${accentHex}`,
                color: 'var(--pg-text)',
              }}
            />
          </div>
        )}
      </div>

      {/* Just the Controller Name Below (acts as drag handle in Design Mode) */}
      <div
        onPointerDown={(e) => {
          if (!performMode && e.button === 0) {
            onStartMoveLabel(e);
          }
        }}
        className={`w-full text-center text-[11px] font-medium truncate leading-tight pt-1 shrink-0 ${
          performMode ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
        }`}
        style={{ color: 'var(--pg-text)' }}
        title={performMode ? module.label : `${module.label} (Drag name to move)`}
      >
        {module.label}
      </div>
    </div>
  );
};
