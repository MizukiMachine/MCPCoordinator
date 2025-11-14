import { spawn } from 'node:child_process';
import type { Buffer } from 'node:buffer';

import ffmpegPath from 'ffmpeg-static';

import { HttpError } from '../../../framework/errors/HttpError';
import type { AudioTranscoder } from './AudioTranscoder';

type TranscoderOptions = {
  timeoutMs?: number;
  maxInputBytes?: number;
};

const TRANSCODE_ARGS = [
  '-loglevel',
  'error',
  '-i',
  'pipe:0',
  '-ac',
  '1',
  '-ar',
  '16000',
  '-f',
  's16le',
  'pipe:1',
];

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_INPUT_BYTES = 5 * 1024 * 1024; // 5 MiB per chunk

export class FfmpegWebmOpusTranscoder implements AudioTranscoder {
  constructor(private readonly options: TranscoderOptions = {}) {}

  async transcodeWebmOpusToLinear16(buffer: Buffer): Promise<Buffer> {
    if (!ffmpegPath) {
      throw new HttpError(500, 'FFmpeg binary was not resolved');
    }
    const maxInputBytes = this.options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
    if (buffer.byteLength > maxInputBytes) {
      throw new HttpError(413, `Audio chunk exceeds ${maxInputBytes} bytes`);
    }

    return new Promise<Buffer>((resolve, reject) => {
      const child = spawn(ffmpegPath, TRANSCODE_ARGS, { stdio: 'pipe' });
      const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
      if (typeof timeout.unref === 'function') {
        timeout.unref();
      }

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      const cleanup = () => {
        clearTimeout(timeout);
      };

      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      child.once('error', (error) => {
        cleanup();
        reject(new HttpError(500, `FFmpeg spawn failed: ${error.message}`));
      });

      child.once('close', (code) => {
        cleanup();
        if (code === 0) {
          resolve(Buffer.concat(stdoutChunks));
        } else {
          const stderr = Buffer.concat(stderrChunks).toString('utf8');
          if (timedOut) {
            reject(new HttpError(504, `FFmpeg timed out after ${timeoutMs}ms`));
            return;
          }
          reject(new HttpError(500, `FFmpeg exited with code ${code ?? -1}: ${stderr}`));
        }
      });

      child.stdin.on('error', (error) => {
        cleanup();
        reject(new HttpError(500, `FFmpeg stdin failed: ${error.message}`));
      });

      child.stdin.end(buffer);
    });
  }
}
