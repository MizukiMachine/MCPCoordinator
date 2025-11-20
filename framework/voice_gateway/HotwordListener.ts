const DEFAULT_HOTWORD_TIMEOUT_MS = 8000;
const HOTWORD_PREFIXES = ['hey', 'ﾍｲ', 'ヘイ'];
const LEADING_PUNCTUATION = /^[\s,、。.]+/u;

export interface HotwordDictionaryEntry {
  scenarioKey: string;
  aliases: string[];
}

export interface HotwordDictionary {
  entries: HotwordDictionaryEntry[];
}

export interface HotwordMatch {
  scenarioKey: string;
  commandText: string;
  itemId: string;
  transcript: string;
}

interface AliasMatcher {
  scenarioKey: string;
  regexp: RegExp;
}

export interface HotwordListenerOptions {
  dictionary: HotwordDictionary;
  reminderTimeoutMs?: number;
  onMatch: (match: HotwordMatch) => void | Promise<void>;
  onInvalidTranscript?: (payload: { itemId: string; transcript: string }) => void;
  onTimeout?: () => void;
  clock?: () => number;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeAlias(alias: string): string | null {
  const trimmed = alias?.trim();
  return trimmed?.length ? trimmed : null;
}

export class HotwordListener {
  private readonly timeoutMs: number;
  private readonly clock: () => number;
  private readonly matchers: AliasMatcher[];
  private readonly onMatch: HotwordListenerOptions['onMatch'];
  private readonly onInvalidTranscript?: HotwordListenerOptions['onInvalidTranscript'];
  private readonly onTimeout?: HotwordListenerOptions['onTimeout'];

  private lastHotwordAt: number | null = null;
  private reminderSentAt: number | null = null;

  constructor(options: HotwordListenerOptions) {
    this.timeoutMs = Math.max(options.reminderTimeoutMs ?? DEFAULT_HOTWORD_TIMEOUT_MS, 1000);
    this.clock = options.clock ?? (() => Date.now());
    this.onMatch = options.onMatch;
    this.onInvalidTranscript = options.onInvalidTranscript;
    this.onTimeout = options.onTimeout;
    this.matchers = this.buildMatchers(options.dictionary);
  }

  handleTranscriptionEvent(event: any): void {
    if (!event || event.type !== 'conversation.item.input_audio_transcription.completed') {
      return;
    }

    const transcript = String(event.transcript ?? '').trim();
    if (!transcript) {
      return;
    }

    const itemId = typeof event.item_id === 'string' ? event.item_id : '';
    const matched = this.findHotwordMatch(transcript);

    if (matched) {
      const commandText = this.extractCommand(transcript, matched.consumedLength);
      if (!commandText) {
        this.onInvalidTranscript?.({ itemId, transcript });
        // Treat as invalid if there is no command body after the hotword.
        this.maybeTriggerTimeout();
        return;
      }
      this.lastHotwordAt = null;
      this.reminderSentAt = null;
      void this.onMatch({
        scenarioKey: matched.scenarioKey,
        commandText,
        itemId,
        transcript,
      });
      return;
    }

    this.onInvalidTranscript?.({ itemId, transcript });
    this.maybeTriggerTimeout();
  }

  private extractCommand(transcript: string, consumedLength: number): string {
    const remainder = transcript.slice(consumedLength).replace(LEADING_PUNCTUATION, '').trim();
    return remainder;
  }

  private buildMatchers(dictionary: HotwordDictionary): AliasMatcher[] {
    const prefixPattern = `(?:${HOTWORD_PREFIXES.map(escapeForRegExp).join('|')})`;
    const matchers: AliasMatcher[] = [];
    for (const entry of dictionary.entries ?? []) {
      for (const alias of entry.aliases ?? []) {
        const normalizedAlias = sanitizeAlias(alias);
        if (!normalizedAlias) continue;
        const regexp = new RegExp(
          `^\\s*${prefixPattern}[\\s,、。]+(${escapeForRegExp(normalizedAlias)})`,
          'iu',
        );
        matchers.push({ scenarioKey: entry.scenarioKey, regexp });
      }
    }
    return matchers;
  }

  private findHotwordMatch(transcript: string): { scenarioKey: string; consumedLength: number } | null {
    for (const matcher of this.matchers) {
      const result = transcript.match(matcher.regexp);
      if (result && typeof result[0] === 'string') {
        return { scenarioKey: matcher.scenarioKey, consumedLength: result[0].length };
      }
    }
    return null;
  }

  private maybeTriggerTimeout(): void {
    const now = this.clock();
    if (this.lastHotwordAt === null) {
      this.lastHotwordAt = now;
      return;
    }
    if (this.reminderSentAt !== null) {
      return;
    }
    if (now - this.lastHotwordAt >= this.timeoutMs) {
      this.reminderSentAt = now;
      this.onTimeout?.();
    }
  }
}
