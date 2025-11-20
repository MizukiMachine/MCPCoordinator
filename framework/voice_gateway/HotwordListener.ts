const DEFAULT_HOTWORD_TIMEOUT_MS = 8000;
const HOTWORD_PREFIXES = ['hey', 'ﾍｲ', 'ヘイ', 'へい', 'ねえ'];
const HOTWORD_DELIMITER_PATTERN = '[\\s,、。!！?？:：;；-]*';
const LEADING_PUNCTUATION = /^[\s,、。!！?？:：;；-]+/u;

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

export interface HotwordDetection {
  scenarioKey: string;
  itemId: string;
  transcript: string;
  stage: 'delta' | 'completed';
}

interface AliasMatcher {
  scenarioKey: string;
  regexp: RegExp;
}

export interface HotwordListenerOptions {
  dictionary: HotwordDictionary;
  reminderTimeoutMs?: number;
  onMatch: (match: HotwordMatch) => void | Promise<void>;
  onDetection?: (payload: HotwordDetection) => void | Promise<void>;
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
  private readonly onDetection?: HotwordListenerOptions['onDetection'];
  private readonly onInvalidTranscript?: HotwordListenerOptions['onInvalidTranscript'];
  private readonly onTimeout?: HotwordListenerOptions['onTimeout'];

  private lastHotwordAt: number | null = null;
  private reminderSentAt: number | null = null;
  private readonly partialTranscripts = new Map<string, string>();
  private readonly detectedItems = new Set<string>();

  constructor(options: HotwordListenerOptions) {
    this.timeoutMs = Math.max(options.reminderTimeoutMs ?? DEFAULT_HOTWORD_TIMEOUT_MS, 1000);
    this.clock = options.clock ?? (() => Date.now());
    this.onMatch = options.onMatch;
    this.onDetection = options.onDetection;
    this.onInvalidTranscript = options.onInvalidTranscript;
    this.onTimeout = options.onTimeout;
    this.matchers = this.buildMatchers(options.dictionary);
  }

  handleTranscriptionEvent(event: any): boolean {
    if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
      return false;
    }

    if (event.type === 'conversation.item.input_audio_transcription.delta') {
      return this.handleDeltaEvent(event);
    }

    if (event.type !== 'conversation.item.input_audio_transcription.completed') {
      return false;
    }

    const itemId = typeof event.item_id === 'string' ? event.item_id : '';
    const transcript = String(event.transcript ?? '').trim();
    const searchableTranscript = transcript || (this.partialTranscripts.get(itemId) ?? '').trim();
    if (!searchableTranscript) {
      this.cleanupItem(itemId);
      return true;
    }

    const matched = this.findHotwordMatch(searchableTranscript);

    if (matched) {
      const commandText = this.extractCommand(searchableTranscript, matched.consumedLength);
      if (!commandText) {
        this.onInvalidTranscript?.({ itemId, transcript: searchableTranscript });
        this.maybeTriggerTimeout();
        this.cleanupItem(itemId);
        return true;
      }
      this.emitDetection(itemId, matched.scenarioKey, searchableTranscript, 'completed');
      this.lastHotwordAt = null;
      this.reminderSentAt = null;
      void this.onMatch({
        scenarioKey: matched.scenarioKey,
        commandText,
        itemId,
        transcript: searchableTranscript,
      });
      this.cleanupItem(itemId);
      return true;
    }

    this.onInvalidTranscript?.({ itemId, transcript: searchableTranscript });
    this.maybeTriggerTimeout();
    this.cleanupItem(itemId);
    return true;
  }

  private handleDeltaEvent(event: any): boolean {
    const itemId = typeof event.item_id === 'string' ? event.item_id : '';
    if (!itemId) {
      return true;
    }
    const delta = this.extractDeltaText(event);
    if (!delta) {
      return true;
    }
    const nextTranscript = (this.partialTranscripts.get(itemId) ?? '') + delta;
    this.partialTranscripts.set(itemId, nextTranscript);
    const matched = this.findHotwordMatch(nextTranscript.trim());
    if (matched) {
      this.emitDetection(itemId, matched.scenarioKey, nextTranscript, 'delta');
    }
    return true;
  }

  private extractDeltaText(event: any): string {
    if (typeof event.delta === 'string') {
      return event.delta;
    }
    if (Array.isArray(event.delta)) {
      return event.delta.join('');
    }
    if (typeof event.transcript === 'string') {
      return event.transcript;
    }
    return '';
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
          `^\\s*${prefixPattern}${HOTWORD_DELIMITER_PATTERN}(${escapeForRegExp(normalizedAlias)})`,
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

  private emitDetection(
    itemId: string,
    scenarioKey: string,
    transcript: string,
    stage: HotwordDetection['stage'],
  ): void {
    if (!this.onDetection || this.detectedItems.has(itemId)) {
      return;
    }
    this.detectedItems.add(itemId);
    void this.onDetection({ scenarioKey, itemId, transcript, stage });
  }

  private cleanupItem(itemId: string): void {
    if (!itemId) return;
    this.partialTranscripts.delete(itemId);
    this.detectedItems.delete(itemId);
  }
}
