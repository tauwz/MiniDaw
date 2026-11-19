import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  AudioWaveform,
  FolderOpen,
  Layers,
  Play,
  RotateCcw,
  Scissors,
  Sparkles,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  SamplerConfig,
  SamplerPlayMode,
  ThemePalette,
  ThreeXOscParams,
} from '../types/synth';
import {
  DecodedSampleAsset,
  createDefaultSamplerConfig,
  sampleStore,
} from '../audio/sampleStore';
import { synthEngine } from '../audio/synthEngine';
import { RotaryMiniWheel } from './controllers/RotaryMiniWheel';

interface SampleWaveEditorProps {
  channelId: string;
  params: ThreeXOscParams;
  rootNote: number;
  accentHex: string;
  palette: ThemePalette;
  onChangeSampler: (nextSampler: SamplerConfig) => void;
  onChangeChannelMeta?: (patch: { name?: string; rootNote?: number; presetTag?: string }) => void;
  onAuditionNote: (note: number, isOn: boolean) => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function formatMidi(midi: number): string {
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${oct}`;
}

type DragHandleKind = 'start' | 'end' | 'loopStart' | 'loopEnd';

export const SampleWaveEditor: React.FC<SampleWaveEditorProps> = ({
  channelId,
  params,
  rootNote,
  accentHex,
  palette,
  onChangeSampler,
  onChangeChannelMeta,
  onAuditionNote,
}) => {
  const cfg: SamplerConfig = useMemo(
    () => params.sampler ?? createDefaultSamplerConfig('builtin-808-kick', false),
    [params.sampler]
  );

  const [storeVersion, setStoreVersion] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [viewOffset, setViewOffset] = useState(0); // normalized 0..(1 - 1/zoom)
  const [isDragOver, setIsDragOver] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playheadNorm, setPlayheadNorm] = useState(-1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveBoxRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<DragHandleKind | null>(null);

  useEffect(() => sampleStore.subscribe(() => setStoreVersion((v) => v + 1)), []);

  const allSamples = useMemo(() => {
    void storeVersion;
    return sampleStore.listAll();
  }, [storeVersion]);

  const asset: DecodedSampleAsset | undefined = useMemo(() => {
    void storeVersion;
    return sampleStore.get(cfg.sampleId) ?? allSamples[0];
  }, [cfg.sampleId, allSamples, storeVersion]);

  // Poll live sample playhead while WaveView is open
  useEffect(() => {
    let raf = 0;
    let lastTick = 0;
    const poll = (now: number) => {
      if (now - lastTick >= 28) {
        lastTick = now;
        const nextPos = synthEngine.getChannelSamplePlayhead(channelId);
        setPlayheadNorm((prev) => (Math.abs(prev - nextPos) > 0.001 ? nextPos : prev));
      }
      raf = window.requestAnimationFrame(poll);
    };
    raf = window.requestAnimationFrame(poll);
    return () => window.cancelAnimationFrame(raf);
  }, [channelId]);

  const viewSpan = 1 / Math.max(1, zoom);
  const clampedOffset = Math.max(0, Math.min(1 - viewSpan, viewOffset));

  const patchSampler = (patch: Partial<SamplerConfig>) => {
    onChangeSampler({ ...cfg, ...patch });
  };

  const handleLoadFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setLoadError(null);
    try {
      const decoded = await sampleStore.decodeAudioFile(file);
      onChangeSampler({
        ...cfg,
        enabled: true,
        sampleId: decoded.id,
        sampleName: decoded.name,
        durationSec: decoded.durationSec,
        sampleRate: decoded.sampleRate,
        startNorm: 0,
        endNorm: 1,
        loopStartNorm: 0.15,
        loopEndNorm: 0.9,
        reverse: false,
      });
      setZoom(1);
      setViewOffset(0);
      if (onChangeChannelMeta) {
        onChangeChannelMeta({ presetTag: 'Sampler' });
      }
    } catch {
      setLoadError('Could not decode audio file. Please select a valid WAV, MP3, OGG, or FLAC.');
    }
  };

  const handleSelectBuiltInOrLoaded = (id: string) => {
    const chosen = sampleStore.get(id);
    if (!chosen) return;
    setLoadError(null);
    onChangeSampler({
      ...cfg,
      enabled: true,
      sampleId: chosen.id,
      sampleName: chosen.name,
      durationSec: chosen.durationSec,
      sampleRate: chosen.sampleRate,
      startNorm: 0,
      endNorm: 1,
      loopStartNorm: 0.2,
      loopEndNorm: 0.85,
    });
    setZoom(1);
    setViewOffset(0);
  };

  const handleCropTrim = () => {
    if (!asset) return;
    const trimmed = sampleStore.createTrimmedSample(
      asset.id,
      cfg.startNorm,
      cfg.endNorm,
      cfg.reverse
    );
    if (!trimmed) return;
    onChangeSampler({
      ...cfg,
      enabled: true,
      sampleId: trimmed.id,
      sampleName: trimmed.name,
      durationSec: trimmed.durationSec,
      sampleRate: trimmed.sampleRate,
      startNorm: 0,
      endNorm: 1,
      loopStartNorm: 0.15,
      loopEndNorm: 0.9,
      reverse: false,
    });
    setZoom(1);
    setViewOffset(0);
  };

  // Handle pointer dragging of Start / End / LoopStart / LoopEnd handles on WaveView
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const h = dragHandleRef.current;
      const box = waveBoxRef.current;
      if (!h || !box) return;
      const rect = box.getBoundingClientRect();
      const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const norm = Math.max(0, Math.min(1, clampedOffset + relX * viewSpan));

      if (h === 'start') {
        const nextStart = Math.min(cfg.endNorm - 0.01, norm);
        patchSampler({
          startNorm: Number(nextStart.toFixed(4)),
          loopStartNorm: Math.max(nextStart, cfg.loopStartNorm),
        });
      } else if (h === 'end') {
        const nextEnd = Math.max(cfg.startNorm + 0.01, norm);
        patchSampler({
          endNorm: Number(nextEnd.toFixed(4)),
          loopEndNorm: Math.min(nextEnd, cfg.loopEndNorm),
        });
      } else if (h === 'loopStart') {
        const nextLs = Math.max(cfg.startNorm, Math.min(cfg.loopEndNorm - 0.01, norm));
        patchSampler({ loopStartNorm: Number(nextLs.toFixed(4)) });
      } else if (h === 'loopEnd') {
        const nextLe = Math.min(cfg.endNorm, Math.max(cfg.loopStartNorm + 0.01, norm));
        patchSampler({ loopEndNorm: Number(nextLe.toFixed(4)) });
      }
    };
    const onUp = () => {
      dragHandleRef.current = null;
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

  // Render high-DPI waveform onto Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = waveBoxRef.current;
    if (!canvas || !box) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(240, box.clientWidth);
    const h = Math.max(140, box.clientHeight);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Subtle background & zero-crossing centerline
    ctx.fillStyle = palette.colors.canvas;
    ctx.fillRect(0, 0, w, h);

    const midY = h * 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.moveTo(0, h * 0.25);
    ctx.lineTo(w, h * 0.25);
    ctx.moveTo(0, h * 0.75);
    ctx.lineTo(w, h * 0.75);
    ctx.stroke();

    const toPxX = (norm: number) => ((norm - clampedOffset) / viewSpan) * w;

    // Loop region shading when Loop / PingPong is enabled
    const isLooped = cfg.playMode === 'loop' || cfg.playMode === 'pingPong';
    if (isLooped) {
      const lsX = toPxX(cfg.loopStartNorm);
      const leX = toPxX(cfg.loopEndNorm);
      ctx.fillStyle = `${palette.colors.tertiary}1f`;
      ctx.fillRect(lsX, 0, Math.max(1, leX - lsX), h);
    }

    // Draw PCM waveform
    if (asset && asset.left.length > 0) {
      const total = asset.left.length;
      const gainScale = cfg.gain * (cfg.normalize ? 1 : 1);
      const ampHalf = h * 0.44;

      // Stereo L+R peak envelope
      ctx.fillStyle = `${accentHex}55`;
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 1.25;

      const minPts: number[] = [];
      const maxPts: number[] = [];

      for (let px = 0; px < w; px++) {
        const norm0 = clampedOffset + (px / w) * viewSpan;
        const norm1 = clampedOffset + ((px + 1) / w) * viewSpan;
        const idx0 = Math.max(0, Math.min(total - 1, Math.floor(norm0 * (total - 1))));
        const idx1 = Math.max(idx0 + 1, Math.min(total, Math.ceil(norm1 * (total - 1))));
        let mn = 0;
        let mx = 0;
        const stride = Math.max(1, Math.floor((idx1 - idx0) / 32));
        for (let k = idx0; k < idx1; k += stride) {
          const sample = (asset.left[k] + (asset.right[k] ?? asset.left[k])) * 0.5;
          if (sample < mn) mn = sample;
          if (sample > mx) mx = sample;
        }
        const scaledMin = Math.max(-1, Math.min(1, mn * Math.min(1.8, gainScale)));
        const scaledMax = Math.max(-1, Math.min(1, mx * Math.min(1.8, gainScale)));
        minPts.push(midY - scaledMin * ampHalf);
        maxPts.push(midY - scaledMax * ampHalf);
      }

      ctx.beginPath();
      for (let px = 0; px < w; px++) {
        if (px === 0) ctx.moveTo(px, maxPts[px]);
        else ctx.lineTo(px, maxPts[px]);
      }
      for (let px = w - 1; px >= 0; px--) {
        ctx.lineTo(px, minPts[px]);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Out-of-trim shaded regions
    const sX = toPxX(cfg.startNorm);
    const eX = toPxX(cfg.endNorm);
    ctx.fillStyle = 'rgba(6, 8, 12, 0.62)';
    if (sX > 0) ctx.fillRect(0, 0, Math.min(w, sX), h);
    if (eX < w) ctx.fillRect(Math.max(0, eX), 0, w - Math.max(0, eX), h);

    // Fade-in / Fade-out visual envelope curves inside [sX..eX]
    const activeW = Math.max(4, eX - sX);
    if (cfg.fadeInNorm > 0.004) {
      const fInPx = cfg.fadeInNorm * activeW;
      ctx.strokeStyle = palette.colors.secondary;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sX, h - 6);
      ctx.lineTo(sX + fInPx, 10);
      ctx.stroke();
    }
    if (cfg.fadeOutNorm > 0.004 && !isLooped) {
      const fOutPx = cfg.fadeOutNorm * activeW;
      ctx.strokeStyle = palette.colors.secondary;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(eX - fOutPx, 10);
      ctx.lineTo(eX, h - 6);
      ctx.stroke();
    }

    // Live audio playhead bar
    if (playheadNorm >= 0 && playheadNorm <= 1) {
      const pX = toPxX(playheadNorm);
      if (pX >= 0 && pX <= w) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pX, 0);
        ctx.lineTo(pX, h);
        ctx.stroke();
      }
    }
  }, [asset, cfg, clampedOffset, viewSpan, accentHex, palette, playheadNorm]);

  const trimmedSec = asset ? asset.durationSec * Math.max(0.01, cfg.endNorm - cfg.startNorm) : 0;
  const toPct = (norm: number) =>
    Math.max(-5, Math.min(105, ((norm - clampedOffset) / viewSpan) * 100));

  return (
    <div
      className="h-full w-full flex flex-col gap-2.5 p-3 overflow-y-auto"
      style={{ backgroundColor: 'var(--pg-canvas)', color: 'var(--pg-text)' }}
    >
      {/* Top Tone Source & Sample Loader Bar */}
      <div
        className="p-2.5 rounded-md flex flex-wrap items-center justify-between gap-2"
        style={{
          backgroundColor: 'var(--pg-surface)',
          border: '1px solid var(--pg-border)',
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <AudioWaveform size={15} style={{ color: accentHex }} />
            <span className="text-xs font-semibold">Sample WaveView</span>
          </div>

          {/* Primary Tone Engine Mode: Sampler vs 3xOsc Synth */}
          <div
            className="flex items-center rounded overflow-hidden"
            style={{ border: '1px solid var(--pg-border)' }}
          >
            <button
              type="button"
              onClick={() => patchSampler({ enabled: true })}
              className="px-2 py-1 text-[10px] font-mono font-bold"
              style={{
                backgroundColor: cfg.enabled ? accentHex : 'var(--pg-panel)',
                color: cfg.enabled ? '#090b10' : 'var(--pg-text-muted)',
              }}
            >
              SAMPLER ACTIVE
            </button>
            <button
              type="button"
              onClick={() => patchSampler({ enabled: false })}
              className="px-2 py-1 text-[10px] font-mono font-bold"
              style={{
                backgroundColor: !cfg.enabled ? palette.colors.primary : 'var(--pg-panel)',
                color: !cfg.enabled ? '#090b10' : 'var(--pg-text-muted)',
              }}
            >
              3xOSC SYNTH
            </button>
          </div>

          <button
            type="button"
            onClick={() => patchSampler({ layerOscs: !cfg.layerOscs, enabled: true })}
            title="Layer WAV/MP3 Sample with 3xOsc OSC 2 & OSC 3"
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-semibold"
            style={{
              backgroundColor: cfg.layerOscs ? `${palette.colors.tertiary}26` : 'var(--pg-panel)',
              color: cfg.layerOscs ? palette.colors.tertiary : 'var(--pg-text-muted)',
              border: `1px solid ${cfg.layerOscs ? palette.colors.tertiary : 'var(--pg-border)'}`,
            }}
          >
            <Layers size={11} />
            <span>+ Layer Osc 2/3</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Built-in & Loaded Sample Picker */}
          <select
            value={asset?.id ?? cfg.sampleId}
            onChange={(e) => handleSelectBuiltInOrLoaded(e.target.value)}
            className="px-2 py-1 rounded text-[11px] font-mono outline-none max-w-[200px]"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-text)',
            }}
          >
            {allSamples.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationSec.toFixed(2)}s)
              </option>
            ))}
          </select>

          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.mp3,.ogg,.flac,.m4a,.aif,.aiff,audio/*"
            className="hidden"
            onChange={(e) => {
              void handleLoadFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold hover:brightness-110"
            style={{
              backgroundColor: `${accentHex}24`,
              color: accentHex,
              border: `1px solid ${accentHex}77`,
            }}
          >
            <FolderOpen size={12} />
            <span>Load WAV / MP3</span>
          </button>

          <button
            type="button"
            onPointerDown={() => {
              if (!cfg.enabled) patchSampler({ enabled: true });
              onAuditionNote(rootNote, true);
            }}
            onPointerUp={() => onAuditionNote(rootNote, false)}
            onPointerLeave={() => onAuditionNote(rootNote, false)}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold"
            style={{
              backgroundColor: accentHex,
              color: '#090b10',
            }}
            title="Trigger & hold sample at current Root/Step Note"
          >
            <Play size={11} />
            <span>Trigger {formatMidi(rootNote)}</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div
          className="px-3 py-1.5 rounded text-[11px] font-mono"
          style={{
            backgroundColor: `${palette.colors.alert}22`,
            color: palette.colors.alert,
            border: `1px solid ${palette.colors.alert}66`,
          }}
        >
          {loadError}
        </div>
      )}

      {/* Interactive High-DPI WaveView Editor */}
      <div
        className="rounded-md overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--pg-surface)',
          border: `1.5px solid ${isDragOver ? accentHex : 'var(--pg-border-strong)'}`,
        }}
      >
        {/* WaveView Telemetry & Zoom Strip */}
        <div
          className="px-2.5 py-1 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono"
          style={{
            backgroundColor: 'var(--pg-panel)',
            borderBottom: '1px solid var(--pg-border)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold truncate" style={{ color: accentHex }}>
              {cfg.sampleName}
            </span>
            <span style={{ color: 'var(--pg-text-dim)' }}>
              {(cfg.sampleRate / 1000).toFixed(1)} kHz
            </span>
            <span style={{ color: 'var(--pg-text-muted)' }}>
              Region: {(trimmedSec * 1000).toFixed(0)} ms
            </span>
            {cfg.reverse && (
              <span
                className="px-1 rounded text-[9px] font-bold"
                style={{ backgroundColor: `${palette.colors.tertiary}26`, color: palette.colors.tertiary }}
              >
                REV
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, Number((z / 1.5).toFixed(2))))}
              className="p-1 rounded hover:bg-white/10"
              title="Zoom Out Waveform"
            >
              <ZoomOut size={12} />
            </button>
            <span className="w-9 text-center tabular-nums">{zoom.toFixed(1)}x</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(16, Number((z * 1.5).toFixed(2))))}
              className="p-1 rounded hover:bg-white/10"
              title="Zoom In Waveform"
            >
              <ZoomIn size={12} />
            </button>
            {zoom > 1 && (
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setViewOffset(0);
                }}
                className="p-1 rounded hover:bg-white/10"
                title="Reset Waveform Zoom"
              >
                <RotateCcw size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Interactive Waveform Canvas + Trim/Loop Handles + Drag-and-Drop */}
        <div
          ref={waveBoxRef}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            void handleLoadFiles(e.dataTransfer.files);
          }}
          className="relative h-[215px] w-full select-none overflow-hidden"
        >
          <canvas ref={canvasRef} className="w-full h-full block" />

          {/* Drop Overlay */}
          {isDragOver && (
            <div
              className="absolute inset-0 z-30 flex items-center justify-center gap-2 text-xs font-semibold pointer-events-none"
              style={{
                backgroundColor: 'rgba(10, 14, 20, 0.78)',
                color: accentHex,
              }}
            >
              <Upload size={16} />
              <span>Drop WAV / MP3 / OGG Audio File to Load</span>
            </div>
          )}

          {/* Start Trim Handle */}
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              dragHandleRef.current = 'start';
            }}
            style={{ left: `${toPct(cfg.startNorm)}%` }}
            title="Drag Sample Start Trim"
            className="absolute top-0 bottom-0 w-3 -ml-1.5 z-20 cursor-ew-resize flex flex-col items-center"
          >
            <div
              className="w-[2px] h-full"
              style={{ backgroundColor: palette.colors.primary }}
            />
            <span
              className="absolute top-1 px-1 rounded-xs text-[8px] font-mono font-bold shadow"
              style={{ backgroundColor: palette.colors.primary, color: '#090b10' }}
            >
              S
            </span>
          </div>

          {/* End Trim Handle */}
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              dragHandleRef.current = 'end';
            }}
            style={{ left: `${toPct(cfg.endNorm)}%` }}
            title="Drag Sample End Trim"
            className="absolute top-0 bottom-0 w-3 -ml-1.5 z-20 cursor-ew-resize flex flex-col items-center"
          >
            <div
              className="w-[2px] h-full"
              style={{ backgroundColor: palette.colors.alert }}
            />
            <span
              className="absolute top-1 px-1 rounded-xs text-[8px] font-mono font-bold shadow"
              style={{ backgroundColor: palette.colors.alert, color: '#ffffff' }}
            >
              E
            </span>
          </div>

          {/* Loop Handles (visible in Loop / Ping-Pong modes) */}
          {(cfg.playMode === 'loop' || cfg.playMode === 'pingPong') && (
            <>
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  dragHandleRef.current = 'loopStart';
                }}
                style={{ left: `${toPct(cfg.loopStartNorm)}%` }}
                title="Drag Loop Start"
                className="absolute top-0 bottom-0 w-3 -ml-1.5 z-10 cursor-ew-resize flex flex-col items-center"
              >
                <div
                  className="w-[1.5px] h-full"
                  style={{ backgroundColor: palette.colors.tertiary }}
                />
                <span
                  className="absolute bottom-1 px-1 rounded-xs text-[8px] font-mono font-bold"
                  style={{ backgroundColor: palette.colors.tertiary, color: '#090b10' }}
                >
                  LS
                </span>
              </div>

              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  dragHandleRef.current = 'loopEnd';
                }}
                style={{ left: `${toPct(cfg.loopEndNorm)}%` }}
                title="Drag Loop End"
                className="absolute top-0 bottom-0 w-3 -ml-1.5 z-10 cursor-ew-resize flex flex-col items-center"
              >
                <div
                  className="w-[1.5px] h-full"
                  style={{ backgroundColor: palette.colors.tertiary }}
                />
                <span
                  className="absolute bottom-1 px-1 rounded-xs text-[8px] font-mono font-bold"
                  style={{ backgroundColor: palette.colors.tertiary, color: '#090b10' }}
                >
                  LE
                </span>
              </div>
            </>
          )}

          {/* Drop hint */}
          <div
            className="absolute bottom-1 right-2 text-[9px] font-mono pointer-events-none opacity-75"
            style={{ color: 'var(--pg-text-dim)' }}
          >
            Drag WAV/MP3 here · Drag S / E / LS / LE markers
          </div>
        </div>

        {/* Zoom Scrollbar when Zoom > 1 */}
        {zoom > 1.02 && (
          <div
            className="px-2 py-1 flex items-center gap-2"
            style={{
              backgroundColor: 'var(--pg-panel)',
              borderTop: '1px solid var(--pg-border)',
            }}
          >
            <span className="text-[9px] font-mono" style={{ color: 'var(--pg-text-dim)' }}>
              SCROLL
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(0.001, 1 - viewSpan)}
              step={0.002}
              value={clampedOffset}
              onChange={(e) => setViewOffset(Number(e.target.value))}
              className="flex-1 accent-current"
              style={{ color: accentHex }}
            />
          </div>
        )}
      </div>

      {/* Triggering Mode, Pitch Tracking, Region Tools & Shaping Knobs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {/* Left: Playback Trigger & Pitch Controls */}
        <div
          className="p-2.5 rounded-md flex flex-col gap-2"
          style={{
            backgroundColor: 'var(--pg-surface)',
            border: '1px solid var(--pg-border)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase" style={{ color: 'var(--pg-text-muted)' }}>
              Trigger &amp; Playback Mode
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => patchSampler({ reverse: !cfg.reverse })}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1"
                style={{
                  backgroundColor: cfg.reverse ? `${palette.colors.tertiary}28` : 'var(--pg-panel)',
                  color: cfg.reverse ? palette.colors.tertiary : 'var(--pg-text-muted)',
                  border: `1px solid ${cfg.reverse ? palette.colors.tertiary : 'var(--pg-border)'}`,
                }}
                title="Reverse Sample Playback"
              >
                <ArrowLeftRight size={9} />
                <span>REV</span>
              </button>
              <button
                type="button"
                onClick={() => patchSampler({ normalize: !cfg.normalize })}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1"
                style={{
                  backgroundColor: cfg.normalize ? `${palette.colors.secondary}28` : 'var(--pg-panel)',
                  color: cfg.normalize ? palette.colors.secondary : 'var(--pg-text-muted)',
                  border: `1px solid ${cfg.normalize ? palette.colors.secondary : 'var(--pg-border)'}`,
                }}
                title="Auto-Normalize Sample Peak to -0.5 dB"
              >
                <Sparkles size={9} />
                <span>NORM</span>
              </button>
              <button
                type="button"
                onClick={handleCropTrim}
                disabled={cfg.startNorm <= 0.002 && cfg.endNorm >= 0.998 && !cfg.reverse}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1 disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--pg-panel)',
                  color: 'var(--pg-text)',
                  border: '1px solid var(--pg-border)',
                }}
                title="Commit current Start/End selection & Reverse into a cropped sample"
              >
                <Scissors size={9} />
                <span>Crop</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1">
            {(
              [
                { id: 'oneShot', label: 'One-Shot' },
                { id: 'sustain', label: 'Gate' },
                { id: 'loop', label: 'Loop' },
                { id: 'pingPong', label: 'PingPong' },
              ] as { id: SamplerPlayMode; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => patchSampler({ playMode: m.id })}
                className="py-1 rounded text-[10px] font-mono font-semibold"
                style={{
                  backgroundColor: cfg.playMode === m.id ? accentHex : 'var(--pg-panel)',
                  color: cfg.playMode === m.id ? '#090b10' : 'var(--pg-text-muted)',
                  border: '1px solid var(--pg-border)',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <label
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono"
              style={{
                backgroundColor: 'var(--pg-panel)',
                border: '1px solid var(--pg-border)',
              }}
            >
              <span style={{ color: 'var(--pg-text-dim)' }}>Sample Root</span>
              <select
                value={cfg.rootMidi}
                onChange={(e) => patchSampler({ rootMidi: Number(e.target.value) })}
                className="bg-transparent font-bold outline-none"
                style={{ color: accentHex }}
              >
                {Array.from({ length: 108 }, (_, idx) => idx + 12).map((midi) => (
                  <option key={midi} value={midi} className="bg-[#151820] text-[#ECEEF2]">
                    {formatMidi(midi)}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => patchSampler({ pitchTrack: !cfg.pitchTrack })}
              className="px-2 py-1 rounded text-[10px] font-mono font-semibold"
              style={{
                backgroundColor: cfg.pitchTrack ? `${palette.colors.primary}24` : 'var(--pg-panel)',
                color: cfg.pitchTrack ? palette.colors.primary : 'var(--pg-text-muted)',
                border: `1px solid ${cfg.pitchTrack ? palette.colors.primary : 'var(--pg-border)'}`,
              }}
              title="Track Piano Roll notes chromatically vs fixed drum playback pitch"
            >
              {cfg.pitchTrack ? 'Pitch Track: Chromatic' : 'Pitch Track: Fixed Drum'}
            </button>
          </div>
        </div>

        {/* Right: Precision Level, Pitch & Edge Shaping Wheels */}
        <div
          className="p-2.5 rounded-md flex flex-col justify-between gap-2"
          style={{
            backgroundColor: 'var(--pg-surface)',
            border: '1px solid var(--pg-border)',
          }}
        >
          <span className="text-[10px] font-mono font-bold uppercase" style={{ color: 'var(--pg-text-muted)' }}>
            Sample Gain, Pitch &amp; Fades
          </span>
          <div className="grid grid-cols-6 gap-1.5 items-center">
            <RotaryMiniWheel
              size="sm"
              label="GAIN"
              value={cfg.gain / 2}
              accentHex={accentHex}
              readout={`${Math.round(cfg.gain * 100)}%`}
              defaultValue={0.5}
              onChange={(v) => patchSampler({ gain: Number((v * 2).toFixed(3)) })}
            />
            <RotaryMiniWheel
              size="sm"
              label="TUNE"
              value={(cfg.tuneSemi + 24) / 48}
              bipolar
              accentHex={palette.colors.primary}
              readout={`${cfg.tuneSemi > 0 ? '+' : ''}${cfg.tuneSemi}st`}
              defaultValue={0.5}
              onChange={(v) => patchSampler({ tuneSemi: Math.round((v - 0.5) * 48) })}
            />
            <RotaryMiniWheel
              size="sm"
              label="FINE"
              value={(cfg.fineCents + 100) / 200}
              bipolar
              accentHex={palette.colors.primary}
              readout={`${cfg.fineCents > 0 ? '+' : ''}${cfg.fineCents}ct`}
              defaultValue={0.5}
              onChange={(v) => patchSampler({ fineCents: Math.round((v - 0.5) * 200) })}
            />
            <RotaryMiniWheel
              size="sm"
              label="FADE IN"
              value={cfg.fadeInNorm / 0.35}
              accentHex={palette.colors.secondary}
              readout={`${Math.round(cfg.fadeInNorm * trimmedSec * 1000)}ms`}
              defaultValue={0}
              onChange={(v) => patchSampler({ fadeInNorm: Number((v * 0.35).toFixed(3)) })}
            />
            <RotaryMiniWheel
              size="sm"
              label="FADE OUT"
              value={cfg.fadeOutNorm / 0.35}
              accentHex={palette.colors.secondary}
              readout={`${Math.round(cfg.fadeOutNorm * trimmedSec * 1000)}ms`}
              defaultValue={0.02 / 0.35}
              onChange={(v) => patchSampler({ fadeOutNorm: Number((v * 0.35).toFixed(3)) })}
            />
            <RotaryMiniWheel
              size="sm"
              label="XFADE"
              value={cfg.crossfadeNorm / 0.25}
              accentHex={palette.colors.tertiary}
              readout={`${Math.round(cfg.crossfadeNorm * 100)}%`}
              defaultValue={0.04 / 0.25}
              onChange={(v) => patchSampler({ crossfadeNorm: Number((v * 0.25).toFixed(3)) })}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
