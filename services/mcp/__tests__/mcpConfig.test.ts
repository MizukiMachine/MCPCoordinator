/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';

import { loadMcpServersFromEnv, parseMcpServers, McpConfigError } from '../config';

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
    expect(loadMcpServersFromEnv({})).toEqual({});
  });

  it('delegates to parser when MCP_SERVERS is present', () => {
    const env = {
      MCP_SERVERS: JSON.stringify([{ id: 'x', transport: 'stdio', command: 'echo' }]),
    };
    const result = loadMcpServersFromEnv(env);
    expect(result.x).toMatchObject({
      id: 'x',
      transport: 'stdio',
      command: 'echo',
    });
  });
});
