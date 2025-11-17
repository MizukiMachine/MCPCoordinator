import fs from 'node:fs';
import path from 'node:path';

import YAML from 'yaml';

import { McpServerConfig } from './mcpTypes';

const DEFAULT_TRANSPORT: McpServerConfig['transport'] = 'sse';
const DEFAULT_CONFIG_FILES = [
  'config/mcp.servers.yaml',
  'config/mcp.servers.yml',
  'config/mcp.servers.json',
];

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

function interpolateEnv(value: unknown, env: Record<string, string | undefined>): unknown {
  if (typeof value !== 'string') return value;

  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (match, varName) => {
    const resolved = env[varName];
    if (resolved == null) {
      throw new McpConfigError(
        `Environment variable "${varName}" is not set but is required for MCP config`,
      );
    }
    return resolved;
  });
}

function normalizeEntries(
  entries: any[],
  env: Record<string, string | undefined>,
): Record<string, McpServerConfig> {
  const result: Record<string, McpServerConfig> = {};
  for (const entry of entries) {
    assertConfigShape(entry);
    const id = entry.id as string;
    const normalized: McpServerConfig = {
      id,
      transport: entry.transport ?? DEFAULT_TRANSPORT,
      url: interpolateEnv(entry.url, env) as string | undefined,
      command: interpolateEnv(entry.command, env) as string | undefined,
      args: Array.isArray(entry.args)
        ? entry.args.map((v: unknown) => interpolateEnv(v, env) as any)
        : [],
      headers: Object.fromEntries(
        Object.entries(entry.headers ?? {}).map(([key, value]) => [
          key,
          interpolateEnv(value, env) as string,
        ]),
      ),
      cacheToolsList: entry.cacheToolsList ?? true,
      timeoutMs: entry.timeoutMs,
      name: interpolateEnv(entry.name, env) as string | undefined,
    };
    result[id] = normalized;
  }
  return result;
}

export function parseMcpServers(
  raw: string,
  env: Record<string, string | undefined> = process.env,
): Record<string, McpServerConfig> {
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

  return normalizeEntries(parsed, env);
}

function parseMcpServersFromFile(
  filePath: string,
  env: Record<string, string | undefined>,
): Record<string, McpServerConfig> {
  const raw = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  let parsed: unknown;

  if (ext === '.yaml' || ext === '.yml') {
    try {
      parsed = YAML.parse(raw);
    } catch (error) {
      throw new McpConfigError(
        `Failed to parse YAML at ${filePath}: ${(error as Error).message}`,
      );
    }
  } else {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new McpConfigError(
        `Failed to parse JSON at ${filePath}: ${(error as Error).message}`,
      );
    }
  }

  if (!Array.isArray(parsed)) {
    throw new McpConfigError(`${filePath} must contain an array of MCP server entries`);
  }

  return normalizeEntries(parsed, env);
}

function findConfigFile(
  cwd: string,
  preferredPath?: string,
  defaults: string[] = DEFAULT_CONFIG_FILES,
): string | null {
  const candidates = preferredPath ? [preferredPath, ...defaults] : defaults;
  for (const rel of candidates) {
    const full = path.isAbsolute(rel) ? rel : path.join(cwd, rel);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      return full;
    }
  }
  return null;
}

export interface LoadMcpServersOptions {
  env?: Record<string, string | undefined>;
  cwd?: string;
  preferredPath?: string;
  disableFileLookup?: boolean;
  configFiles?: string[];
}

export function loadMcpServers(
  options: LoadMcpServersOptions = {},
): Record<string, McpServerConfig> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const defaults = options.disableFileLookup
    ? []
    : options.configFiles ?? DEFAULT_CONFIG_FILES;

  const preferred = options.preferredPath ?? env.MCP_SERVERS_FILE;
  const configFile = findConfigFile(cwd, preferred, defaults);
  if (configFile) {
    return parseMcpServersFromFile(configFile, env);
  }

  const raw = env.MCP_SERVERS ?? '';
  if (raw) {
    return parseMcpServers(raw, env);
  }

  return {};
}

// backward-compatible export name
export function loadMcpServersFromEnv(
  env: Record<string, string | undefined> = process.env,
  options?: Omit<LoadMcpServersOptions, 'env'>,
): Record<string, McpServerConfig> {
  return loadMcpServers({ env, ...options });
}
