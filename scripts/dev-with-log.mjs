import { spawn } from 'node:child_process';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const logPath = path.join(process.cwd(), 'terminallog.log');

await fs.mkdir(path.dirname(logPath), { recursive: true });
await fs.writeFile(logPath, '', 'utf8');

const logStream = createWriteStream(logPath, { flags: 'a' });

const nextBin = path.join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'next.cmd' : 'next',
);

const child = spawn(nextBin, ['dev'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: process.env,
});

const forwardChunk = (chunk) => {
  process.stdout.write(chunk);
  logStream.write(chunk);
};

const forwardChunkErr = (chunk) => {
  process.stderr.write(chunk);
  logStream.write(chunk);
};

child.stdout.on('data', forwardChunk);
child.stderr.on('data', forwardChunkErr);

const cleanupAndExit = (code) => {
  logStream.end(() => {
    process.exit(code ?? 0);
  });
};

child.on('close', (code) => {
  cleanupAndExit(code);
});

child.on('error', (error) => {
  console.error('[dev-with-log] Failed to start Next.js:', error);
  cleanupAndExit(1);
});

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
});
