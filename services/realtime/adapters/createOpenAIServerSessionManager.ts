import type { RealtimeAgent } from '@openai/agents/realtime';

import { SessionManager } from '../SessionManager';
import type {
  ISessionManager,
  SessionManagerHooks,
  IAgentSetResolver,
} from '../types';
import { OpenAIAgentSetResolver } from './openAIAgentSetResolver';
import {
  OpenAIRealtimeServerTransport,
  type OpenAIRealtimeServerTransportOptions,
} from './openAIRealtimeServerTransport';

export interface OpenAIServerSessionManagerConfig {
  scenarioMap?: Record<string, RealtimeAgent[]>;
  agentResolver?: IAgentSetResolver<RealtimeAgent>;
  transport?: OpenAIRealtimeServerTransportOptions;
  hooks?: SessionManagerHooks;
}

export function createOpenAIServerSessionManager(
  config: OpenAIServerSessionManagerConfig,
): ISessionManager<RealtimeAgent> {
  const resolver =
    config.agentResolver ??
    new OpenAIAgentSetResolver(
      config.scenarioMap ??
        (() => {
          throw new Error('scenarioMap is required when agentResolver is not provided');
        })(),
    );
  return new SessionManager<RealtimeAgent>({
    agentResolver: resolver,
    transportFactory: () => new OpenAIRealtimeServerTransport(config.transport),
    hooks: config.hooks,
  });
}
