import React, { useRef, useState } from 'react';

export interface RotaryMiniWheelProps {
  label: string;
  value: number; // 0..1 normalized
  bipolar?: boolean;
  bipolarHints?: boolean; // show subtle - left / + right markers
  accentHex: string;
  readout: string;
  defaultValue: number;
  size?: 'sm' | 'md';
  disabled?: boolean;
  linkedLabel?: string;
  onChange: (nextNorm: number) => void;
}

export const RotaryMiniWheel: React.FC<RotaryMiniWheelProps> = ({
  label,
  value,
  bipolar = false,
  bipolarHints = false,
  accentHex,
  readout,
  defaultValue,
  size = 'sm',
  disabled = false,
  linkedLabel,
  onChange,
}) => {
  const clamped = Math.max(0, Math.min(1, value));
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef(0);
  const startValRef = useRef(clamped);

  const startAngle = -135;
  const endAngle = 135;
  const currentAngle = startAngle + clamped * (endAngle - startAngle);

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

  const arcStart = bipolar ? 0 : startAngle;
  const minArc = Math.min(arcStart, currentAngle);
  const maxArc = Math.max(arcStart, currentAngle);
  const indicator = polarToCartesian(32, 32, 15, currentAngle);
  const zeroTickOuter = polarToCartesian(32, 32, 29.5, 0);
  const zeroTickInner = polarToCartesian(32, 32, 24.5, 0);
  const dimSize = size === 'md' ? 'w-11 h-11' : 'w-8 h-8';

  return (
    <div
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        const step = e.shiftKey ? 0.08 : 0.02;
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === '+') {
          e.preventDefault();
          onChange(Math.min(1, Number((clamped + step).toFixed(3))));
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === '-') {
          e.preventDefault();
          onChange(Math.max(0, Number((clamped - step).toFixed(3))));
        }
      }}
      className="flex flex-col items-center justify-center select-none outline-none py-1 px-0.5 rounded transition-colors"
      style={{
        backgroundColor: 'var(--pg-canvas)',
        border: `1px solid ${dragging ? accentHex : linkedLabel ? `${accentHex}77` : 'var(--pg-border)'}`,
        opacity: disabled ? 0.72 : 1,
      }}
      title={
        linkedLabel
          ? `${label}: ${readout} (Controlled by ${linkedLabel})`
          : `${label}: ${readout} (Drag vertically · Shift for fine · Double-click to reset)`
      }
    >
      <div
        className={`relative ${dimSize} flex items-center justify-center ${
          disabled ? 'cursor-default' : 'cursor-ns-resize'
        }`}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          startYRef.current = e.clientY;
          startValRef.current = clamped;
        }}
        onPointerMove={(e) => {
          if (!dragging || disabled) return;
          const sens = e.shiftKey ? 360 : 120;
          const next = Math.max(
            0,
            Math.min(1, Number((startValRef.current + (startYRef.current - e.clientY) / sens).toFixed(3)))
          );
          onChange(next);
        }}
        onPointerUp={(e) => {
          if (!dragging) return;
          setDragging(false);
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
        }}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={(e) => {
          if (disabled) return;
          e.stopPropagation();
          onChange(defaultValue);
        }}
      >
        <svg viewBox="0 0 64 64" className="w-full h-full overflow-visible block">
          <path
            d={describeArc(32, 32, 25, startAngle, endAngle)}
            fill="none"
            stroke="var(--pg-border-strong)"
            strokeWidth="4.6"
            strokeLinecap="round"
          />
          {bipolar && (
            <line
              x1={zeroTickInner.x}
              y1={zeroTickInner.y}
              x2={zeroTickOuter.x}
              y2={zeroTickOuter.y}
              stroke="var(--pg-text-dim)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          )}
          {bipolar && bipolarHints && (
            <>
              <text
                x="5"
                y="57"
                fontSize="10"
                fontFamily="monospace"
                fontWeight="700"
                fill="var(--pg-text-dim)"
              >
                −
              </text>
              <text
                x="52"
                y="57"
                fontSize="10"
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
              d={describeArc(32, 32, 25, minArc, maxArc)}
              fill="none"
              stroke={accentHex}
              strokeWidth="4.6"
              strokeLinecap="round"
            />
          )}
          <circle
            cx="32"
            cy="32"
            r="17.5"
            fill="var(--pg-surface)"
            stroke={dragging ? accentHex : 'var(--pg-border-strong)'}
            strokeWidth="1.8"
          />
          <circle cx="32" cy="32" r="13" fill="var(--pg-panel)" />
          <line
            x1="32"
            y1="32"
            x2={indicator.x}
            y2={indicator.y}
            stroke={accentHex}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex items-center gap-1 leading-none text-[9px] font-mono tabular-nums px-0.5 max-w-full">
        <span className="font-semibold shrink-0" style={{ color: 'var(--pg-text-muted)' }}>
          {label}
        </span>
        <span className="truncate" style={{ color: bipolar ? accentHex : 'var(--pg-text)' }}>
          {readout}
        </span>
      </div>
      {linkedLabel && (
        <div
          className="text-[8px] font-mono truncate max-w-full px-1 leading-tight mt-0.5"
          style={{ color: accentHex }}
        >
          ← {linkedLabel}
        </div>
      )}
    </div>
  );
};
