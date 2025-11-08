import { hostedMcpTool, type HostedMCPTool } from '@openai/agents';

import { loadJGrantsMcpConfig } from '@/framework/mcp/jgrantsConfig';

export interface SubsidyKnowledgeConnector {
  readonly name: string;
  buildHostedTool(): HostedMCPTool | null;
}

export class JGrantsSubsidyConnector implements SubsidyKnowledgeConnector {
  readonly name = 'digital-agency-subsidy';

  buildHostedTool(): HostedMCPTool | null {
    try {
      const config = loadJGrantsMcpConfig();

      return hostedMcpTool({
        serverLabel: config.serverLabel,
        serverUrl: config.serverUrl,
        allowedTools: config.allowedTools,
        requireApproval: config.requireApproval,
      });
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[JGrantsSubsidyConnector] MCP tool unavailable:',
          (error as Error)?.message ?? error,
        );
      }
      return null;
    }
  }
}

export const jgrantsSubsidyConnector = new JGrantsSubsidyConnector();

export function getJGrantsHostedMcpTool(): HostedMCPTool | null {
  return jgrantsSubsidyConnector.buildHostedTool();
}
