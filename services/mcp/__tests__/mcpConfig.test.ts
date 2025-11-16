/// <reference types="vitest" />
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  loadMcpServersFromEnv,
  parseMcpServers,
  McpConfigError,
  loadMcpServers,
} from '../config';

describe('parseMcpServers', () => {
  it('returns empty object for blank input', () => {
    expect(parseMcpServers('  ')).toEqual({});
  });

  it('parses minimal SSE config', () => {
    const result = parseMcpServers(
      JSON.stringify([{ id: 'demo', url: 'https://example.com/mcp' }]),
    );
    expect(result.demo).toMatchObject({
      id: 'demo',
      transport: 'sse',
      url: 'https://example.com/mcp',
      cacheToolsList: true,
    });
  });

  it('interpolates env vars in url and headers', () => {
    const env = { HOST: 'https://example.com', TOKEN: 'secret' };
    const result = parseMcpServers(
      JSON.stringify([
        {
          id: 'demo',
          url: '${HOST}/mcp',
          headers: { Authorization: 'Bearer ${TOKEN}' },
        },
      ]),
      env,
    );
    expect(result.demo.url).toBe('https://example.com/mcp');
    expect(result.demo.headers.Authorization).toBe('Bearer secret');
  });

  it('throws when env placeholder is missing', () => {
    expect(() =>
      parseMcpServers(
        JSON.stringify([{ id: 'demo', headers: { Authorization: 'Bearer ${TOKEN}' } }]),
        {},
      ),
    ).toThrowError(McpConfigError);
  });

  it('throws a helpful error on invalid JSON', () => {
    expect(() => parseMcpServers('not-json')).toThrowError(McpConfigError);
  });

  it('throws when id is missing', () => {
    expect(() =>
      parseMcpServers(JSON.stringify([{ url: 'https://example.com' }])),
    ).toThrowError(/id/);
  });
});

describe('loadMcpServersFromEnv', () => {
  it('returns empty object when env is unset', () => {
    expect(
      loadMcpServersFromEnv(
        { MCP_SERVERS_FILE: '/non-existent' },
        { disableFileLookup: true, cwd: '/non-existent' },
      ),
    ).toEqual({});
  });

  it('delegates to parser when MCP_SERVERS is present', () => {
    const env = {
      MCP_SERVERS: JSON.stringify([{ id: 'x', transport: 'stdio', command: 'echo' }]),
      MCP_SERVERS_FILE: '/non-existent',
    };
    const result = loadMcpServersFromEnv(env, { disableFileLookup: true, cwd: '/non-existent' });
    expect(result.x).toMatchObject({
      id: 'x',
      transport: 'stdio',
      command: 'echo',
    });
  });
});

describe('loadMcpServers (file preferred)', () => {
  function createTempConfig(ext: string, content: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-config-'));
    const file = path.join(dir, `mcp.servers.${ext}`);
    fs.writeFileSync(file, content, 'utf8');
    return file;
  }

  it('prefers YAML file when present', () => {
    const file = createTempConfig(
      'yaml',
      `
- id: news
  transport: sse
  url: https://example.com/news
`,
    );
    const result = loadMcpServers({ preferredPath: file, env: {} });
    expect(result.news).toMatchObject({ id: 'news', transport: 'sse' });
  });

  it('falls back to env JSON when file is absent', () => {
    const env = {
      MCP_SERVERS: JSON.stringify([{ id: 'env', url: 'https://env/mcp' }]),
    };
    const result = loadMcpServers({ env, cwd: '/non-existent' });
    expect(result.env).toBeDefined();
  });
});
