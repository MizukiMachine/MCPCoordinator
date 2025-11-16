import { McpServerConfig } from './mcpTypes';

const DEFAULT_TRANSPORT: McpServerConfig['transport'] = 'sse';

export class McpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpConfigError';
  }
}

function assertConfigShape(entry: any): asserts entry is Partial<McpServerConfig> {
  if (typeof entry !== 'object' || entry == null) {
    throw new McpConfigError('MCP server config must be an object');
  }
  if (!entry.id || typeof entry.id !== 'string') {
    throw new McpConfigError('MCP server config requires a string "id"');
  }
  if (entry.transport && !['sse', 'stdio', 'streamable_http'].includes(entry.transport)) {
    throw new McpConfigError(
      `Unknown transport "${entry.transport}" in MCP config "${entry.id}"`,
    );
  }
}

export function parseMcpServers(raw: string): Record<string, McpServerConfig> {
  if (!raw.trim()) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new McpConfigError(
      `Failed to parse MCP_SERVERS JSON: ${(error as Error).message}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new McpConfigError('MCP_SERVERS must be a JSON array');
  }

  const result: Record<string, McpServerConfig> = {};
  for (const entry of parsed) {
    assertConfigShape(entry);
    const normalized: McpServerConfig = {
      id: entry.id,
      transport: entry.transport ?? DEFAULT_TRANSPORT,
      url: entry.url,
      command: entry.command,
      args: entry.args ?? [],
      headers: entry.headers ?? {},
      cacheToolsList: entry.cacheToolsList ?? true,
      timeoutMs: entry.timeoutMs,
      name: entry.name,
    };
    result[normalized.id] = normalized;
  }

  return result;
}

export function loadMcpServersFromEnv(
  env: Record<string, string | undefined> = process.env,
): Record<string, McpServerConfig> {
  const raw = env.MCP_SERVERS ?? '';
  if (!raw) return {};
  return parseMcpServers(raw);
}
