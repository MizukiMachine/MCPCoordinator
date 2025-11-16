export type Locale = "ja";

export interface UiText {
  metadata: {
    title: string;
    description: string;
    lang: string;
  };
  page: {
    loading: string;
  };
  header: {
    titleMain: string;
    titleAccent: string;
    scenarioLabel: string;
    agentLabel: string;
    logoAlt: string;
  };
  session: {
    agentBreadcrumbLabel: string;
    errorMessageTemplate: string;
  };
  transcript: {
    title: string;
    copyLabel: string;
    copiedLabel: string;
    downloadAudioLabel: string;
    placeholder: string;
    sendIconAlt: string;
    unknownItemTypeTemplate: string;
    expertContest: {
      title: string;
      winnerLabel: string;
      runnerUpLabel: string;
      totalLatencyLabel: string;
      tieBreakerLabel: string;
      judgeSummaryLabel: string;
      scoreboardLabel: string;
      expertHeading: string;
      scoreHeading: string;
      confidenceHeading: string;
      latencyHeading: string;
      baselineLabel: string;
    };
  };
  toolbar: {
    connectLabel: string;
    disconnectLabel: string;
    connectingLabel: string;
    pushToTalkLabel: string;
    talkButtonLabel: string;
    audioPlaybackLabel: string;
    textOutputLabel: string;
    logsLabel: string;
    codecLabel: string;
    codecOptions: {
      opus: string;
      pcmu: string;
      pcma: string;
    };
  };
  events: {
    title: string;
    expertContestSummary: string;
  };
  guardrail: {
    label: string;
    states: {
      pending: string;
      pass: string;
      fail: string;
    };
    categoryLabel: string;
  };
  voiceControl: {
    unknownScenario: string;
    alreadyInScenario: string;
    switchingScenario: string;
    unknownAgent: string;
    alreadyWithAgent: string;
    switchingAgent: string;
  };
  upload: {
    title: string;
    dropHint: string;
    selectLabel: string;
    sendLabel: string;
    captionPlaceholder: string;
    sizeNote: string;
    statusReady: string;
    statusUploading: string;
    statusDone: string;
    errorPrefix: string;
  };
}
