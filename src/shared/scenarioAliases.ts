export const scenarioAliasMap: Record<string, string[]> = {
  graffity: ['graffity', 'graffiti', 'グラフィティ', 'グラフィティー', 'グラフティ', 'ぐらふぃてぃ', 'graffityシナリオ'],
  kate: ['kate', 'ケイト', 'ｹｲﾄ', 'けいと', 'kateシナリオ', 'ケイトシナリオ'],
  basho: ['basho', '芭蕉', 'ばしょう', 'バショウ', '芭蕉シナリオ'],
  takuboku: ['takuboku', '啄木', 'たくぼく', 'タクボク', '啄木シナリオ'],
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
