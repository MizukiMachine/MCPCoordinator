import type { HotwordMatch } from '../../framework/voice_gateway/HotwordListener';
import type { StructuredLogger } from '../../framework/logging/structuredLogger';
import type { VoiceControlHandlers } from '../../src/shared/voiceControl';

export interface ScenarioCommandForwarder {
  replaceTranscriptWithText: (match: HotwordMatch) => Promise<void> | void;
  interruptActiveResponse: () => Promise<void> | void;
}

export interface ScenarioRouterOptions {
  currentScenarioKey: string;
  voiceControl: VoiceControlHandlers;
  forwarder: ScenarioCommandForwarder;
  logger?: Pick<StructuredLogger, 'info' | 'warn' | 'error' | 'debug'>;
  minimumCommandLength?: number;
}

export class ScenarioRouter {
  private currentScenarioKey: string;
  private readonly voiceControl: VoiceControlHandlers;
  private readonly forwarder: ScenarioCommandForwarder;
  private readonly logger?: ScenarioRouterOptions['logger'];
  private readonly minimumCommandLength: number;

  constructor(options: ScenarioRouterOptions) {
    this.currentScenarioKey = options.currentScenarioKey;
    this.voiceControl = options.voiceControl;
    this.forwarder = options.forwarder;
    this.logger = options.logger;
    this.minimumCommandLength = Math.max(options.minimumCommandLength ?? 1, 1);
  }

  setCurrentScenarioKey(next: string): void {
    if (!next) return;
    this.currentScenarioKey = next;
  }

  async handleHotwordMatch(match: HotwordMatch): Promise<void> {
    const commandText = match.commandText.trim();
    if (!commandText || commandText.length < this.minimumCommandLength) {
      this.logger?.debug?.('Ignoring hotword without command body', {
        scenarioKey: match.scenarioKey,
        itemId: match.itemId,
      });
      return;
    }

    if (this.normalize(match.scenarioKey) === this.normalize(this.currentScenarioKey)) {
      await this.forwarder.replaceTranscriptWithText({ ...match, commandText });
      return;
    }

    this.logger?.info?.('Hotword detected for different scenario. Requesting switch.', {
      currentScenario: this.currentScenarioKey,
      requestedScenario: match.scenarioKey,
      commandPreview: commandText.slice(0, 60),
    });
    await this.forwarder.interruptActiveResponse();
    await this.voiceControl.requestScenarioChange(match.scenarioKey, {
      initialCommand: commandText,
    });
    this.currentScenarioKey = match.scenarioKey;
  }

  private normalize(value: string): string {
    return value?.trim().toLowerCase() ?? '';
  }
}
