export const scenarioAliasMap: Record<string, string[]> = {
  graffity: [
    'graffity',
    'graffiti',
    'グラフィティ',
    'グラフィティー',
    'グラフティ',
    'グラフティー',
    'ぐらふぃてぃ',
    'グラビティ', // よくある誤転写
    'ｸﾞﾗﾌｨﾃｨ',
  ],
  kate: ['kate', 'ケイト', 'ｹｲﾄ', 'けいと', 'けーと', 'Kと', 'kateシナリオ', 'ケイトシナリオ'],
  basho: ['basho', '芭蕉', 'ばしょう', 'バショウ', '場所', '芭蕉シナリオ'],
  takuboku: [
    'takuboku',
    '啄木',
    '拓木',
    'たくぼく',
    'たくぼくう',
    'タクボク',
    'タクボクさん',
    '啄木さん',
    '啄木シナリオ',
  ],
};

const aliasLookup = Object.entries(scenarioAliasMap).reduce<Record<string, string>>((acc, [key, aliases]) => {
  aliases.forEach((alias) => {
    const normalized = alias.trim().toLowerCase();
    if (normalized) {
      acc[normalized] = key;
    }
  });
  acc[key] = key;
  return acc;
}, {});

export function normalizeScenarioKey(raw?: string | null): string {
  if (!raw) return raw ?? '';
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  return aliasLookup[lower] ?? aliasLookup[trimmed] ?? lower;
}
