export type VoiceControlDirective =
  | {
      action: 'switchScenario';
      scenarioKey: string;
    }
  | {
      action: 'switchAgent';
      agentName: string;
    };

export interface VoiceControlResult {
  success: boolean;
  message?: string;
}

export interface VoiceControlHandlers {
  requestScenarioChange: (scenarioKey: string) => Promise<VoiceControlResult>;
  requestAgentChange: (agentName: string) => Promise<VoiceControlResult>;
}

export function isVoiceControlDirective(payload: any): payload is VoiceControlDirective {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  if (payload.action === 'switchScenario' && typeof payload.scenarioKey === 'string') {
    return true;
  }

  if (payload.action === 'switchAgent' && typeof payload.agentName === 'string') {
    return true;
  }

  return false;
}
