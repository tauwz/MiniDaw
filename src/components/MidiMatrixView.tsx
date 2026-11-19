import React, { useMemo, useState } from 'react';
import { AlertTriangle, Search, Send } from 'lucide-react';
import {
  MidiCurve,
  MidiMapping,
  MidiMessageType,
  SynthModule,
  SynthParamTarget,
  ThemePalette,
} from '../types/synth';
import { SYNTH_TARGET_OPTIONS } from '../data/presets';
import { resolveAccentHex } from '../data/themes';
import { midiEngine } from '../midi/midiEngine';

interface MidiMatrixViewProps {
  modules: SynthModule[];
  palette: ThemePalette;
  onUpdateModule: (id: string, updater: (prev: SynthModule) => SynthModule) => void;
}

export const MidiMatrixView: React.FC<MidiMatrixViewProps> = ({
  modules,
  palette,
  onUpdateModule,
}) => {
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');

  const routableModules = useMemo(
    () => modules.filter((m) => m.type !== 'scope'),
    [modules]
  );

  // Detect duplicate Channel + CC / Note collisions
  const conflictKeys = useMemo(() => {
    const counts = new Map<string, number>();
    routableModules.forEach((m) => {
      if (!m.midi.enabled) return;
      const k = `${m.midi.channel}:${m.midi.messageType}:${m.midi.ccNumber}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
      if (m.secondaryMidi?.enabled) {
        const k2 = `${m.secondaryMidi.channel}:${m.secondaryMidi.messageType}:${m.secondaryMidi.ccNumber}`;
        counts.set(k2, (counts.get(k2) ?? 0) + 1);
      }
    });
    const dupes = new Set<string>();
    counts.forEach((c, k) => {
      if (c > 1) dupes.add(k);
    });
    return dupes;
  }, [routableModules]);

  const rows = useMemo(() => {
    const list: {
      module: SynthModule;
      axis: 'Primary' | 'X-Axis' | 'Y-Axis';
      mapping: MidiMapping;
      isSecondary: boolean;
    }[] = [];

    routableModules.forEach((m) => {
      list.push({
        module: m,
        axis: m.type === 'xypad' ? 'X-Axis' : 'Primary',
        mapping: m.midi,
        isSecondary: false,
      });
      if (m.type === 'xypad' && m.secondaryMidi) {
        list.push({
          module: m,
          axis: 'Y-Axis',
          mapping: m.secondaryMidi,
          isSecondary: true,
        });
      }
    });

    return list.filter((r) => {
      const matchQ =
        !search.trim() ||
        r.module.label.toLowerCase().includes(search.toLowerCase()) ||
        r.module.type.toLowerCase().includes(search.toLowerCase());
      const matchCh =
        channelFilter === 'all' || r.mapping.channel === Number(channelFilter);
      return matchQ && matchCh;
    });
  }, [routableModules, search, channelFilter]);

  const updateRowMapping = (
    moduleId: string,
    isSecondary: boolean,
    patch: Partial<MidiMapping>
  ) => {
    onUpdateModule(moduleId, (prev) => {
      if (isSecondary && prev.secondaryMidi) {
        return { ...prev, secondaryMidi: { ...prev.secondaryMidi, ...patch } };
      }
      return { ...prev, midi: { ...prev.midi, ...patch } };
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--pg-canvas)' }}>
      <div
        className="px-6 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0"
        style={{ backgroundColor: 'var(--pg-surface)', borderBottom: '1px solid var(--pg-border)' }}
      >
        <div>
          <h1 className="text-base font-semibold" style={{ color: 'var(--pg-text)' }}>
            MIDI Routing Patchbay
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--pg-text-muted)' }}>
            Configure MIDI channels, CC/Note assignments, scaling bounds, and response curves across every controller in your rig.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--pg-text-dim)' }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search modules..."
              className="pl-8 pr-3 py-1.5 rounded text-xs outline-none"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            />
          </div>

          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded text-xs font-mono outline-none"
            style={{
              backgroundColor: 'var(--pg-canvas)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-text)',
            }}
          >
            <option value="all">All Channels</option>
            {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
              <option key={ch} value={ch}>
                Channel {ch}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {rows.length === 0 ? (
          <div
            className="rounded-md p-10 text-center text-sm"
            style={{
              backgroundColor: 'var(--pg-surface)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-text-muted)',
            }}
          >
            No routable controllers match your filter. Add knobs, faders, pads, or keyboards on the Surface Canvas.
          </div>
        ) : (
          <div
            className="rounded-md overflow-hidden"
            style={{
              backgroundColor: 'var(--pg-surface)',
              border: '1px solid var(--pg-border)',
            }}
          >
            <table className="w-full text-left border-collapse">
              <thead>
                <tr
                  className="text-[11px] font-semibold"
                  style={{
                    backgroundColor: 'var(--pg-panel)',
                    color: 'var(--pg-text-muted)',
                    borderBottom: '1px solid var(--pg-border)',
                  }}
                >
                  <th className="py-2.5 px-3">Active</th>
                  <th className="py-2.5 px-3">Controller</th>
                  <th className="py-2.5 px-3">Axis</th>
                  <th className="py-2.5 px-3">Channel</th>
                  <th className="py-2.5 px-3">Message</th>
                  <th className="py-2.5 px-3 text-right">CC / Note</th>
                  <th className="py-2.5 px-3 text-right">Min</th>
                  <th className="py-2.5 px-3 text-right">Max</th>
                  <th className="py-2.5 px-3">Curve</th>
                  <th className="py-2.5 px-3">Internal Synth</th>
                  <th className="py-2.5 px-3 text-right">Test</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {rows.map(({ module, axis, mapping, isSecondary }) => {
                  const conflictKey = `${mapping.channel}:${mapping.messageType}:${mapping.ccNumber}`;
                  const hasConflict = mapping.enabled && conflictKeys.has(conflictKey);
                  const accentHex = resolveAccentHex(module.accent, palette);

                  return (
                    <tr
                      key={`${module.id}-${axis}`}
                      style={{ borderBottom: '1px solid var(--pg-border)' }}
                    >
                      <td className="py-2 px-3">
                        <input
                          type="checkbox"
                          checked={mapping.enabled}
                          onChange={(e) =>
                            updateRowMapping(module.id, isSecondary, {
                              enabled: e.target.checked,
                            })
                          }
                        />
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: accentHex }}
                          />
                          <span className="font-medium" style={{ color: 'var(--pg-text)' }}>
                            {module.label}
                          </span>
                          <span className="text-[11px] font-mono" style={{ color: 'var(--pg-text-dim)' }}>
                            {module.type}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px]" style={{ color: 'var(--pg-text-muted)' }}>
                        {axis}
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={mapping.channel}
                          onChange={(e) =>
                            updateRowMapping(module.id, isSecondary, {
                              channel: Number(e.target.value),
                            })
                          }
                          className="px-2 py-1 rounded text-xs font-mono outline-none"
                          style={{
                            backgroundColor: 'var(--pg-canvas)',
                            border: '1px solid var(--pg-border)',
                            color: 'var(--pg-text)',
                          }}
                        >
                          {Array.from({ length: 16 }, (_, i) => i + 1).map((ch) => (
                            <option key={ch} value={ch}>
                              Ch {ch}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={mapping.messageType}
                          onChange={(e) =>
                            updateRowMapping(module.id, isSecondary, {
                              messageType: e.target.value as MidiMessageType,
                            })
                          }
                          className="px-2 py-1 rounded text-xs outline-none"
                          style={{
                            backgroundColor: 'var(--pg-canvas)',
                            border: '1px solid var(--pg-border)',
                            color: 'var(--pg-text)',
                          }}
                        >
                          <option value="cc">CC</option>
                          <option value="note">Note</option>
                          <option value="pitchbend">Pitch Bend</option>
                          <option value="program">Program</option>
                        </select>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {hasConflict && (
                            <span
                              title="Duplicate channel & CC/Note assignment"
                              className="inline-flex items-center gap-0.5 text-[10px] font-medium"
                              style={{ color: 'var(--pg-primary)' }}
                            >
                              <AlertTriangle size={12} />
                            </span>
                          )}
                          <input
                            type="number"
                            min={0}
                            max={127}
                            value={mapping.ccNumber}
                            onChange={(e) =>
                              updateRowMapping(module.id, isSecondary, {
                                ccNumber: Math.max(0, Math.min(127, Number(e.target.value) || 0)),
                              })
                            }
                            className="w-14 px-2 py-1 rounded text-xs font-mono text-right outline-none"
                            style={{
                              backgroundColor: 'var(--pg-canvas)',
                              border: `1px solid ${hasConflict ? 'var(--pg-primary)' : 'var(--pg-border)'}`,
                              color: 'var(--pg-text)',
                            }}
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min={0}
                          max={127}
                          value={mapping.minValue}
                          onChange={(e) =>
                            updateRowMapping(module.id, isSecondary, {
                              minValue: Math.max(0, Math.min(127, Number(e.target.value) || 0)),
                            })
                          }
                          className="w-14 px-2 py-1 rounded text-xs font-mono text-right outline-none"
                          style={{
                            backgroundColor: 'var(--pg-canvas)',
                            border: '1px solid var(--pg-border)',
                            color: 'var(--pg-text)',
                          }}
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min={0}
                          max={127}
                          value={mapping.maxValue}
                          onChange={(e) =>
                            updateRowMapping(module.id, isSecondary, {
                              maxValue: Math.max(0, Math.min(127, Number(e.target.value) || 0)),
                            })
                          }
                          className="w-14 px-2 py-1 rounded text-xs font-mono text-right outline-none"
                          style={{
                            backgroundColor: 'var(--pg-canvas)',
                            border: '1px solid var(--pg-border)',
                            color: 'var(--pg-text)',
                          }}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={mapping.curve}
                          onChange={(e) =>
                            updateRowMapping(module.id, isSecondary, {
                              curve: e.target.value as MidiCurve,
                            })
                          }
                          className="px-2 py-1 rounded text-xs outline-none"
                          style={{
                            backgroundColor: 'var(--pg-canvas)',
                            border: '1px solid var(--pg-border)',
                            color: 'var(--pg-text)',
                          }}
                        >
                          <option value="linear">Linear</option>
                          <option value="exponential">Exp</option>
                          <option value="logarithmic">Log</option>
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={mapping.synthTarget}
                          onChange={(e) =>
                            updateRowMapping(module.id, isSecondary, {
                              synthTarget: e.target.value as SynthParamTarget,
                            })
                          }
                          className="px-2 py-1 rounded text-xs outline-none max-w-[155px]"
                          style={{
                            backgroundColor: 'var(--pg-canvas)',
                            border: '1px solid var(--pg-border)',
                            color: 'var(--pg-text)',
                          }}
                        >
                          {SYNTH_TARGET_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            midiEngine.sendMappedControl(
                              `${module.label} (${axis})`,
                              mapping,
                              0.75
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap"
                          style={{
                            backgroundColor: 'var(--pg-panel)',
                            border: '1px solid var(--pg-border)',
                            color: 'var(--pg-text)',
                          }}
                        >
                          <Send size={11} />
                          <span>Ping</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
