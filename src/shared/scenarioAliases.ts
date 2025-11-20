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
  takuboku: [
    'takuboku',
    '啄木',
    '拓木',
    'たくぼく',
    'たくぼくう',
    'タクボク',
    'タカボク',
    'たかぼく',
    '啄木シナリオ',
  ],
  patricia: [
    'patricia',
    'パトリシア',
    'ぱとりしあ',
    'ﾊﾟﾄﾘｼｱ',
    'パトリ',
    'ぱとり',
  ],
  mark: [
    'mark',
    'マーク',
    'まーく',
    'ﾏｰｸ',
    'markシナリオ',
    'マークシナリオ',
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
