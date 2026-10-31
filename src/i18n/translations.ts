/**
 * Translation strings (i18n).
 *
 * English is the source of truth and ships as the default locale, so the app
 * works without a provider and every dictionary is forced to stay complete.
 * Add new locales by appending a `{ ...en }`-shaped object to `dictionaries`.
 */

export const en = {
  common: {
    close: 'Close',
  },

  player: {
    play: 'Play',
    playbackError: 'This track could not play. Retry or choose the next track.',
    retry: 'Retry',
    nextTrack: 'Next track',
    pause: 'Pause',
    backToStart: 'Go to start',
    skipToEnd: 'Go to end',
    backSeconds: 'Go back {seconds} seconds',
    forwardSeconds: 'Go forward {seconds} seconds',
    backSecondsShort: 'Back {seconds}s',
    forwardSecondsShort: 'Forward {seconds}s',
  },

  actions: {
    playlist: 'Playlist',
    settings: 'Settings',
    more: 'More',
  },

  nowPlaying: {
    noTrack: 'No track selected',
    addMusic: 'Add an MP3 file to get started',
    mono: 'Mono',
    stereo: 'Stereo',
  },

  waveform: {
    ariaLabel: 'Waveform — use arrow keys to seek',
    loading: 'Loading waveform…',
    unavailable: 'Waveform unavailable',
    noClips: 'No clips detected — lower the Silence threshold in Settings.',
    splittable: 'Splittable',
  },

  playlist: {
    title: 'Playlist ({count})',
    addTracks: 'Add audio files',
    close: 'Close playlist',
  },

  trackList: {
    empty: 'No tracks yet',
    hint: 'Use the button above to add audio files',
    removeTrack: 'Remove track',
  },

  emptyState: {
    title: 'Add an audio file to get started',
    subtitle: 'Choose audio files from your device.',
    addFiles: 'Add audio files',
  },

  reps: {
    title: 'Number of times a clip repeats when you click it',
    label: 'Repeats:',
    decrease: 'Decrease repeats',
    decreaseHint: 'Repeat each clip fewer times',
    increase: 'Increase repeats',
    increaseHint: 'Repeat each clip more times',
  },

  merge: {
    increaseGap: 'Merge more clips',
    increaseHint: 'Allow longer pauses between clips',
    decreaseGap: 'Merge fewer clips',
    decreaseHint: 'Only merge clips with shorter pauses',
    bubbleTitle: 'Clips with pauses shorter than this are joined together',
    rangeTitle: 'Clips less than {gap}s apart are joined together',
    clipCount: '{count} clip',
    clipCountPlural: '{count} clips',
  },

  viewFlip: {
    toStacked: 'Switch to stacked view',
    toSingle: 'Switch to single-row view',
    stacked: 'Stacked view',
    single: 'Single-row view',
  },

  settings: {
    title: 'Settings',
    close: 'Close settings',
    sectionsLabel: 'Settings sections',

    tabAppearance: 'Appearance',
    tabPlayback: 'Playback',
    tabClips: 'Clip detection',

    theme: 'Theme',
    language: 'Language',

    waveformView: 'Waveform view',
    singleRow: 'Single row',
    stacked: 'Stacked',
    singleRowHint:
      'Show the waveform in one scrollable row that follows playback.',

    skipBy: 'Skip forward or back by',

    repeatsPerClip: 'Repeats per clip',
    repeatsHint: 'Choose how many times a clip repeats when you click it.',

    loopPlaylist: 'Loop playback',
    loopPlaylistHint:
      'When a track ends, continue with the next track in the playlist. Turn off to stop at the end of the track.',

    showAdvanced: 'Show advanced controls',
    showAdvancedHint:
      'Show quick controls for merging clips and changing repeats below the waveform.',

    silenceThreshold: 'Silence sensitivity',
    silenceHint:
      'Controls how quiet the audio needs to be before it is treated as a pause. Lower values detect only quieter pauses.',

    analysisDetail: 'Detection precision',
    analysisHint:
      'Smaller values find more precise split points but may take slightly longer to process.',

    minClipLength: 'Minimum clip length',
    minClipLengthHint:
      'Shorter detected segments join their nearest neighbor before playback padding. An isolated segment below this length is omitted. Manual splits use the same minimum.',

    mergeScope: 'Merge scope',
    mergeScopeGlobal: 'Whole track',
    mergeScopeClip: 'Selected clip',
    mergeScopeHint:
      'Choose whether merging and splitting applies to every clip or only to the selected one.',
    mergeScopeGlobalHint: 'One merge gap regroups every clip in the track.',
    mergeScopeClipHint:
      'Merging and splitting only changes the clip you picked.',

    resetAll: 'Reset all settings',
    changesLive: 'Changes apply instantly and are saved automatically',
  },

  themes: {
    system: 'System',
    dark: 'Slate',
    light: 'Mist',
    midnight: 'Midnight',
    paper: 'Sky',
    nova: 'Nova',
    rose: 'Lilac',
    qinghua: 'Qinghua',
    yingluo: 'Yingluo',
    norge: 'Norway',
  },

  app: {
    skippedNonMp3:
      'Skipped {count} file because only supported audio formats are accepted.',
    skippedNonMp3Plural:
      'Skipped {count} files because only supported audio formats are accepted.',
    listeningLoopIcon: 'Listening loop',
  },

  errorBoundary: {
    crashed: 'Something went wrong',
  },
};

export const no: Messages = {
  common: {
    close: 'Lukk',
  },

  player: {
    playbackError:
      'Sporet kunne ikke spilles. Prøv igjen eller velg neste spor.',
    retry: 'Prøv igjen',
    nextTrack: 'Neste spor',
    play: 'Spill av',
    pause: 'Pause',
    backToStart: 'G\u00e5 til start',
    skipToEnd: 'G\u00e5 til slutt',
    backSeconds: 'G\u00e5 tilbake {seconds} sekunder',
    forwardSeconds: 'G\u00e5 fremover {seconds} sekunder',
    backSecondsShort: 'Tilbake {seconds}s',
    forwardSecondsShort: 'Fremover {seconds}s',
  },

  actions: {
    playlist: 'Avspillingsliste',
    settings: 'Innstillinger',
    more: 'Mer',
  },

  nowPlaying: {
    noTrack: 'Ingen l\u00e5t valgt',
    addMusic: 'Legg til en lydfil for \u00e5 komme i gang',
    mono: 'Mono',
    stereo: 'Stereo',
  },

  waveform: {
    ariaLabel: 'B\u00f8lgjeform – bruk piltastene for \u00e5 spole',
    loading: 'Laster b\u00f8lgjeform\u2026',
    unavailable: 'B\u00f8lgjeform utilgjengelig',
    noClips: 'Ingen klipp funnet – senk Stillhetsterskelen i innstillingene.',
    splittable: 'Kan splittes',
  },

  playlist: {
    title: 'Avspillingsliste ({count})',
    addTracks: 'Legg til lydfiler',
    close: 'Lukk avspillingsliste',
  },

  trackList: {
    empty: 'Ingen l\u00e5ter enn\u00e5',
    hint: 'Bruk knappen over til \u00e5 legge til lydfiler',
    removeTrack: 'Fjern l\u00e5t',
  },

  emptyState: {
    title: 'Legg til en lydfil for \u00e5 komme i gang',
    subtitle: 'Velg lydfiler fra enheten din.',
    addFiles: 'Legg til lydfiler',
  },

  reps: {
    title: 'Antall ganger et klipp repeteres n\u00e5r du klikker p\u00e5 det',
    label: 'Repetisjoner:',
    decrease: 'Reduser repetisjoner',
    decreaseHint: 'Repeter hvert klipp f\u00e6rre ganger',
    increase: '\u00d8k repetisjoner',
    increaseHint: 'Repeter hvert klipp flere ganger',
  },

  merge: {
    increaseGap: 'Sl\u00e5 sammen flere klipp',
    increaseHint: 'Tillat lenger pauser mellom klipp',
    decreaseGap: 'Sl\u00e5 sammen f\u00e6rre klipp',
    decreaseHint: 'Bare sl\u00e5 sammen klipp med kortere pauser',
    bubbleTitle: 'Klipp med pauser kortere enn denne sl\u00e5s sammen',
    rangeTitle: 'Klipp mindre enn {gap}s fra hverandre sl\u00e5s sammen',
    clipCount: '{count} klipp',
    clipCountPlural: '{count} klipp',
  },

  viewFlip: {
    toStacked: 'Bytt til stakkvis visning',
    toSingle: 'Bytt til enkelt-radvisning',
    stacked: 'Stakkvis visning',
    single: 'Enkelt-radvisning',
  },

  settings: {
    title: 'Innstillinger',
    close: 'Lukk innstillinger',
    sectionsLabel: 'Innstillingsseksjoner',

    tabAppearance: 'Utseende',
    tabPlayback: 'Avspilling',
    tabClips: 'Klippdeteksjon',

    theme: 'Tema',
    language: 'Spr\u00e5k',

    waveformView: 'B\u00f8lgevisning',
    singleRow: 'Enkel rad',
    stacked: 'Stakkvis',
    singleRowHint:
      'Vis b\u00f8lgen i en scrollbar rad som f\u00f8lger avspilling.',

    skipBy: 'Hopp frem eller tilbake med',

    repeatsPerClip: 'Repetisjoner per klipp',
    repeatsHint:
      'Velg hvor mange ganger et klipp repeteres n\u00e5r du klikker p\u00e5 det.',

    loopPlaylist: 'Gjenta avspilling',
    loopPlaylistHint:
      'N\u00e5r et spor er ferdig, fortsett med neste spor i spillelisten. Sl\u00e5 av for \u00e5 stoppe p\u00e5 slutten av sporet.',

    showAdvanced: 'Vis avanserte kontroller',
    showAdvancedHint:
      'Vis hurtigkontroller for \u00e5 sl\u00e5 sammen klipp og endre repetisjoner under b\u00f8lgen.',

    silenceThreshold: 'Stilleterskel',
    silenceHint:
      'Styrer hvor stille lyd m\u00e5 v\u00e6re f\u00f8r den behandles som en pause. Lavere verdier oppdager bare stille pauser.',

    analysisDetail: 'Deteksjonspresisjon',
    analysisHint:
      'Mindre verdier finner mer presise delpunkter men kan ta litt lenger \u00e5 prosessere.',

    minClipLength: 'Minste klipplengde',
    minClipLengthHint:
      'Kortere segmenter slås sammen med nærmeste nabo før avspillingsmargin legges til. Et isolert segment under grensen utelates. Manuell deling bruker samme grense.',

    mergeScope: 'Omfang for sl\u00e5ing sammen',
    mergeScopeGlobal: 'Hele sporet',
    mergeScopeClip: 'Valgt klipp',
    mergeScopeHint:
      'Velg om sl\u00e5ing sammen og deling gjelder alle klipp eller bare det valgte.',
    mergeScopeGlobalHint:
      'En sammensl\u00e5ingsgap grupperer hvert klipp i sporet.',
    mergeScopeClipHint:
      'Sl\u00e5ing sammen og deling p\u00e5virker bare det klippet du valgte.',

    resetAll: 'Nullstill alle innstillinger',
    changesLive: 'Endringer trer i kraft umiddelbart og lagres automatisk',
  },

  themes: {
    system: 'System',
    dark: 'Skifer',
    light: 'T\u00e5ke',
    midnight: 'Midnatt',
    paper: 'Himmel',
    nova: 'Nova',
    rose: 'Lysrosa',
    qinghua: 'Qinghua',
    yingluo: 'Yingluo',
    norge: 'Norge',
  },

  app: {
    skippedNonMp3:
      'Hoppet over {count} fil fordi bare støttede lydformater aksepteres.',
    skippedNonMp3Plural:
      'Hoppet over {count} filer fordi bare støttede lydformater aksepteres.',
    listeningLoopIcon: 'Lytte\u00f8kke',
  },

  errorBoundary: {
    crashed: 'Noe gikk galt',
  },
};

export const zh: Messages = {
  common: {
    close: '关闭',
  },

  player: {
    playbackError: '无法播放此音轨。请重试或选择下一首。',
    retry: '重试',
    nextTrack: '下一首',
    play: '播放',
    pause: '暂停',
    backToStart: '回到开头',
    skipToEnd: '跳到结尾',
    backSeconds: '后退 {seconds} 秒',
    forwardSeconds: '前进 {seconds} 秒',
    backSecondsShort: '后退 {seconds}秒',
    forwardSecondsShort: '前进 {seconds}秒',
  },

  actions: {
    playlist: '播放列表',
    settings: '设置',
    more: '更多',
  },

  nowPlaying: {
    noTrack: '未选择音频',
    addMusic: '添加音频文件开始使用',
    mono: '单声道',
    stereo: '立体声',
  },

  waveform: {
    ariaLabel: '波形图 — 使用方向键定位',
    loading: '正在加载波形…',
    unavailable: '波形不可用',
    noClips: '未检测到片段 — 请在设置中降低静音阈值。',
    splittable: '可拆分',
  },

  playlist: {
    title: '播放列表（{count}）',
    addTracks: '添加音频',
    close: '关闭播放列表',
  },

  trackList: {
    empty: '还没有添加音频',
    hint: '使用上方按钮添加音频文件',
    removeTrack: '移除音频',
  },

  emptyState: {
    title: '添加音频文件开始使用',
    subtitle: '从设备中选择音频文件。',
    addFiles: '添加音频文件',
  },

  reps: {
    title: '点击片段后重复播放的次数',
    label: '重复次数：',
    decrease: '减少重复次数',
    decreaseHint: '减少每个片段的重复播放次数',
    increase: '增加重复次数',
    increaseHint: '增加每个片段的重复播放次数',
  },

  merge: {
    increaseGap: '合并更多片段',
    increaseHint: '允许片段之间有更长的停顿',
    decreaseGap: '减少片段合并',
    decreaseHint: '只合并停顿较短的片段',
    bubbleTitle: '停顿时间短于此值的片段将自动合并',
    rangeTitle: '间隔少于 {gap} 秒的片段将自动合并',
    clipCount: '{count} 个片段',
    clipCountPlural: '{count} 个片段',
  },

  viewFlip: {
    toStacked: '切换到多行视图',
    toSingle: '切换到单行视图',
    stacked: '多行视图',
    single: '单行视图',
  },

  settings: {
    title: '设置',
    close: '关闭设置',
    sectionsLabel: '设置分类',

    tabAppearance: '外观',
    tabPlayback: '播放',
    tabClips: '片段检测',

    theme: '主题',
    language: '语言',

    waveformView: '波形显示',
    singleRow: '单行',
    stacked: '多行',
    singleRowHint: '在一行中显示完整波形，并在播放时自动跟随当前位置。',

    skipBy: '快进或后退',

    repeatsPerClip: '片段重复次数',
    repeatsHint: '设置点击片段后自动重复播放的次数。',

    loopPlaylist: '循环播放',
    loopPlaylistHint:
      '一首结束后自动播放列表中的下一首；关闭后将在曲目结尾停止。',

    showAdvanced: '显示高级控制',
    showAdvancedHint: '在波形下方显示片段合并和重复次数的快捷控制。',

    silenceThreshold: '静音灵敏度',
    silenceHint:
      '控制声音需要多安静才会被识别为停顿。数值越低，只会识别更安静的停顿。',

    analysisDetail: '分段精度',
    analysisHint: '数值越小，分段位置越精确，但处理时间可能稍长。',

    minClipLength: '最短片段长度',
    minClipLengthHint:
      '较短的片段会在添加播放留白前与最近的相邻片段合并。无法达到最短时长的孤立片段将被忽略，手动拆分也使用此限制。',

    mergeScope: '合并范围',
    mergeScopeGlobal: '整个音轨',
    mergeScopeClip: '选中的片段',
    mergeScopeHint: '选择合并和拆分是应用于所有片段，还是仅应用于选中的片段。',
    mergeScopeGlobalHint: '一个合并间隔会重新分组音轨中的所有片段。',
    mergeScopeClipHint: '合并和拆分只改变你选择的片段。',

    resetAll: '恢复默认设置',
    changesLive: '修改立即生效并自动保存',
  },

  themes: {
    system: '系统',
    dark: '岩灰',
    light: '薄雾',
    midnight: '午夜',
    paper: '晴空',
    nova: '星辉',
    rose: '丁香',
    qinghua: '青花瓷',
    yingluo: '璎珞',
    norge: '挪威',
  },

  app: {
    skippedNonMp3: '已跳过 {count} 个文件，目前仅支持常见音频格式。',
    skippedNonMp3Plural: '已跳过 {count} 个文件，目前仅支持常见音频格式。',
    listeningLoopIcon: '循环聆听',
  },

  errorBoundary: {
    crashed: '出现了一些问题',
  },
};

/** Recursively turns `as const` leaf literals into plain `string`s. */
export type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

/** Message shape any locale must satisfy (English keys, string leaves). */
export type Messages = DeepStringify<typeof en>;

/** Recursively builds a dot-path key union, e.g. "settings.tabPlayback". */
export type TranslationKey = {
  [K in keyof Messages]: Messages[K] extends string
    ? K extends string
      ? K
      : never
    : K extends string
      ? `${K}.${DeepKeys<Messages[K]>}`
      : never;
}[keyof Messages];

type DeepKeys<T> = T extends string
  ? never
  : {
      [K in keyof T]-?: K extends string
        ? T[K] extends string
          ? K
          : `${K}.${DeepKeys<T[K]>}`
        : never;
    }[keyof T];

export type TranslationParams = Record<string, string | number>;

const dictionaries: Record<string, Messages> = {en, zh, no};

export type LocaleId = keyof typeof dictionaries;

export const LOCALE_IDS = Object.keys(dictionaries) as LocaleId[];

export function isLocale(value: unknown): value is LocaleId {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(dictionaries, value)
  );
}

export function dictionaryFor(locale: string): Messages {
  return dictionaries[locale] ?? en;
}

/**
 * Resolves a dot-path key against a message object and interpolates
 * `{name}` params. Falls back to the key itself when missing.
 */
export function translate(
  messages: Messages,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  let value: unknown = messages;
  for (const part of key.split('.')) {
    if (typeof value !== 'object' || value === null) break;
    value = (value as Record<string, unknown>)[part];
  }
  if (typeof value !== 'string') {
    if (import.meta.env.DEV)
      console.warn(`[i18n] missing translation for "${key}"`);
    return key;
  }
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : match,
  );
}
