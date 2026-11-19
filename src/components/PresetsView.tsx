import React, { useRef, useState } from 'react';
import { Check, Download, Plus, Trash2, Upload } from 'lucide-react';
import { PaletteId, SynthLayoutPreset, ThemePalette } from '../types/synth';
import { THEME_PALETTES } from '../data/themes';

interface PresetsViewProps {
  presets: SynthLayoutPreset[];
  activePresetId: string;
  currentPalette: ThemePalette;
  onLoadPreset: (preset: SynthLayoutPreset) => void;
  onSaveCurrentRig: (name: string, category: string) => void;
  onDeleteCustomPreset: (id: string) => void;
  onExportJson: () => void;
  onImportJson: (jsonText: string) => { ok: boolean; error?: string };
  onSelectPalette: (id: PaletteId) => void;
}

export const PresetsView: React.FC<PresetsViewProps> = ({
  presets,
  activePresetId,
  currentPalette,
  onLoadPreset,
  onSaveCurrentRig,
  onDeleteCustomPreset,
  onExportJson,
  onImportJson,
  onSelectPalette,
}) => {
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Custom Rig');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onSaveCurrentRig(newName.trim(), newCategory.trim() || 'Custom Rig');
    setNewName('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = onImportJson(text);
    if (!res.ok) {
      setImportError(res.error || 'Invalid preset file');
    } else {
      setImportError(null);
    }
    e.target.value = '';
  };

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ backgroundColor: 'var(--pg-canvas)' }}>
      <div className="max-w-6xl mx-auto flex flex-col gap-8">
        {/* Header & Save / Export Bar */}
        <div
          className="rounded-md p-5 flex flex-wrap items-center justify-between gap-4"
          style={{
            backgroundColor: 'var(--pg-surface)',
            border: '1px solid var(--pg-border)',
          }}
        >
          <div>
            <h1 className="text-base font-semibold" style={{ color: 'var(--pg-text)' }}>
              Synth Surface Presets &amp; Color Palettes
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--pg-text-muted)' }}>
              Load studio templates, save your modular touch layout locally, or export JSON patches for backup.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onExportJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap"
              style={{
                backgroundColor: 'var(--pg-panel)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              <Download size={13} />
              <span>Export Rig JSON</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap"
              style={{
                backgroundColor: 'var(--pg-panel)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              <Upload size={13} />
              <span>Import JSON</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>

        {importError && (
          <div
            className="rounded-md px-4 py-2.5 text-xs"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-alert)',
              color: 'var(--pg-alert)',
            }}
          >
            {importError}
          </div>
        )}

        {/* Color Palettes Gallery */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--pg-text)' }}>
              Color Palettes
            </h2>
            <span className="text-xs" style={{ color: 'var(--pg-text-muted)' }}>
              Active: {currentPalette.name}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {THEME_PALETTES.map((p) => {
              const isCurrent = p.id === currentPalette.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectPalette(p.id)}
                  className="text-left rounded-md p-4 flex flex-col gap-3 transition-colors"
                  style={{
                    backgroundColor: 'var(--pg-surface)',
                    border: `1px solid ${isCurrent ? 'var(--pg-primary)' : 'var(--pg-border)'}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--pg-text)' }}>
                        <span>{p.name}</span>
                        {p.id === 'warehouse-obsidian' && (
                          <span className="text-[11px] font-normal" style={{ color: 'var(--pg-text-dim)' }}>
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--pg-text-muted)' }}>
                        {p.subtitle}
                      </p>
                    </div>
                    {isCurrent && (
                      <span
                        className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: 'var(--pg-primary)',
                          color: 'var(--pg-primary-text)',
                        }}
                      >
                        <Check size={12} />
                      </span>
                    )}
                  </div>

                  {/* Swatch strip */}
                  <div className="grid grid-cols-6 gap-1.5 h-6">
                    <div className="rounded-sm" title="Canvas" style={{ backgroundColor: p.colors.canvas, border: '1px solid var(--pg-border-strong)' }} />
                    <div className="rounded-sm" title="Surface" style={{ backgroundColor: p.colors.module, border: '1px solid var(--pg-border-strong)' }} />
                    <div className="rounded-sm" title="Primary" style={{ backgroundColor: p.colors.primary }} />
                    <div className="rounded-sm" title="Secondary" style={{ backgroundColor: p.colors.secondary }} />
                    <div className="rounded-sm" title="Tertiary" style={{ backgroundColor: p.colors.tertiary }} />
                    <div className="rounded-sm" title="Quaternary" style={{ backgroundColor: p.colors.quaternary }} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Save Current Layout Form */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--pg-text)' }}>
            Save Current Modular Layout
          </h2>
          <form
            onSubmit={handleSave}
            className="rounded-md p-4 flex flex-wrap items-end gap-3"
            style={{
              backgroundColor: 'var(--pg-surface)',
              border: '1px solid var(--pg-border)',
            }}
          >
            <label className="flex-1 min-w-[200px] flex flex-col gap-1">
              <span className="text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>Rig Name</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Berlin Live Dub Rack"
                className="px-3 py-1.5 rounded text-xs outline-none"
                style={{
                  backgroundColor: 'var(--pg-canvas)',
                  border: '1px solid var(--pg-border)',
                  color: 'var(--pg-text)',
                }}
              />
            </label>
            <label className="w-44 flex flex-col gap-1">
              <span className="text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>Category</span>
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="px-3 py-1.5 rounded text-xs outline-none"
                style={{
                  backgroundColor: 'var(--pg-canvas)',
                  border: '1px solid var(--pg-border)',
                  color: 'var(--pg-text)',
                }}
              />
            </label>
            <button
              type="submit"
              disabled={!newName.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold whitespace-nowrap disabled:opacity-40"
              style={{
                backgroundColor: 'var(--pg-primary)',
                color: 'var(--pg-primary-text)',
              }}
            >
              <Plus size={13} />
              <span>Save Layout</span>
            </button>
          </form>
        </section>

        {/* Layout Presets Grid */}
        <section className="flex flex-col gap-3 pb-6">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--pg-text)' }}>
            Synth Surface Templates
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {presets.map((preset) => {
              const isActive = preset.id === activePresetId;
              return (
                <div
                  key={preset.id}
                  className="rounded-md p-4 flex flex-col justify-between gap-3"
                  style={{
                    backgroundColor: 'var(--pg-surface)',
                    border: `1px solid ${isActive ? 'var(--pg-primary)' : 'var(--pg-border)'}`,
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--pg-text)' }}>
                        {preset.name}
                      </h3>
                      <span className="text-[11px] font-mono" style={{ color: 'var(--pg-text-muted)' }}>
                        {preset.grid.cols}×{preset.grid.rows} · {preset.bpm} BPM
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] mt-1" style={{ color: 'var(--pg-text-dim)' }}>
                      <span>{preset.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{preset.modules.length} modules</span>
                      <span aria-hidden="true">·</span>
                      <span>{preset.updatedAt}</span>
                    </div>
                    <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--pg-text-muted)' }}>
                      {preset.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--pg-border)' }}>
                    <button
                      type="button"
                      onClick={() => onLoadPreset(preset)}
                      className="px-3.5 py-1.5 rounded text-xs font-semibold transition-colors"
                      style={{
                        backgroundColor: isActive ? 'var(--pg-secondary)' : 'var(--pg-primary)',
                        color: 'var(--pg-primary-text)',
                      }}
                    >
                      {isActive ? 'Reload Rig' : 'Load Rig'}
                    </button>

                    {!preset.isFactory && (
                      <button
                        type="button"
                        onClick={() => onDeleteCustomPreset(preset.id)}
                        className="p-1.5 rounded hover:opacity-80"
                        style={{ color: 'var(--pg-alert)' }}
                        title="Delete saved layout"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
