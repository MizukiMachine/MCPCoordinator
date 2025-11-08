export type JGrantsRequireApproval = 'never' | 'always';

export interface LoadJGrantsMcpConfigOptions {
  env?: Record<string, string | undefined>;
}

export interface JGrantsMcpConfig {
  serverUrl: string;
  serverLabel: string;
  allowedTools?: string[];
  requireApproval: JGrantsRequireApproval;
}

const DEFAULT_LABEL = 'digital-agency-jgrants';
const SERVER_URL_KEYS = [
  'JGRANTS_MCP_SERVER_URL',
  'NEXT_PUBLIC_JGRANTS_MCP_SERVER_URL',
];
const SERVER_LABEL_KEYS = [
  'JGRANTS_MCP_SERVER_LABEL',
  'NEXT_PUBLIC_JGRANTS_MCP_SERVER_LABEL',
];
const ALLOWED_TOOLS_KEYS = [
  'JGRANTS_MCP_ALLOWED_TOOLS',
  'NEXT_PUBLIC_JGRANTS_MCP_ALLOWED_TOOLS',
];
const REQUIRE_APPROVAL_KEYS = [
  'JGRANTS_MCP_REQUIRE_APPROVAL',
  'NEXT_PUBLIC_JGRANTS_MCP_REQUIRE_APPROVAL',
];

export function loadJGrantsMcpConfig(
  options: LoadJGrantsMcpConfigOptions = {},
): JGrantsMcpConfig {
  const env = options.env ?? process.env;

  const serverUrl = pickFirstValue(env, SERVER_URL_KEYS);
  if (!serverUrl) {
    throw new Error(
      'JGRANTS_MCP_SERVER_URL or NEXT_PUBLIC_JGRANTS_MCP_SERVER_URL must be set to enable the JGrants MCP connector.',
    );
  }

  const serverLabel =
    pickFirstValue(env, SERVER_LABEL_KEYS)?.trim() || DEFAULT_LABEL;

  const allowedTools = pickFirstValue(env, ALLOWED_TOOLS_KEYS)
    ?.split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const requireApproval = toApprovalFlag(
    pickFirstValue(env, REQUIRE_APPROVAL_KEYS),
  );

  return {
    serverUrl,
    serverLabel,
    allowedTools: allowedTools && allowedTools.length > 0 ? allowedTools : undefined,
    requireApproval,
  };
}

function pickFirstValue(
  env: Record<string, string | undefined>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const val = env[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return undefined;
}

function toApprovalFlag(value?: string): JGrantsRequireApproval {
  if (!value) return 'never';
  const normalised = value.trim().toLowerCase();
  return normalised === 'always' ? 'always' : 'never';
}
