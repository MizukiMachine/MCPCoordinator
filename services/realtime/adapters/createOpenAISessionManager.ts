import type { RealtimeAgent } from '@openai/agents/realtime';

import { SessionManager } from '../SessionManager';
import type { ISessionManager, SessionManagerHooks } from '../types';
import { OpenAIAgentSetResolver } from './openAIAgentSetResolver';
import {
  OpenAIRealtimeTransport,
  type OpenAIRealtimeTransportOptions,
} from './openAIRealtimeTransport';

export interface OpenAISessionManagerConfig {
  scenarioMap: Record<string, RealtimeAgent[]>;
  transport?: OpenAIRealtimeTransportOptions;
  hooks?: SessionManagerHooks;
}

export function createOpenAISessionManager(
  config: OpenAISessionManagerConfig,
): ISessionManager<RealtimeAgent> {
  const resolver = new OpenAIAgentSetResolver(config.scenarioMap);

  return new SessionManager<RealtimeAgent>({
    agentResolver: resolver,
    transportFactory: () => new OpenAIRealtimeTransport(config.transport),
    hooks: config.hooks,
  });
}
