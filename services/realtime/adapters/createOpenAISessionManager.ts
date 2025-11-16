import type { RealtimeAgent } from '@openai/agents/realtime';

import { SessionManager } from '../SessionManager';
import type {
  ISessionManager,
  SessionManagerHooks,
  IAgentSetResolver,
} from '../types';
import { OpenAIAgentSetResolver } from './openAIAgentSetResolver';
import {
  OpenAIRealtimeTransport,
  type OpenAIRealtimeTransportOptions,
} from './openAIRealtimeTransport';

export interface OpenAISessionManagerConfig {
  scenarioMap?: Record<string, RealtimeAgent[]>;
  agentResolver?: IAgentSetResolver<RealtimeAgent>;
  transport?: OpenAIRealtimeTransportOptions;
  hooks?: SessionManagerHooks;
}

export function createOpenAISessionManager(
  config: OpenAISessionManagerConfig,
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
    transportFactory: () => new OpenAIRealtimeTransport(config.transport),
    hooks: config.hooks,
  });
}
