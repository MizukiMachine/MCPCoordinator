type AliasMap = Record<string, string>;

const DEFAULT_ALIASES: AliasMap = {
  'トッティさん': 'remote@graffity.jp',
  '私': 'dev.admin@graffity.jp',
};

/**
 * 環境変数 `CALENDAR_ALIAS_*` を `表示名:email` 形式で読み取り、
 * デフォルトのエイリアスにマージして返す。
 */
export function loadCalendarAliases(env: NodeJS.ProcessEnv = process.env): AliasMap {
  const aliases: AliasMap = { ...DEFAULT_ALIASES };

  Object.entries(env).forEach(([key, value]) => {
    if (!key.startsWith('CALENDAR_ALIAS_') || !value) return;
    const [label, email] = value.split(':');
    if (!label || !email) return;
    aliases[label.trim()] = email.trim();
  });

  return aliases;
}

export function formatCalendarAliasList(aliases: AliasMap): string {
  return Object.entries(aliases)
    .map(([label, email]) => `- 「${label}」→ ${email}`)
    .join('\n');
}
