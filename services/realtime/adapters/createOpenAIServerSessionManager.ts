import type { RealtimeAgent } from '@openai/agents/realtime';

import { SessionManager } from '../SessionManager';
import type { ISessionManager, SessionManagerHooks } from '../types';
import { OpenAIAgentSetResolver } from './openAIAgentSetResolver';
import {
  OpenAIRealtimeServerTransport,
  type OpenAIRealtimeServerTransportOptions,
} from './openAIRealtimeServerTransport';

export interface OpenAIServerSessionManagerConfig {
  scenarioMap: Record<string, RealtimeAgent[]>;
  transport?: OpenAIRealtimeServerTransportOptions;
  hooks?: SessionManagerHooks;
}

export function createOpenAIServerSessionManager(
  config: OpenAIServerSessionManagerConfig,
): ISessionManager<RealtimeAgent> {
  const resolver = new OpenAIAgentSetResolver(config.scenarioMap);
  return new SessionManager<RealtimeAgent>({
    agentResolver: resolver,
    transportFactory: () => new OpenAIRealtimeServerTransport(config.transport),
    hooks: config.hooks,
  });
}
