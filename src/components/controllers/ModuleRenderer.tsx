import React from 'react';
import { Copy, GripHorizontal, Link2, Settings2 } from 'lucide-react';
import {
  ComponentLfoConfig,
  ModuleGroup,
  ModuleValues,
  SynthModule,
  ThemePalette,
} from '../../types/synth';
import { resolveAccentHex } from '../../data/themes';
import { KnobModule } from './KnobModule';
import { FaderModule } from './FaderModule';
import { XYPadModule } from './XYPadModule';
import { RibbonModule } from './RibbonModule';
import { DrumPadsModule } from './DrumPadsModule';
import { KeyboardModule } from './KeyboardModule';
import { SequencerModule } from './SequencerModule';
import { AdsrModule } from './AdsrModule';
import { ToggleModule } from './ToggleModule';
import { ButtonModule } from './ButtonModule';
import { OnOffModule } from './OnOffModule';
import { SelectBoxModule } from './SelectBoxModule';
import { MultiSwitchModule } from './MultiSwitchModule';
import { ScopeModule } from './ScopeModule';

interface ModuleRendererProps {
  module: SynthModule;
  group?: ModuleGroup;
  palette: ThemePalette;
  isSelected: boolean;
  isMultiSelected: boolean;
  compactMode: boolean;
  performMode: boolean;
  audioEnabled: boolean;
  bpm: number;
  currentStep: number;
  transportPlaying: boolean;
  modulatedValue?: number;
  onSelect: (shiftKey: boolean) => void;
  onOpenContextMenu: (clientX: number, clientY: number) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onStartMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onStartResize: (e: React.PointerEvent<HTMLDivElement>) => void;
  onValueChange: (values: Partial<ModuleValues>) => void;
  onLfoChange: (lfo: ComponentLfoConfig) => void;
  onTriggerNote: (note: number, velocity: number, isOn: boolean) => void;
  onTriggerDrum: (padIdx: number, note: number, velocity: number, isOn: boolean) => void;
}

export const ModuleRenderer: React.FC<ModuleRendererProps> = ({
  module,
  group,
  palette,
  isSelected,
  isMultiSelected,
  compactMode,
  performMode,
  audioEnabled,
  bpm,
  currentStep,
  transportPlaying,
  modulatedValue,
  onSelect,
  onOpenContextMenu,
  onDelete,
  onDuplicate,
  onStartMove,
  onStartResize,
  onValueChange,
  onLfoChange,
  onTriggerNote,
  onTriggerDrum,
}) => {
  const accentHex = resolveAccentHex(module.accent, palette);
  const pixelW = module.pw ?? module.w * 86;
  const isNarrow = pixelW < 125;
  const isTight = compactMode || Boolean(group?.compact);
  const isMinimalHardware = module.type === 'knob' || module.type === 'fader';

  const activeBorderColor =
    !performMode && isSelected
      ? palette.colors.primary
      : !performMode && isMultiSelected
        ? palette.colors.secondary
        : group
          ? `${resolveAccentHex(group.accent, palette)}88`
          : 'var(--pg-border)';

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(false);
    onOpenContextMenu(e.clientX, e.clientY);
  };

  return (
    <div
      onPointerDown={(e) => {
        if (e.button === 2) return;
        if (!performMode) onSelect(e.shiftKey);
      }}
      onContextMenu={handleContextMenu}
      className="group relative w-full h-full rounded-md transition-colors duration-100"
      style={{
        backgroundColor: 'var(--pg-module)',
        border: `1px solid ${activeBorderColor}`,
        boxShadow:
          !performMode && (isSelected || isMultiSelected)
            ? `0 0 0 1px ${isSelected ? palette.colors.primary : palette.colors.secondary}55`
            : 'none',
      }}
    >
      <div className="w-full h-full rounded-md flex flex-col overflow-hidden">
      {/* Minimal Hardware Mode for Wheel & Slider: no top header bar, just name below */}
      {isMinimalHardware ? (
        <>
          {!performMode && (
            <div className="absolute top-1 right-1 z-10 hidden group-hover:flex items-center gap-0.5 rounded px-1 py-0.5"
              style={{ backgroundColor: 'var(--pg-panel)', border: '1px solid var(--pg-border)' }}
            >
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenContextMenu(e.clientX, e.clientY);
                }}
                title="MIDI Config (Right-Click) · Press Delete/Supr when selected to remove"
                className="p-0.5 rounded hover:opacity-80"
                style={{ color: 'var(--pg-text-muted)' }}
              >
                <Settings2 size={10} />
              </button>
            </div>
          )}

          <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
            {module.type === 'knob' && (
              <KnobModule
                module={module}
                accentHex={accentHex}
                performMode={performMode}
                modulatedValue={modulatedValue}
                onValueChange={onValueChange}
                onLfoChange={onLfoChange}
                onOpenContextMenu={onOpenContextMenu}
                onStartMoveLabel={(e) => {
                  onSelect(e.shiftKey);
                  onStartMove(e);
                }}
              />
            )}
            {module.type === 'fader' && (
              <FaderModule
                module={module}
                accentHex={accentHex}
                performMode={performMode}
                modulatedValue={modulatedValue}
                onValueChange={onValueChange}
                onLfoChange={onLfoChange}
                onOpenContextMenu={onOpenContextMenu}
                onStartMoveLabel={(e) => {
                  onSelect(e.shiftKey);
                  onStartMove(e);
                }}
              />
            )}
          </div>
        </>
      ) : (
        <>
          {/* Standard Header Bar for Pads, Keys, XY, Sequencer, Switches, Scope */}
          <div
            onPointerDown={(e) => {
              if (e.button === 2) return;
              if (!performMode) {
                onSelect(e.shiftKey);
                onStartMove(e);
              }
            }}
            className={`flex items-center justify-between gap-1 shrink-0 ${
              isTight ? 'px-1.5 py-1' : 'px-2 py-1'
            } ${performMode ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
            style={{
              backgroundColor: 'var(--pg-panel)',
              borderBottom: '1px solid var(--pg-border)',
            }}
          >
            <div className="flex items-center gap-1 min-w-0 flex-1">
              {!performMode && !isNarrow && (
                <GripHorizontal
                  size={11}
                  className="shrink-0 opacity-45 group-hover:opacity-100"
                  style={{ color: 'var(--pg-text-muted)' }}
                />
              )}
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: accentHex }}
              />
              <span
                className="text-[11px] font-semibold truncate leading-tight"
                title={module.label}
                style={{ color: 'var(--pg-text)' }}
              >
                {module.label}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {group && !isNarrow && (
                <span
                  title={`Grouped in ${group.name}`}
                  className="inline-flex items-center gap-0.5 text-[9px] font-mono"
                  style={{ color: resolveAccentHex(group.accent, palette) }}
                >
                  <Link2 size={10} />
                </span>
              )}

              {!performMode && (
                <div className="hidden group-hover:flex items-center gap-0.5 ml-0.5">
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenContextMenu(e.clientX, e.clientY);
                    }}
                    title="MIDI Config (Right-Click)"
                    className="p-0.5 rounded hover:opacity-80"
                    style={{ color: 'var(--pg-text-muted)' }}
                  >
                    <Settings2 size={10} />
                  </button>
                  {!isNarrow && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicate();
                      }}
                      title="Duplicate module"
                      className="p-0.5 rounded hover:opacity-80"
                      style={{ color: 'var(--pg-text-muted)' }}
                    >
                      <Copy size={10} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Controller Body */}
          <div
            className={`flex-1 min-h-0 flex items-center justify-center overflow-hidden ${
              isTight ? 'p-1' : 'p-1.5'
            }`}
          >
            {module.type === 'xypad' && (
              <XYPadModule module={module} accentHex={accentHex} onValueChange={onValueChange} />
            )}
            {module.type === 'ribbon' && (
              <RibbonModule module={module} accentHex={accentHex} onValueChange={onValueChange} />
            )}
            {module.type === 'pads' && (
              <DrumPadsModule
                module={module}
                accentHex={accentHex}
                onTriggerDrum={onTriggerDrum}
              />
            )}
            {module.type === 'keyboard' && (
              <KeyboardModule
                module={module}
                accentHex={accentHex}
                onTriggerNote={onTriggerNote}
              />
            )}
            {module.type === 'sequencer' && (
              <SequencerModule
                module={module}
                accentHex={accentHex}
                currentStep={currentStep}
                isPlaying={transportPlaying}
                onValueChange={onValueChange}
              />
            )}
            {module.type === 'adsr' && (
              <AdsrModule
                module={module}
                accentHex={accentHex}
                bpm={bpm}
                onValueChange={onValueChange}
              />
            )}
            {module.type === 'toggle' && (
              <ToggleModule module={module} accentHex={accentHex} onValueChange={onValueChange} />
            )}
            {module.type === 'button' && (
              <ButtonModule
                module={module}
                accentHex={accentHex}
                onValueChange={onValueChange}
                onTriggerNote={onTriggerNote}
              />
            )}
            {module.type === 'onoff' && (
              <OnOffModule module={module} accentHex={accentHex} onValueChange={onValueChange} />
            )}
            {module.type === 'selectbox' && (
              <SelectBoxModule module={module} accentHex={accentHex} onValueChange={onValueChange} />
            )}
            {module.type === 'switch' && (
              <MultiSwitchModule module={module} accentHex={accentHex} onValueChange={onValueChange} />
            )}
            {module.type === 'scope' && (
              <ScopeModule accentHex={accentHex} audioEnabled={audioEnabled} />
            )}
          </div>
        </>
      )}

      {/* Resize Handle (Design Mode only) */}
      {!performMode && (
        <div
          onPointerDown={(e) => {
            if (e.button === 2) return;
            e.stopPropagation();
            onSelect(e.shiftKey);
            onStartResize(e);
          }}
          title="Drag to resize module"
          className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize flex items-end justify-end p-0.5 opacity-30 group-hover:opacity-100 z-10"
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <path
              d="M9 1L1 9M9 5L5 9"
              stroke="var(--pg-text-muted)"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
      </div>
    </div>
  );
};
