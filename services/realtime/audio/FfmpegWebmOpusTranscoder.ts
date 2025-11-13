import { spawn } from 'node:child_process';
import type { Buffer } from 'node:buffer';

import ffmpegPath from 'ffmpeg-static';

import { HttpError } from '../../../framework/errors/HttpError';
import type { AudioTranscoder } from './AudioTranscoder';

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

export class FfmpegWebmOpusTranscoder implements AudioTranscoder {
  async transcodeWebmOpusToLinear16(buffer: Buffer): Promise<Buffer> {
    if (!ffmpegPath) {
      throw new HttpError(500, 'FFmpeg binary was not resolved');
    }

    return new Promise<Buffer>((resolve, reject) => {
      const child = spawn(ffmpegPath, TRANSCODE_ARGS, { stdio: 'pipe' });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      child.once('error', (error) => {
        reject(new HttpError(500, `FFmpeg spawn failed: ${error.message}`));
      });

      child.once('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(stdoutChunks));
        } else {
          const stderr = Buffer.concat(stderrChunks).toString('utf8');
          reject(new HttpError(500, `FFmpeg exited with code ${code}: ${stderr}`));
        }
      });

      child.stdin.on('error', (error) => {
        reject(new HttpError(500, `FFmpeg stdin failed: ${error.message}`));
      });

      child.stdin.end(buffer);
    });
  }
}
