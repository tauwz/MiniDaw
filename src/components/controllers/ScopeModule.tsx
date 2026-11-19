import React, { useEffect, useRef } from 'react';
import { synthEngine } from '../../audio/synthEngine';

interface ScopeModuleProps {
  accentHex: string;
  audioEnabled: boolean;
}

export const ScopeModule: React.FC<ScopeModuleProps> = ({ accentHex, audioEnabled }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let rafId = 0;
    const buffer = new Uint8Array(new ArrayBuffer(1024));

    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);

          // Center hairline
          ctx.strokeStyle = 'rgba(141, 149, 165, 0.22)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, h / 2);
          ctx.lineTo(w, h / 2);
          ctx.stroke();

          const hasAudio = synthEngine.getWaveformData(buffer);

          ctx.strokeStyle = accentHex;
          ctx.lineWidth = 2;
          ctx.beginPath();

          if (hasAudio) {
            // Find rising zero crossing for steady display
            let startIdx = 0;
            for (let i = 1; i < 400; i++) {
              if (buffer[i - 1] < 128 && buffer[i] >= 128) {
                startIdx = i;
                break;
              }
            }
            const sliceLen = 360;
            for (let i = 0; i < sliceLen; i++) {
              const sample = (buffer[startIdx + i] - 128) / 128;
              const x = (i / (sliceLen - 1)) * w;
              const y = h / 2 + sample * (h * 0.42);
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
          } else {
            // Quiet standby sine reference at low opacity
            ctx.strokeStyle = 'rgba(141, 149, 165, 0.35)';
            ctx.lineWidth = 1.2;
            ctx.moveTo(0, h / 2);
            ctx.lineTo(w, h / 2);
          }
          ctx.stroke();
        }
      }
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [accentHex, audioEnabled]);

  return (
    <div
      className="relative w-full h-full rounded overflow-hidden flex items-center justify-center"
      style={{ backgroundColor: 'var(--pg-canvas)', border: '1px solid var(--pg-border)' }}
    >
      <canvas ref={canvasRef} width={360} height={110} className="w-full h-full block" />
      {!audioEnabled && (
        <span
          className="absolute bottom-1.5 right-2 text-[10px] font-mono pointer-events-none"
          style={{ color: 'var(--pg-text-dim)' }}
        >
          Audio standby
        </span>
      )}
    </div>
  );
};
