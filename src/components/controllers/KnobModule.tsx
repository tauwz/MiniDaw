import React, { useEffect, useRef, useState } from 'react';
import { ComponentLfoConfig, ModuleValues, SynthModule } from '../../types/synth';
import {
  DEFAULT_COMPONENT_LFO,
  formatLfoAmountPct,
  isLfoModActive,
} from '../../audio/lfoMath';

interface KnobModuleProps {
  module: SynthModule;
  accentHex: string;
  performMode: boolean;
  modulatedValue?: number;
  onValueChange: (values: Partial<ModuleValues>) => void;
  onLfoChange: (lfo: ComponentLfoConfig) => void;
  onOpenContextMenu: (clientX: number, clientY: number) => void;
  onStartMoveLabel: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export const KnobModule: React.FC<KnobModuleProps> = ({
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
  const bipolar = Boolean(module.config.bipolar);
  const lfo = module.lfo;
  const lfoActive = isLfoModActive(lfo) || (Boolean(lfo?.enabled) && modulatedValue !== undefined);
  const liveModVal =
    lfoActive && modulatedValue !== undefined
      ? Math.max(0, Math.min(1, modulatedValue))
      : value;

  const [dragging, setDragging] = useState(false);
  const [rightModDragging, setRightModDragging] = useState(false);
  const [editingNumeric, setEditingNumeric] = useState(false);
  const [draftInput, setDraftInput] = useState('');
  const startYRef = useRef(0);
  const startValRef = useRef(value);
  const rightDragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    startAmt: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingNumeric) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingNumeric]);

  const startAngle = -135;
  const endAngle = 135;
  const valToAngle = (v: number) => startAngle + Math.max(0, Math.min(1, v)) * (endAngle - startAngle);
  const currentAngle = valToAngle(value);
  const modAngle = valToAngle(liveModVal);

  const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  };

  const describeArc = (cx: number, cy: number, r: number, startA: number, endA: number) => {
    const start = polarToCartesian(cx, cy, r, endA);
    const end = polarToCartesian(cx, cy, r, startA);
    const largeArc = Math.abs(endA - startA) <= 180 ? '0' : '1';
    const sweep = endA >= startA ? '0' : '1';
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
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
    startYRef.current = e.clientY;
    startValRef.current = value;
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
    const sensitivity = e.shiftKey ? 450 : 140;
    const delta = (startYRef.current - e.clientY) / sensitivity;
    const next = Math.max(0, Math.min(1, startValRef.current + delta));
    onValueChange({ primary: next });
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

  const openNumericPad = (initialChar?: string) => {
    const currentMidi = Math.round(
      module.midi.minValue + value * (module.midi.maxValue - module.midi.minValue)
    );
    setDraftInput(initialChar ?? String(currentMidi));
    setEditingNumeric(true);
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

  const arcStart = bipolar ? 0 : startAngle;
  const arcEnd = currentAngle;
  const minArc = Math.min(arcStart, arcEnd);
  const maxArc = Math.max(arcStart, arcEnd);
  const indicator = polarToCartesian(50, 50, 24, currentAngle);
  const zeroTickInner = polarToCartesian(50, 50, 34, 0);
  const zeroTickOuter = polarToCartesian(50, 50, 42, 0);

  // Outer LFO modulation span & animated back-and-forth arc
  const lfoDepth = lfo
    ? Math.max(Math.abs((lfo.amount - 0.5) * 2), lfo.amountSourceId ? Math.abs(liveModVal - value) : 0)
    : 0;
  const spanMinVal = Math.max(0, value - lfoDepth);
  const spanMaxVal = Math.min(1, value + lfoDepth);
  const spanMinA = valToAngle(spanMinVal);
  const spanMaxA = valToAngle(spanMaxVal);
  const animMinA = Math.min(currentAngle, modAngle);
  const animMaxA = Math.max(currentAngle, modAngle);
  const modDot = polarToCartesian(50, 50, 47, modAngle);

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="touch-surface relative flex flex-col items-center justify-between w-full h-full select-none outline-none px-1.5 pt-1.5 pb-1"
      title="Drag vertically · Right-drag up/down for LFO +/- depth · Right-click for MIDI & Modulation · Type 0–127"
    >
      {/* Rotary Wheel */}
      <div
        className="relative flex-1 w-full min-h-0 flex items-center justify-center cursor-ns-resize"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          openNumericPad();
        }}
      >
        <div className="h-full max-h-[56px] max-w-[56px] aspect-square">
          <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible block">
            {/* Base Value Track */}
            <path
              d={describeArc(50, 50, 38, startAngle, endAngle)}
              fill="none"
              stroke="var(--pg-border-strong)"
              strokeWidth="6"
              strokeLinecap="round"
            />
            {bipolar && (
              <>
                <line
                  x1={zeroTickInner.x}
                  y1={zeroTickInner.y}
                  x2={zeroTickOuter.x}
                  y2={zeroTickOuter.y}
                  stroke="var(--pg-text-dim)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <text
                  x="11"
                  y="92"
                  fontSize="13"
                  fontFamily="monospace"
                  fontWeight="700"
                  fill="var(--pg-text-dim)"
                >
                  −
                </text>
                <text
                  x="81"
                  y="92"
                  fontSize="13"
                  fontFamily="monospace"
                  fontWeight="700"
                  fill={accentHex}
                >
                  +
                </text>
              </>
            )}
            {Math.abs(maxArc - minArc) > 1 && (
              <path
                d={describeArc(50, 50, 38, minArc, maxArc)}
                fill="none"
                stroke={accentHex}
                strokeWidth="6"
                strokeLinecap="round"
              />
            )}

            {/* Outer LFO Range Span + Animated Back-and-Forth LFO Position Arc */}
            {lfoActive && (
              <>
                {Math.abs(spanMaxA - spanMinA) > 1 && (
                  <path
                    d={describeArc(50, 50, 47, spanMinA, spanMaxA)}
                    fill="none"
                    stroke={accentHex}
                    strokeOpacity="0.26"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                )}
                {Math.abs(animMaxA - animMinA) > 0.8 && (
                  <path
                    d={describeArc(50, 50, 47, animMinA, animMaxA)}
                    fill="none"
                    stroke={accentHex}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                )}
                <circle
                  cx={modDot.x}
                  cy={modDot.y}
                  r="3.2"
                  fill="var(--pg-text)"
                  stroke={accentHex}
                  strokeWidth="1.4"
                />
              </>
            )}

            <circle
              cx="50"
              cy="50"
              r="28"
              fill="var(--pg-surface)"
              stroke={dragging || rightModDragging ? accentHex : 'var(--pg-border-strong)'}
              strokeWidth="2.4"
            />
            <circle cx="50" cy="50" r="21" fill="var(--pg-panel)" />
            <line
              x1="50"
              y1="50"
              x2={indicator.x}
              y2={indicator.y}
              stroke={accentHex}
              strokeWidth="3.3"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Transient Right-Drag LFO Amount HUD */}
        {rightModDragging && lfo && (
          <div
            className="absolute -top-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-mono tabular-nums font-semibold whitespace-nowrap z-20 pointer-events-none shadow"
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
