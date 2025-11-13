import type { Buffer } from 'node:buffer';

export interface AudioTranscoder {
  /**
   * Converts an audio/webm (Opus) buffer into 16-bit linear PCM at 16 kHz mono.
   * Returns a Buffer ready to be base64-encoded for the Realtime API.
   */
  transcodeWebmOpusToLinear16(buffer: Buffer): Promise<Buffer>;
}
