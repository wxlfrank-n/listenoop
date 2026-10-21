/**
 * Settings panel overlay.
 *
 * Settings are grouped into domain sections, switched with tabs (Appearance /
 * Playback / Clip detection). Every numeric option uses the same slider field:
 * value readout on the right, slider in the middle with min/max captions
 * underneath, and quick presets as subtle ghost chips below. Two-option
 * choices (waveform view, merge scope) use the same segmented pill group, and
 * on/off options use the same switch. Ranges live in `CONFIG_RANGES`; values
 * are clamped to stay valid.
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import {useConfig} from '../hooks/useConfig';
import {CONFIG_RANGES, DEFAULT_CONFIG} from '../store/configSlice';
import {THEMES, THEME_IDS, type ThemeId} from '../themes';
import {LanguageSelect} from './LanguageSelect';
import {useT, type TranslationKey} from '../i18n';
import CloseIcon from '../assets/icons/close.svg?react';
import InfoIcon from '../assets/icons/info.svg?react';
import './Settings.css';

interface SettingsProps {
  onClose: () => void;
}

const SETTINGS_TABS = [{id: 'theme'}, {id: 'playback'}, {id: 'clips'}] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

const TAB_LABEL_KEYS: Record<SettingsTabId, TranslationKey> = {
  theme: 'settings.tabAppearance',
  playback: 'settings.tabPlayback',
  clips: 'settings.tabClips',
};

const THEME_LABEL_KEYS: Record<ThemeId, TranslationKey> = {
  system: 'themes.system',
  dark: 'themes.dark',
  light: 'themes.light',
  midnight: 'themes.midnight',
  paper: 'themes.paper',
  nova: 'themes.nova',
  rose: 'themes.rose',
  qinghua: 'themes.qinghua',
  yingluo: 'themes.yingluo',
  norge: 'themes.norge',
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

interface SliderSettingProps {
  label: string;
  hint?: string;
  presets: number[];
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}

function SliderSetting({
  label,
  hint,
  presets,
  value,
  min,
  max,
  step,
  unit = '',
  onChange,
}: SliderSettingProps) {
  const display = clamp(value, min, max);
  return (
    <div className="settings-field">
      <div className="settings-field-head">
        <label className="settings-label">{label}</label>
        <output className="settings-value">
          {display}
          {unit}
        </output>
      </div>
      {hint && <p className="settings-hint">{hint}</p>}
      <input
        type="range"
        className="settings-slider"
        min={min}
        max={max}
        step={step}
        value={display}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
      <div className="settings-range-captions">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
      <div className="settings-row settings-presets">
        {presets.map(val => (
          <button
            key={val}
            className={`settings-chip settings-chip--preset ${display === val ? 'settings-chip--active' : ''}`}
            onClick={() => onChange(val)}
          >
            {val}
            {unit}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SegmentedSettingProps<T extends string> {
  label: string;
  hint?: string;
  options: {value: T; label: string}[];
  value: T;
  onChange: (v: T) => void;
}

function SegmentedSetting<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: SegmentedSettingProps<T>) {
  return (
    <div className="settings-field">
      <div className="settings-field-head">
        <label className="settings-label">{label}</label>
      </div>
      {hint && <p className="settings-hint">{hint}</p>}
      <div className="settings-segmented" role="group" aria-label={label}>
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            className={`settings-segmented__option ${value === opt.value ? 'settings-segmented__option--active' : ''}`}
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThemeCardPreview({theme, label}: {theme: ThemeId; label: string}) {
  if (theme === 'system') {
    // No static palette of its own: preview both backing halves, mirroring
    // the native system swatch (Slate left, Mist right).
    return (
      <>
        <span
          className="theme-card__swatch"
          style={{
            background: `linear-gradient(to right, ${THEMES.dark.bgPrimary} 50%, ${THEMES.light.bgPrimary} 50%)`,
          }}
          aria-hidden="true"
        >
          <span
            className="theme-card__dot"
            style={{background: THEMES.dark.accent}}
          />
        </span>
        <span className="theme-card__label">{label}</span>
      </>
    );
  }
  const t = THEMES[theme];
  return (
    <>
      <span
        className="theme-card__swatch"
        style={{background: t.bgPrimary}}
        aria-hidden="true"
      >
        <span className="theme-card__dot" style={{background: t.accent}} />
      </span>
      <span className="theme-card__label">{label}</span>
    </>
  );
}

function AppearanceTab() {
  const {config, updateConfig} = useConfig();
  const t = useT();
  return (
    <>
      <div className="settings-field">
        <div className="settings-field-head">
          <label id="theme-label" className="settings-label">
            {t('settings.theme')}
          </label>
        </div>
        <div className="theme-grid" role="group" aria-labelledby="theme-label">
          {THEME_IDS.map(id => (
            <button
              key={id}
              className={`theme-card ${config.theme === id ? 'theme-card--active' : ''}`}
              onClick={() => updateConfig({theme: id})}
              aria-pressed={config.theme === id}
              aria-label={t(THEME_LABEL_KEYS[id])}
            >
              <ThemeCardPreview theme={id} label={t(THEME_LABEL_KEYS[id])} />
            </button>
          ))}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-head">
          <label className="settings-label">{t('settings.language')}</label>
        </div>
        <LanguageSelect
          value={config.language}
          onChange={language => updateConfig({language})}
          label={t('settings.language')}
        />
      </div>
      <SegmentedSetting
        label={t('settings.waveformView')}
        hint={t('settings.singleRowHint')}
        options={[
          {value: 'horizontal', label: t('settings.singleRow')},
          {value: 'stacked', label: t('settings.stacked')},
        ]}
        value={config.waveformView}
        onChange={waveformView => updateConfig({waveformView})}
      />
    </>
  );
}

function PlaybackTab() {
  const {config, updateConfig} = useConfig();
  const t = useT();
  const {skipSeconds, repetitions, showAdvancedControls} = config;
  return (
    <>
      <SliderSetting
        label={t('settings.skipBy')}
        presets={[5, 10, 15, 30]}
        value={skipSeconds}
        min={CONFIG_RANGES.skipSeconds.min}
        max={CONFIG_RANGES.skipSeconds.max}
        step={1}
        unit="s"
        onChange={v => updateConfig({skipSeconds: v})}
      />
      <SliderSetting
        label={t('settings.repeatsPerClip')}
        hint={t('settings.repeatsHint')}
        presets={[1, 2, 3, 4, 5]}
        value={repetitions}
        min={CONFIG_RANGES.repetitions.min}
        max={CONFIG_RANGES.repetitions.max}
        step={1}
        onChange={v => updateConfig({repetitions: v})}
      />
      <div className="settings-field">
        <label className="settings-switch">
          <input
            type="checkbox"
            checked={showAdvancedControls}
            onChange={e =>
              updateConfig({showAdvancedControls: e.target.checked})
            }
          />
          <span className="settings-switch__track" aria-hidden="true">
            <span className="settings-switch__knob" />
          </span>
          <span className="settings-switch__label">
            {t('settings.showAdvanced')}
            <small>{t('settings.showAdvancedHint')}</small>
          </span>
        </label>
      </div>
    </>
  );
}

function ClipDetectionTab() {
  const {config, updateConfig} = useConfig();
  const t = useT();
  const {blockMs, silenceRatio, minClipLength, minSplitPieceSec, mergeScope} =
    config;
  return (
    <>
      <SliderSetting
        label={t('settings.silenceThreshold')}
        hint={t('settings.silenceHint')}
        presets={[0.005, 0.01]}
        value={silenceRatio}
        min={CONFIG_RANGES.silenceRatio.min}
        max={CONFIG_RANGES.silenceRatio.max}
        step={0.005}
        onChange={v => updateConfig({silenceRatio: v})}
      />
      <SliderSetting
        label={t('settings.analysisDetail')}
        hint={t('settings.analysisHint')}
        presets={[6, 12, 24, 48]}
        value={blockMs}
        min={CONFIG_RANGES.blockMs.min}
        max={CONFIG_RANGES.blockMs.max}
        step={1}
        unit="ms"
        onChange={v => updateConfig({blockMs: v})}
      />
      <SliderSetting
        label={t('settings.minClipLength')}
        hint={t('settings.minClipLengthHint')}
        presets={[0.1, 0.2, 0.3, 0.5, 1.0]}
        value={minClipLength}
        min={CONFIG_RANGES.minClipLength.min}
        max={CONFIG_RANGES.minClipLength.max}
        step={0.05}
        unit="s"
        onChange={v => updateConfig({minClipLength: v})}
      />
      <SliderSetting
        label={t('settings.minSplitPiece')}
        hint={t('settings.minSplitPieceHint')}
        presets={[0.05, 0.1, 0.2, 0.3]}
        value={minSplitPieceSec}
        min={CONFIG_RANGES.minSplitPieceSec.min}
        max={CONFIG_RANGES.minSplitPieceSec.max}
        step={0.05}
        unit="s"
        onChange={v => updateConfig({minSplitPieceSec: v})}
      />
      <SegmentedSetting
        label={t('settings.mergeScope')}
        hint={`${t('settings.mergeScopeHint')} ${t(
          mergeScope === 'clip'
            ? 'settings.mergeScopeClipHint'
            : 'settings.mergeScopeGlobalHint',
        )}`}
        options={[
          {value: 'global', label: t('settings.mergeScopeGlobal')},
          {value: 'clip', label: t('settings.mergeScopeClip')},
        ]}
        value={mergeScope}
        onChange={mergeScope => updateConfig({mergeScope})}
      />
    </>
  );
}

export function Settings({onClose}: SettingsProps) {
  const {updateConfig} = useConfig();
  const t = useT();
  const close = useCallback(() => onClose(), [onClose]);
  const [activeTab, setActiveTab] = useState<SettingsTabId>('theme');
  const [showInfo, setShowInfo] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);

  // The note is a disclosure, so an outside press or Escape closes it.
  useEffect(() => {
    if (!showInfo) return;
    const onPointerDown = (event: PointerEvent) => {
      if (infoRef.current?.contains(event.target as Node)) return;
      setShowInfo(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowInfo(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showInfo]);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{t('settings.title')}</h2>
          <button
            className="settings-close"
            onClick={close}
            aria-label={t('settings.close')}
          >
            <CloseIcon width={18} height={18} />
          </button>
        </div>
        <div
          className="settings-tabs"
          role="tablist"
          aria-label={t('settings.sectionsLabel')}
        >
          {SETTINGS_TABS.map(({id}) => (
            <button
              key={id}
              id={`settings-tab-${id}`}
              role="tab"
              className={`settings-tab ${activeTab === id ? 'settings-tab--active' : ''}`}
              aria-selected={activeTab === id}
              aria-controls={`settings-panel-${id}`}
              tabIndex={activeTab === id ? 0 : -1}
              onClick={() => setActiveTab(id)}
            >
              {t(TAB_LABEL_KEYS[id])}
            </button>
          ))}
        </div>
        <div
          id={`settings-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
          className="settings-body"
        >
          {activeTab === 'theme' && <AppearanceTab />}
          {activeTab === 'playback' && <PlaybackTab />}
          {activeTab === 'clips' && <ClipDetectionTab />}
        </div>
        <div className="settings-footer">
          <button
            className="settings-reset"
            onClick={() => updateConfig(DEFAULT_CONFIG)}
          >
            {t('settings.resetAll')}
          </button>
          {/* The autosave note lives behind this toggle: it is reassurance, not
              a control, so it does not deserve a line of the panel. */}
          <div className="settings-info" ref={infoRef}>
            <button
              type="button"
              className={`settings-info-button${showInfo ? ' settings-info-button--open' : ''}`}
              aria-label={t('settings.changesLive')}
              aria-expanded={showInfo}
              onClick={() => setShowInfo(value => !value)}
            >
              <InfoIcon width={18} height={18} />
            </button>
            {showInfo && (
              <span className="settings-info-popover" role="status">
                {t('settings.changesLive')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
