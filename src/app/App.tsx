"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import Image from "next/image";

// UI components
import Transcript from "./components/Transcript";
import Events from "./components/Events";
import BottomToolbar from "./components/BottomToolbar";

// Types
import { SessionStatus } from "@/app/types";
import type { RealtimeAgent } from '@openai/agents/realtime';

// Context providers & hooks
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";
import { useRealtimeSession } from "./hooks/useRealtimeSession";
import { createModerationGuardrail } from "@/app/agentConfigs/guardrails";

// Agent configs
import { allAgentSets, agentSetMetadata, defaultAgentSetKey } from "@/app/agentConfigs";
import { customerServiceRetailScenario } from "@/app/agentConfigs/customerServiceRetail";
import { chatSupervisorScenario } from "@/app/agentConfigs/chatSupervisor";
import { simpleHandoffScenario } from "@/app/agentConfigs/simpleHandoff";
import { techExpertContestScenario } from "@/app/agentConfigs/techExpertContest";
import { medExpertContestScenario } from "@/app/agentConfigs/medExpertContest";

// Map used by connect logic for scenarios defined via the SDK.
const sdkScenarioMap: Record<string, RealtimeAgent[]> = {
  simpleHandoff: simpleHandoffScenario,
  customerServiceRetail: customerServiceRetailScenario,
  chatSupervisor: chatSupervisorScenario,
  techParallelContest: techExpertContestScenario,
  medParallelContest: medExpertContestScenario,
};

const companyNameByScenario: Record<string, string> = Object.fromEntries(
  Object.entries(agentSetMetadata).map(([key, meta]) => [key, meta.companyName]),
);

import useAudioDownload from "./hooks/useAudioDownload";
import { useHandleSessionHistory } from "./hooks/useHandleSessionHistory";
import { formatUiText, uiText } from "./i18n";

function App() {
  const searchParams = useSearchParams()!;
  const router = useRouter();
  const pathname = usePathname();
  const shouldAutoConnect = searchParams.get("autoConnect") === "true";

  // ---------------------------------------------------------------------
  // Codec selector – lets you toggle between wide-band Opus (48 kHz)
  // and narrow-band PCMU/PCMA (8 kHz) to hear what the agent sounds like on
  // a traditional phone line and to validate ASR / VAD behaviour under that
  // constraint.
  //
  // We read the `?codec=` query-param and rely on the `changePeerConnection`
  // hook (configured in `useRealtimeSession`) to set the preferred codec
  // before the offer/answer negotiation.
  // ---------------------------------------------------------------------
  const urlCodec = searchParams.get("codec") || "opus";

  // Agents SDK doesn't currently support codec selection so it is now forced 
  // via global codecPatch at module load 

  const {
    addTranscriptMessage,
    addTranscriptBreadcrumb,
  } = useTranscript();
  const { logClientEvent, logServerEvent } = useEvent();

  const [agentSetKey, setAgentSetKey] = useState<string>(defaultAgentSetKey);
  const [selectedAgentName, setSelectedAgentName] = useState<string>("");
  const [selectedAgentConfigSet, setSelectedAgentConfigSet] = useState<
    RealtimeAgent[] | null
  >(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  // Ref to identify whether the latest agent switch came from an automatic handoff
  const handoffTriggeredRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const el = document.createElement('audio');
    el.autoplay = true;
    el.style.display = 'none';
    document.body.appendChild(el);
    audioElementRef.current = el;

    return () => {
      if (audioElementRef.current === el) {
        audioElementRef.current = null;
      }
      el.pause();
      el.srcObject = null;
      el.remove();
    };
  }, []);

  const {
    connect,
    disconnect,
    sendUserText,
    sendEvent,
    interrupt,
    mute,
  } = useRealtimeSession({
    onConnectionChange: (s) => setSessionStatus(s as SessionStatus),
    onAgentHandoff: (agentName: string) => {
      handoffTriggeredRef.current = true;
      setSelectedAgentName(agentName);
    },
  });

  const [sessionStatus, setSessionStatus] =
    useState<SessionStatus>("DISCONNECTED");
  const pendingVoiceReconnectRef = useRef(false);

  const [isEventsPaneExpanded, setIsEventsPaneExpanded] =
    useState<boolean>(true);
  const [userText, setUserText] = useState<string>("");
  const [isPTTActive, setIsPTTActive] = useState<boolean>(false);
  const [isPTTUserSpeaking, setIsPTTUserSpeaking] = useState<boolean>(false);
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] = useState<boolean>(
    () => {
      if (typeof window === 'undefined') return true;
      const stored = localStorage.getItem('audioPlaybackEnabled');
      return stored ? stored === 'true' : true;
    },
  );

  const schedulePostToolAction = useCallback((action: () => void) => {
    setTimeout(action, 0);
  }, []);

  // Initialize the recording hook.
  const { startRecording, stopRecording, downloadRecording } =
    useAudioDownload();

  const sendClientEvent = (eventObj: any, eventNameSuffix = "") => {
    try {
      sendEvent(eventObj);
      logClientEvent(eventObj, eventNameSuffix);
    } catch (err) {
      console.error('Failed to send via SDK', err);
    }
  };

  useHandleSessionHistory();

  useEffect(() => {
    const requested = searchParams.get("agentConfig");
    const resolved =
      requested && allAgentSets[requested] ? requested : defaultAgentSetKey;

    setAgentSetKey((prev) => (prev === resolved ? prev : resolved));

    const shouldUpdateUrl = requested !== resolved;
    if (shouldUpdateUrl) {
      const next = new URLSearchParams(searchParams.toString());
      if (resolved === defaultAgentSetKey) {
        next.delete("agentConfig");
      } else {
        next.set("agentConfig", resolved);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const agents = allAgentSets[agentSetKey] ?? [];
    setSelectedAgentConfigSet(agents);
    setSelectedAgentName((prev) => {
      if (prev && agents.some((agent) => agent.name === prev)) {
        return prev;
      }
      return agents[0]?.name ?? "";
    });
  }, [agentSetKey]);

  useEffect(() => {
    if (
      shouldAutoConnect &&
      selectedAgentName &&
      sessionStatus === "DISCONNECTED"
    ) {
      connectToRealtime("auto");
    }
  }, [shouldAutoConnect, selectedAgentName, sessionStatus]);

  useEffect(() => {
    if (
      sessionStatus === "CONNECTED" &&
      selectedAgentConfigSet &&
      selectedAgentName
    ) {
      const currentAgent = selectedAgentConfigSet.find(
        (a) => a.name === selectedAgentName
      );
      addTranscriptBreadcrumb(
        `${uiText.session.agentBreadcrumbLabel}${selectedAgentName}`,
        currentAgent,
      );
      updateSession(!handoffTriggeredRef.current);
      // Reset flag after handling so subsequent effects behave normally
      handoffTriggeredRef.current = false;
    }
  }, [selectedAgentConfigSet, selectedAgentName, sessionStatus]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED") {
      updateSession();
    }
  }, [isPTTActive]);

  const fetchEphemeralKey = async (): Promise<string | null> => {
    logClientEvent({ url: "/session" }, "fetch_session_token_request");
    const tokenResponse = await fetch("/api/session");
    const data = await tokenResponse.json();
    logServerEvent(data, "fetch_session_token_response");

    if (!tokenResponse.ok) {
      const baseMessage =
        typeof data?.error === "string"
          ? data.error
          : "Failed to fetch realtime client secret.";
      const codeSuffix =
        typeof data?.code === "string" ? ` (${data.code})` : "";
      const descriptiveMessage = `${baseMessage}${codeSuffix}`;
      setSessionError(descriptiveMessage);
      logClientEvent(data, "error.fetch_session_token_failed");
      console.error("Realtime session bootstrap failed:", descriptiveMessage);
      setSessionStatus("DISCONNECTED");
      return null;
    }

    const clientSecret =
      data?.value ?? data?.client_secret?.value ?? data?.clientSecret;

    if (!clientSecret) {
      logClientEvent(data, "error.no_ephemeral_key");
      console.error("No ephemeral key provided by the server");
      setSessionStatus("DISCONNECTED");
      return null;
    }
    setSessionError(null);

    return clientSecret;
  };

  const disconnectFromRealtime = () => {
    disconnect();
    setIsPTTUserSpeaking(false);
  };

  const requestScenarioChange = useCallback(async (scenarioKey: string) => {
    addTranscriptBreadcrumb('Voice scenario switch request', { scenarioKey });
    if (!allAgentSets[scenarioKey]) {
      return {
        success: false,
        message: formatUiText(uiText.voiceControl.unknownScenario, { scenarioKey }),
      };
    }
    if (scenarioKey === agentSetKey) {
      return {
        success: true,
        message: formatUiText(uiText.voiceControl.alreadyInScenario, { scenarioKey }),
      };
    }

    schedulePostToolAction(() => {
      const next = new URLSearchParams(searchParams.toString());
      if (scenarioKey === defaultAgentSetKey) {
        next.delete('agentConfig');
      } else {
        next.set('agentConfig', scenarioKey);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });

      setAgentSetKey(scenarioKey);
      pendingVoiceReconnectRef.current = true;
      disconnectFromRealtime();
    });

    return {
      success: true,
      message: formatUiText(uiText.voiceControl.switchingScenario, { scenarioKey }),
    };
  }, [addTranscriptBreadcrumb, agentSetKey, defaultAgentSetKey, disconnectFromRealtime, pathname, router, schedulePostToolAction, searchParams]);

  const requestAgentChange = useCallback(async (agentName: string) => {
    addTranscriptBreadcrumb('Voice agent switch request', { agentName });
    const agents = selectedAgentConfigSet ?? [];
    if (!agents.some((agent) => agent.name === agentName)) {
      return {
        success: false,
        message: formatUiText(uiText.voiceControl.unknownAgent, { agentName }),
      };
    }
    if (agentName === selectedAgentName) {
      return {
        success: true,
        message: formatUiText(uiText.voiceControl.alreadyWithAgent, { agentName }),
      };
    }

    schedulePostToolAction(() => {
      disconnectFromRealtime();
      setSelectedAgentName(agentName);
      pendingVoiceReconnectRef.current = true;
    });
    return {
      success: true,
      message: formatUiText(uiText.voiceControl.switchingAgent, { agentName }),
    };
  }, [addTranscriptBreadcrumb, disconnectFromRealtime, schedulePostToolAction, selectedAgentConfigSet, selectedAgentName]);

  const connectToRealtime = useCallback(async (source: "auto" | "manual" = "manual") => {
    if (sdkScenarioMap[agentSetKey]) {
      if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
        console.info(
          "[connectToRealtime] ignored because status=%s (source=%s)",
          sessionStatus,
          source,
        );
        return;
      }

      try {
        const EPHEMERAL_KEY = await fetchEphemeralKey();
        if (!EPHEMERAL_KEY) return;

        // Ensure the selectedAgentName is first so that it becomes the root
        const reorderedAgents = [...sdkScenarioMap[agentSetKey]];
        const idx = reorderedAgents.findIndex((a) => a.name === selectedAgentName);
        if (idx > 0) {
          const [agent] = reorderedAgents.splice(idx, 1);
          reorderedAgents.unshift(agent);
        }

        const companyName = companyNameByScenario[agentSetKey] ?? chatSupervisorCompanyName;
        const guardrail = createModerationGuardrail(companyName);

        await connect({
          getEphemeralKey: async () => EPHEMERAL_KEY,
          initialAgents: reorderedAgents,
          audioElement: audioElementRef.current ?? undefined,
          outputGuardrails: [guardrail],
          extraContext: {
            addTranscriptBreadcrumb,
            requestScenarioChange,
            requestAgentChange,
            logClientEvent,
          },
        });
      } catch (err) {
        console.error("Error connecting via SDK:", err);
          setSessionStatus("DISCONNECTED");
      }
      return;
    }
  }, [agentSetKey, chatSupervisorCompanyName, connect, createModerationGuardrail, customerServiceRetailCompanyName, fetchEphemeralKey, requestAgentChange, requestScenarioChange, selectedAgentName, sessionStatus]);

  useEffect(() => {
    if (
      pendingVoiceReconnectRef.current &&
      selectedAgentName &&
      sessionStatus === 'DISCONNECTED'
    ) {
      pendingVoiceReconnectRef.current = false;
      connectToRealtime('auto');
    }
  }, [connectToRealtime, selectedAgentName, sessionStatus]);

  const sendSimulatedUserMessage = (text: string) => {
    const id = uuidv4().slice(0, 32);
    addTranscriptMessage(id, "user", text, true);

    sendClientEvent({
      type: 'conversation.item.create',
      item: {
        id,
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    sendClientEvent({ type: 'response.create' }, '(simulated user text message)');
  };

  const updateSession = (shouldTriggerResponse: boolean = false) => {
    // Reflect Push-to-Talk UI state by (de)activating server VAD on the
    // backend. The Realtime SDK supports live session updates via the
    // `session.update` event.
    const serverVadConfig = isPTTActive
      ? null
      : {
          type: 'server_vad' as const,
          threshold: 0.9,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
          create_response: true,
        };

    sendEvent({
      type: 'session.update',
      session: {
        audio: {
          input: {
            turn_detection: serverVadConfig,
          },
        },
      },
    });

    if (shouldTriggerResponse) {
      // Auto-trigger without sending a synthetic user utterance.
      sendClientEvent({ type: 'response.create' }, 'initial response trigger');
    }
    return;
  }

  const handleSendTextMessage = () => {
    if (!userText.trim()) return;
    interrupt();

    try {
      sendUserText(userText.trim());
    } catch (err) {
      console.error('Failed to send via SDK', err);
    }

    setUserText("");
  };

  const handleTalkButtonDown = () => {
    if (sessionStatus !== 'CONNECTED') return;
    interrupt();

    setIsPTTUserSpeaking(true);
    sendClientEvent({ type: 'input_audio_buffer.clear' }, 'clear PTT buffer');

    // No placeholder; we'll rely on server transcript once ready.
  };

  const handleTalkButtonUp = () => {
    if (sessionStatus !== 'CONNECTED' || !isPTTUserSpeaking)
      return;

    setIsPTTUserSpeaking(false);
    sendClientEvent({ type: 'input_audio_buffer.commit' }, 'commit PTT');
    sendClientEvent({ type: 'response.create' }, 'trigger response PTT');
  };

  const onToggleConnection = () => {
    if (sessionStatus === "CONNECTED") {
      disconnectFromRealtime();
      return;
    }

    if (sessionStatus === "CONNECTING") {
      console.info("[App] Cancelling in-flight connection attempt");
      disconnectFromRealtime();
      return;
    }

    connectToRealtime();
  };

  const handleAgentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newAgentConfig = e.target.value;
    if (!allAgentSets[newAgentConfig]) return;

    disconnectFromRealtime();

    const next = new URLSearchParams(searchParams.toString());
    if (newAgentConfig === defaultAgentSetKey) {
      next.delete("agentConfig");
    } else {
      next.set("agentConfig", newAgentConfig);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const handleSelectedAgentChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const newAgentName = e.target.value;
    // Reconnect session with the newly selected agent as root so that tool
    // execution works correctly.
    disconnectFromRealtime();
    setSelectedAgentName(newAgentName);
    // connectToRealtime will be triggered by effect watching selectedAgentName
  };

  // Because we need a new connection, refresh the page when codec changes
  const handleCodecChange = (newCodec: string) => {
    const url = new URL(window.location.toString());
    url.searchParams.set("codec", newCodec);
    window.location.replace(url.toString());
  };

  useEffect(() => {
    const storedPushToTalkUI = localStorage.getItem("pushToTalkUI");
    if (storedPushToTalkUI) {
      setIsPTTActive(storedPushToTalkUI === "true");
    }
    const storedLogsExpanded = localStorage.getItem("logsExpanded");
    if (storedLogsExpanded) {
      setIsEventsPaneExpanded(storedLogsExpanded === "true");
    }
    const storedAudioPlaybackEnabled = localStorage.getItem(
      "audioPlaybackEnabled"
    );
    if (storedAudioPlaybackEnabled) {
      setIsAudioPlaybackEnabled(storedAudioPlaybackEnabled === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("pushToTalkUI", isPTTActive.toString());
  }, [isPTTActive]);

  useEffect(() => {
    localStorage.setItem("logsExpanded", isEventsPaneExpanded.toString());
  }, [isEventsPaneExpanded]);

  useEffect(() => {
    localStorage.setItem(
      "audioPlaybackEnabled",
      isAudioPlaybackEnabled.toString()
    );
  }, [isAudioPlaybackEnabled]);

  useEffect(() => {
    if (audioElementRef.current) {
      if (isAudioPlaybackEnabled) {
        audioElementRef.current.muted = false;
        audioElementRef.current.play().catch((err) => {
          console.warn("Autoplay may be blocked by browser:", err);
        });
      } else {
        // Mute and pause to avoid brief audio blips before pause takes effect.
        audioElementRef.current.muted = true;
        audioElementRef.current.pause();
      }
    }

    // Toggle server-side audio stream mute so bandwidth is saved when the
    // user disables playback. 
    try {
      mute(!isAudioPlaybackEnabled);
    } catch (err) {
      console.warn('Failed to toggle SDK mute', err);
    }
  }, [isAudioPlaybackEnabled]);

  // Ensure mute state is propagated to transport right after we connect or
  // whenever the SDK client reference becomes available.
  useEffect(() => {
    if (sessionStatus === 'CONNECTED') {
      try {
        mute(!isAudioPlaybackEnabled);
      } catch (err) {
        console.warn('mute sync after connect failed', err);
      }
    }
  }, [sessionStatus, isAudioPlaybackEnabled]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED" && audioElementRef.current?.srcObject) {
      // The remote audio stream from the audio element.
      const remoteStream = audioElementRef.current.srcObject as MediaStream;
      startRecording(remoteStream);
    }

    // Clean up on unmount or when sessionStatus is updated.
    return () => {
      stopRecording();
    };
  }, [sessionStatus]);

  return (
    <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800 relative">
      <div className="p-5 text-lg font-semibold flex justify-between items-center">
        <div
          className="flex items-center cursor-pointer"
          onClick={() => window.location.reload()}
        >
          <div>
            <Image
              src="/openai-logomark.svg"
              alt={uiText.header.logoAlt}
              width={20}
              height={20}
              className="mr-2"
            />
          </div>
          <div>
            {uiText.header.titleMain}{" "}
            <span className="text-gray-500">{uiText.header.titleAccent}</span>
          </div>
        </div>
        <div className="flex items-center">
          <label className="flex items-center text-base gap-1 mr-2 font-medium">
            {uiText.header.scenarioLabel}
          </label>
          <div className="relative inline-block">
            <select
              value={agentSetKey}
              onChange={handleAgentChange}
              className="appearance-none border border-gray-300 rounded-lg text-base px-2 py-1 pr-8 cursor-pointer font-normal focus:outline-none"
            >
              {Object.keys(allAgentSets).map((agentKey) => (
                <option key={agentKey} value={agentKey}>
                  {agentSetMetadata[agentKey]?.label ?? agentKey}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-gray-600">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 10.44l3.71-3.21a.75.75 0 111.04 1.08l-4.25 3.65a.75.75 0 01-1.04 0L5.21 8.27a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>

          {agentSetKey && (
            <div className="flex items-center ml-6">
              <label className="flex items-center text-base gap-1 mr-2 font-medium">
                {uiText.header.agentLabel}
              </label>
              <div className="relative inline-block">
                <select
                  value={selectedAgentName}
                  onChange={handleSelectedAgentChange}
                  className="appearance-none border border-gray-300 rounded-lg text-base px-2 py-1 pr-8 cursor-pointer font-normal focus:outline-none"
                >
                  {selectedAgentConfigSet?.map((agent) => (
                    <option key={agent.name} value={agent.name}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-gray-600">
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 10.44l3.71-3.21a.75.75 0 111.04 1.08l-4.25 3.65a.75.75 0 01-1.04 0L5.21 8.27a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {sessionError && (
        <div className="mx-5 -mt-3 mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formatUiText(uiText.session.errorMessageTemplate, {
            error: sessionError,
          })}
        </div>
      )}

      <div className="flex flex-1 gap-2 px-2 overflow-hidden relative">
        <Transcript
          userText={userText}
          setUserText={setUserText}
          onSendMessage={handleSendTextMessage}
          downloadRecording={downloadRecording}
          canSend={
            sessionStatus === "CONNECTED"
          }
        />

        <Events isExpanded={isEventsPaneExpanded} />
      </div>

      <BottomToolbar
        sessionStatus={sessionStatus}
        onToggleConnection={onToggleConnection}
        isPTTActive={isPTTActive}
        setIsPTTActive={setIsPTTActive}
        isPTTUserSpeaking={isPTTUserSpeaking}
        handleTalkButtonDown={handleTalkButtonDown}
        handleTalkButtonUp={handleTalkButtonUp}
        isEventsPaneExpanded={isEventsPaneExpanded}
        setIsEventsPaneExpanded={setIsEventsPaneExpanded}
        isAudioPlaybackEnabled={isAudioPlaybackEnabled}
        setIsAudioPlaybackEnabled={setIsAudioPlaybackEnabled}
        codec={urlCodec}
        onCodecChange={handleCodecChange}
      />
    </div>
  );
}

export default App;
