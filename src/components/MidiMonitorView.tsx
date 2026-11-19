import React, { useState } from 'react';
import { Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { MidiLogEntry, MidiPortInfo } from '../types/synth';

interface MidiMonitorViewProps {
  logs: MidiLogEntry[];
  inputs: MidiPortInfo[];
  outputs: MidiPortInfo[];
  midiSupported: boolean;
  selectedOutputId: string;
  paused: boolean;
  onSelectOutput: (id: string) => void;
  onTogglePause: () => void;
  onClearLogs: () => void;
  onRefreshMidi: () => void;
}

export const MidiMonitorView: React.FC<MidiMonitorViewProps> = ({
  logs,
  inputs,
  outputs,
  midiSupported,
  selectedOutputId,
  paused,
  onSelectOutput,
  onTogglePause,
  onClearLogs,
  onRefreshMidi,
}) => {
  const [dirFilter, setDirFilter] = useState<'all' | 'out' | 'in'>('all');

  const visibleLogs = logs.filter((entry) =>
    dirFilter === 'all' ? true : entry.direction === dirFilter
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--pg-canvas)' }}>
      {/* Port & Monitor Header */}
      <div
        className="px-6 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0"
        style={{
          backgroundColor: 'var(--pg-surface)',
          borderBottom: '1px solid var(--pg-border)',
        }}
      >
        <div>
          <h1 className="text-base font-semibold" style={{ color: 'var(--pg-text)' }}>
            MIDI Port Routing &amp; Live Monitor
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--pg-text-muted)' }}>
            Inspect outgoing DAW control messages and connected Web MIDI hardware inputs in real time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: 'var(--pg-text-muted)' }}>MIDI Output:</span>
            <select
              value={selectedOutputId}
              onChange={(e) => onSelectOutput(e.target.value)}
              className="px-2.5 py-1.5 rounded text-xs outline-none"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              <option value="virtual-internal">Internal PatchGrid Bus</option>
              {outputs.map((out) => (
                <option key={out.id} value={out.id}>
                  {out.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onRefreshMidi}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-text)',
            }}
          >
            <RefreshCw size={12} />
            <span>Scan Ports</span>
          </button>

          <button
            type="button"
            onClick={onTogglePause}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium"
            style={{
              backgroundColor: paused ? 'var(--pg-primary)' : 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
              color: paused ? 'var(--pg-primary-text)' : 'var(--pg-text)',
            }}
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
            <span>{paused ? 'Resume' : 'Pause'}</span>
          </button>

          <button
            type="button"
            onClick={onClearLogs}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-text-muted)',
            }}
          >
            <Trash2 size={12} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Hardware Port Summary Strip */}
      <div
        className="px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs shrink-0"
        style={{
          backgroundColor: 'var(--pg-panel)',
          borderBottom: '1px solid var(--pg-border)',
          color: 'var(--pg-text-muted)',
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Web MIDI: <strong style={{ color: 'var(--pg-text)' }}>{midiSupported ? 'Available' : 'Virtual Bus Mode'}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Inputs detected: <strong className="font-mono" style={{ color: 'var(--pg-text)' }}>{inputs.length}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Outputs detected: <strong className="font-mono" style={{ color: 'var(--pg-text)' }}>{outputs.length}</strong>
          </span>
        </div>

        <div className="flex items-center gap-1 p-0.5 rounded" style={{ backgroundColor: 'var(--pg-canvas)' }}>
          {(['all', 'out', 'in'] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              onClick={() => setDirFilter(dir)}
              className="px-2.5 py-1 rounded text-[11px] font-medium capitalize"
              style={{
                backgroundColor: dirFilter === dir ? 'var(--pg-surface)' : 'transparent',
                color: dirFilter === dir ? 'var(--pg-text)' : 'var(--pg-text-dim)',
              }}
            >
              {dir === 'all' ? 'All Events' : dir === 'out' ? 'Outgoing' : 'Incoming'}
            </button>
          ))}
        </div>
      </div>

      {/* Event Stream Table */}
      <div className="flex-1 overflow-auto p-6">
        {visibleLogs.length === 0 ? (
          <div
            className="rounded-md p-10 text-center text-xs"
            style={{
              backgroundColor: 'var(--pg-surface)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-text-muted)',
            }}
          >
            No MIDI messages captured yet. Move any knob, fader, XY pad, drum pad, or keyboard on the Surface Canvas to observe live MIDI traffic.
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
                  <th className="py-2 px-3">Timestamp</th>
                  <th className="py-2 px-3">Dir</th>
                  <th className="py-2 px-3">Source / Target</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3 text-right">Ch</th>
                  <th className="py-2 px-3 text-right">Data 1</th>
                  <th className="py-2 px-3 text-right">Data 2</th>
                  <th className="py-2 px-3 text-right">Raw Hex</th>
                </tr>
              </thead>
              <tbody className="text-xs font-mono">
                {visibleLogs.map((entry) => (
                  <tr
                    key={entry.id}
                    style={{ borderBottom: '1px solid var(--pg-border)' }}
                  >
                    <td className="py-1.5 px-3" style={{ color: 'var(--pg-text-dim)' }}>
                      {entry.timestamp}
                    </td>
                    <td
                      className="py-1.5 px-3 font-semibold"
                      style={{
                        color:
                          entry.direction === 'out'
                            ? 'var(--pg-primary)'
                            : 'var(--pg-secondary)',
                      }}
                    >
                      {entry.direction === 'out' ? 'OUT' : 'IN'}
                    </td>
                    <td className="py-1.5 px-3 font-sans" style={{ color: 'var(--pg-text)' }}>
                      {entry.label}
                    </td>
                    <td className="py-1.5 px-3" style={{ color: 'var(--pg-tertiary)' }}>
                      {entry.type}
                    </td>
                    <td className="py-1.5 px-3 text-right" style={{ color: 'var(--pg-text)' }}>
                      {entry.channel}
                    </td>
                    <td className="py-1.5 px-3 text-right" style={{ color: 'var(--pg-text)' }}>
                      {entry.data1}
                    </td>
                    <td className="py-1.5 px-3 text-right" style={{ color: 'var(--pg-text)' }}>
                      {entry.data2}
                    </td>
                    <td className="py-1.5 px-3 text-right" style={{ color: 'var(--pg-text-muted)' }}>
                      {entry.rawHex}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
