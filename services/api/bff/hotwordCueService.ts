import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { RealtimeAgent } from '@openai/agents/realtime';

import type { StructuredLogger } from '../../../framework/logging/structuredLogger';
import type { MetricEmitter } from '../../../framework/metrics/metricEmitter';
import type { ISessionManager } from '../../realtime/types';

export interface HotwordCueRequest {
  sessionId: string;
  scenarioKey: string;
  transcript: string;
  manager: ISessionManager<RealtimeAgent>;
}

export interface HotwordCueResult {
  cueId: string;
  status: 'streamed' | 'fallback';
  reason?: string;
}

export interface HotwordCueService {
  playCue(request: HotwordCueRequest): Promise<HotwordCueResult>;
}

interface HotwordCueServiceOptions {
  audioFilePath?: string;
  logger: StructuredLogger;
  metrics: MetricEmitter;
}

export class ServerHotwordCueService implements HotwordCueService {
  private readonly logger: StructuredLogger;
  private readonly metrics: MetricEmitter;
  private readonly audioFilePath: string;
  private audioBase64?: string;

  constructor(options: HotwordCueServiceOptions) {
    this.logger = options.logger;
    this.metrics = options.metrics;
    this.audioFilePath = options.audioFilePath ?? path.join(process.cwd(), 'public', 'audio', 'hotword-chime.wav');
  }

  async playCue(request: HotwordCueRequest): Promise<HotwordCueResult> {
    const cueId = `cue_${randomUUID()}`;
    try {
      const audio = this.loadAudioBase64();
      request.manager.sendEvent({ type: 'response.cancel' });
      request.manager.sendEvent({
        type: 'response.create',
        response: {
          conversation: 'none',
          metadata: {
            cueId,
            tags: ['hotword-chime'],
            scenarioKey: request.scenarioKey,
          },
          modalities: ['audio'],
          instructions: 'Play the provided hotword confirmation tone exactly once.',
          input: [
            {
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'output_audio',
                  audio,
                  transcript: 'Hotword detected confirmation tone',
                },
              ],
            },
          ],
        },
      });
      this.metrics.increment('bff.session.hotword_cue_emitted_total', 1, {
        scenario: request.scenarioKey,
      });
      return { cueId, status: 'streamed' };
    } catch (error) {
      this.logger.warn('Failed to emit hotword cue', {
        sessionId: request.sessionId,
        scenarioKey: request.scenarioKey,
        error,
      });
      this.metrics.increment('bff.session.hotword_cue_failed_total', 1, {
        scenario: request.scenarioKey,
      });
      return {
        cueId,
        status: 'fallback',
        reason: error instanceof Error ? error.message : 'Unknown hotword cue error',
      };
    }
  }

  private loadAudioBase64(): string {
    if (this.audioBase64) {
      return this.audioBase64;
    }
    const buffer = fs.readFileSync(this.audioFilePath);
    const pcm = this.extractPcmBuffer(buffer);
    this.audioBase64 = pcm.toString('base64');
    return this.audioBase64;
  }

  private extractPcmBuffer(buffer: Buffer): Buffer {
    const header = buffer.subarray(0, 4).toString('ascii');
    if (header !== 'RIFF') {
      throw new Error('Invalid WAV file: missing RIFF header');
    }
    const wave = buffer.subarray(8, 12).toString('ascii');
    if (wave !== 'WAVE') {
      throw new Error('Invalid WAV file: missing WAVE chunk');
    }
    let offset = 12; // Skip RIFF header (12 bytes)
    while (offset + 8 <= buffer.length) {
      const chunkId = buffer.subarray(offset, offset + 4).toString('ascii');
      const chunkSize = buffer.readUInt32LE(offset + 4);
      offset += 8;
      if (chunkId === 'data') {
        if (offset + chunkSize > buffer.length) {
          throw new Error('Invalid WAV file: truncated data chunk');
        }
        return buffer.subarray(offset, offset + chunkSize);
      }
      offset += chunkSize + (chunkSize % 2); // Chunks are word aligned
    }
    throw new Error('Invalid WAV file: data chunk not found');
  }
}
