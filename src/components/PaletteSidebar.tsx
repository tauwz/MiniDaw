import React, { useState } from 'react';
import {
  Activity,
  ChevronDownSquare,
  ChevronLeft,
  CircleDot,
  Disc,
  Grid,
  ListChecks,
  Move,
  Piano,
  Plus,
  Power,
  Search,
  SlidersVertical,
  Sparkles,
  SquareStack,
  ToggleLeft,
  Waves,
} from 'lucide-react';
import { PALETTE_CONTROLLERS } from '../data/presets';
import { ControllerType, PaletteItemDefinition } from '../types/synth';

interface PaletteSidebarProps {
  widthPx?: number;
  onCollapse?: () => void;
  onAddModule: (def: PaletteItemDefinition) => void;
  onDragStartItem: (def: PaletteItemDefinition) => void;
  onDragEndItem: () => void;
}

const ICONS: Record<ControllerType, React.ReactNode> = {
  knob: <Disc size={15} />,
  fader: <SlidersVertical size={15} />,
  xypad: <Move size={15} />,
  ribbon: <Sparkles size={15} />,
  button: <CircleDot size={15} />,
  onoff: <Power size={15} />,
  toggle: <ToggleLeft size={15} />,
  selectbox: <ChevronDownSquare size={15} />,
  switch: <ListChecks size={15} />,
  pads: <Grid size={15} />,
  keyboard: <Piano size={15} />,
  sequencer: <SquareStack size={15} />,
  adsr: <Activity size={15} />,
  scope: <Waves size={15} />,
};

export const PaletteSidebar: React.FC<PaletteSidebarProps> = ({
  widthPx = 260,
  onCollapse,
  onAddModule,
  onDragStartItem,
  onDragEndItem,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');

  const categories = [
    'All',
    'Continuous',
    'Switches & Selectors',
    'Expressive',
    'Triggers & Keys',
    'Sequencing',
    'Visuals',
  ];

  const filtered = PALETTE_CONTROLLERS.filter((item) => {
    const matchesCat = category === 'All' || item.category === category;
    const matchesQ =
      !query.trim() ||
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      item.description.toLowerCase().includes(query.toLowerCase());
    return matchesCat && matchesQ;
  });

  return (
    <aside
      className="shrink-0 flex flex-col h-full overflow-hidden"
      style={{
        width: `${widthPx}px`,
        backgroundColor: 'var(--pg-surface)',
        borderRight: '1px solid var(--pg-border)',
      }}
    >
      <div className="p-3.5 flex flex-col gap-2.5" style={{ borderBottom: '1px solid var(--pg-border)' }}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wide" style={{ color: 'var(--pg-text)' }}>
            Controller Palette
          </h2>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono" style={{ color: 'var(--pg-text-dim)' }}>
              Drag to pane
            </span>
            {onCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                title="Collapse Controller Palette"
                className="p-0.5 rounded hover:bg-white/10"
                style={{ color: 'var(--pg-text-muted)' }}
              >
                <ChevronLeft size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--pg-text-dim)' }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter controllers..."
            className="w-full pl-8 pr-2.5 py-1.5 rounded text-xs outline-none transition-colors"
            style={{
              backgroundColor: 'var(--pg-canvas)',
              border: '1px solid var(--pg-border)',
              color: 'var(--pg-text)',
            }}
          />
        </div>

        <div className="flex flex-wrap gap-1">
          {categories.map((cat) => {
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className="px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: active ? 'var(--pg-primary)' : 'var(--pg-panel)',
                  color: active ? 'var(--pg-primary-text)' : 'var(--pg-text-muted)',
                }}
              >
                {cat === 'Switches & Selectors' ? 'Switches' : cat}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1.5">
        {filtered.map((item) => (
          <div
            key={`${item.type}-${item.name}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-patchgrid-type', item.type);
              e.dataTransfer.setData('application/x-patchgrid-name', item.name);
              e.dataTransfer.effectAllowed = 'copy';
              onDragStartItem(item);
            }}
            onDragEnd={onDragEndItem}
            className="group rounded-md p-2.5 flex items-start gap-2.5 cursor-grab active:cursor-grabbing transition-colors"
            style={{
              backgroundColor: 'var(--pg-panel)',
              border: '1px solid var(--pg-border)',
            }}
          >
            <div
              className="w-7 h-7 rounded flex items-center justify-center shrink-0 mt-0.5"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-primary)',
              }}
            >
              {ICONS[item.type]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold truncate" style={{ color: 'var(--pg-text)' }}>
                  {item.name}
                </span>
                <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--pg-text-dim)' }}>
                  {item.defaultW}×{item.defaultH}
                </span>
              </div>
              <p className="text-[11px] leading-snug mt-0.5 line-clamp-2" style={{ color: 'var(--pg-text-muted)' }}>
                {item.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onAddModule(item)}
              title={`Add ${item.name} to pane`}
              className="p-1 rounded shrink-0 opacity-70 group-hover:opacity-100 transition-opacity"
              style={{
                backgroundColor: 'var(--pg-canvas)',
                border: '1px solid var(--pg-border)',
                color: 'var(--pg-text)',
              }}
            >
              <Plus size={13} />
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-8 text-center text-xs" style={{ color: 'var(--pg-text-dim)' }}>
            No controllers match &ldquo;{query}&rdquo;
          </div>
        )}
      </div>
    </aside>
  );
};
