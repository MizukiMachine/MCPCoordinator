import { describe, it, expect } from 'vitest';

import { loadJGrantsMcpConfig } from '@/framework/mcp/jgrantsConfig';

describe('loadJGrantsMcpConfig', () => {
  it('throws a descriptive error when no URL is provided', () => {
    expect(() => loadJGrantsMcpConfig({ env: {} })).toThrowError(
      /JGRANTS_MCP_SERVER_URL/i,
    );
  });

  it('prefers the server-side URL and preserves explicit labels', () => {
    const config = loadJGrantsMcpConfig({
      env: {
        JGRANTS_MCP_SERVER_URL: 'https://server.example/mcp',
        NEXT_PUBLIC_JGRANTS_MCP_SERVER_URL: 'https://public.example/mcp',
        NEXT_PUBLIC_JGRANTS_MCP_SERVER_LABEL: 'custom-jgrants',
        NEXT_PUBLIC_JGRANTS_MCP_ALLOWED_TOOLS: 'search_subsidies, detail_lookup',
        NEXT_PUBLIC_JGRANTS_MCP_REQUIRE_APPROVAL: 'always',
      },
    });

    expect(config.serverUrl).toBe('https://server.example/mcp');
    expect(config.serverLabel).toBe('custom-jgrants');
    expect(config.allowedTools).toEqual(['search_subsidies', 'detail_lookup']);
    expect(config.requireApproval).toBe('always');
  });

  it('normalises whitespace and drops empty allowed tool entries', () => {
    const config = loadJGrantsMcpConfig({
      env: {
        NEXT_PUBLIC_JGRANTS_MCP_SERVER_URL: '  https://public.example/mcp  ',
        NEXT_PUBLIC_JGRANTS_MCP_ALLOWED_TOOLS: ' search_subsidies, ,detail_lookup ,  ',
      },
    });

    expect(config.serverUrl).toBe('https://public.example/mcp');
    expect(config.allowedTools).toEqual(['search_subsidies', 'detail_lookup']);
  });

  it('falls back to safe defaults when optional envs are omitted or invalid', () => {
    const config = loadJGrantsMcpConfig({
      env: {
        NEXT_PUBLIC_JGRANTS_MCP_SERVER_URL: 'https://public.example/mcp',
        NEXT_PUBLIC_JGRANTS_MCP_REQUIRE_APPROVAL: 'invalid-value',
      },
    });

    expect(config.serverLabel).toBe('digital-agency-jgrants');
    expect(config.requireApproval).toBe('never');
    expect(config.allowedTools).toBeUndefined();
  });
});
