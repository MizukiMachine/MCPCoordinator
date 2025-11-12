import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  CreativeParallelResult,
  CreativePromptPayload,
  CreativeSingleResult,
} from '@/app/creativeSandbox/types';

const LOG_PATH = path.join(process.cwd(), 'terminallog.log');

type LogEntry =
  | {
      kind: 'single';
      payload: CreativePromptPayload;
      response?: CreativeSingleResult;
      error?: string;
    }
  | {
      kind: 'parallel';
      payload: CreativePromptPayload;
      response?: CreativeParallelResult;
      error?: string;
    };

let initialized = false;
let initPromise: Promise<void> | null = null;

async function ensureLogFile() {
  if (initialized) return;
  if (!initPromise) {
    initPromise = fs
      .writeFile(LOG_PATH, '', { flag: 'w' })
      .then(() => {
        initialized = true;
      })
      .catch((error) => {
        console.error('[creativeSandbox.logger] failed to init log', error);
      });
  }
  await initPromise;
}

export async function logCreativeSandboxEvent(entry: LogEntry) {
  try {
    await ensureLogFile();
    const record = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    await fs.appendFile(LOG_PATH, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (error) {
    console.error('[creativeSandbox.logger] failed to append log', error);
  }
}
