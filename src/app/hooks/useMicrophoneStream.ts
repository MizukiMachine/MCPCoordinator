import { useCallback, useEffect, useRef } from 'react';

import { encodeFloat32ToPCM16Base64 } from '@/app/lib/audio/pcmEncoding';
import type { SessionStatus } from '@/app/types';
import type { SendAudioChunkOptions } from './useRealtimeSession';
import {
  SpeechActivityDetector,
  type SpeechActivityDetectorTuning,
} from '@/app/lib/audio/speechActivityDetector';

const TARGET_SAMPLE_RATE = 24000;
const PROCESSOR_BUFFER_SIZE = 4096;
const SAMPLES_PER_CHUNK = 9600;

interface UseMicrophoneStreamOptions {
  sessionStatus: SessionStatus;
  sendAudioChunk: (base64: string, options?: SendAudioChunkOptions) => Promise<void>;
  enabled?: boolean;
  logClientEvent?: (payload: Record<string, any>, tag?: string, metadata?: Record<string, any>) => void;
  speechDetectionEnabled?: boolean;
  speechDetectionConfig?: SpeechActivityDetectorTuning;
  onSpeechDetected?: () => void;
}

export function useMicrophoneStream({
  sessionStatus,
  sendAudioChunk,
  enabled = true,
  logClientEvent,
  speechDetectionEnabled = true,
  speechDetectionConfig,
  onSpeechDetected,
}: UseMicrophoneStreamOptions) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const pendingSamplesRef = useRef<number[]>([]);
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const streamingEnabledRef = useRef(false);
  const speechDetectorRef = useRef<SpeechActivityDetector | null>(null);
  const speechDetectionEnabledRef = useRef<boolean>(speechDetectionEnabled);
  const speechDetectionConfigRef = useRef<SpeechActivityDetectorTuning | undefined>(speechDetectionConfig);
  const onSpeechDetectedRef = useRef<(() => void) | undefined>(onSpeechDetected);

  useEffect(() => {
    streamingEnabledRef.current = Boolean(enabled && sessionStatus === 'CONNECTED');
  }, [enabled, sessionStatus]);

  useEffect(() => {
    speechDetectionEnabledRef.current = speechDetectionEnabled !== false;
    if (!speechDetectionEnabledRef.current) {
      speechDetectorRef.current = null;
    }
  }, [speechDetectionEnabled]);

  useEffect(() => {
    speechDetectionConfigRef.current = speechDetectionConfig;
    speechDetectorRef.current = null;
  }, [speechDetectionConfig]);

  useEffect(() => {
    onSpeechDetectedRef.current = onSpeechDetected ?? undefined;
  }, [onSpeechDetected]);

  const cleanupStream = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    if (audioContextRef.current) {
      const context = audioContextRef.current;
      audioContextRef.current = null;
      void context.close().catch(() => {});
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    pendingSamplesRef.current = [];
    speechDetectorRef.current = null;
  }, []);

  const ensureSpeechDetector = useCallback(() => {
    if (!speechDetectionEnabledRef.current) {
      return null;
    }
    if (!speechDetectorRef.current) {
      speechDetectorRef.current = new SpeechActivityDetector({
        sampleRate: TARGET_SAMPLE_RATE,
        ...(speechDetectionConfigRef.current ?? {}),
        onSpeechStart: () => {
          logClientEvent?.(
            {
              type: 'barge_in_detected',
            },
            'barge_in_detected',
          );
          onSpeechDetectedRef.current?.();
        },
      });
    }
    return speechDetectorRef.current;
  }, [logClientEvent]);

  const queueChunkSend = useCallback(
    (chunkBase64: string) => {
      if (!chunkBase64) return;
      sendQueueRef.current = sendQueueRef.current
        .catch(() => {})
        .then(() => sendAudioChunk(chunkBase64))
        .catch((error) => {
          logClientEvent?.(
            {
              type: 'microphone_stream_error',
              message: (error as Error)?.message ?? 'Failed to forward audio chunk',
            },
            'error.microphone_stream',
          );
        });
    },
    [logClientEvent, sendAudioChunk],
  );

  const pushSamples = useCallback(
    (frame: Float32Array) => {
      if (!streamingEnabledRef.current) return;
      if (speechDetectionEnabledRef.current) {
        ensureSpeechDetector()?.process(frame);
      }
      const buffer = pendingSamplesRef.current;
      for (let i = 0; i < frame.length; i += 1) {
        buffer.push(frame[i]);
      }
      while (buffer.length >= SAMPLES_PER_CHUNK) {
        const chunk = buffer.splice(0, SAMPLES_PER_CHUNK);
        queueChunkSend(encodeFloat32ToPCM16Base64(new Float32Array(chunk)));
      }
    },
    [ensureSpeechDetector, queueChunkSend],
  );

  const startMicrophone = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }
    if (mediaStreamRef.current || startPromiseRef.current) {
      return startPromiseRef.current ?? Promise.resolve();
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      logClientEvent?.(
        {
          type: 'microphone_error',
          message: 'MediaDevices API is not available in this browser',
        },
        'microphone_error',
      );
      return;
    }

    const promise = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: TARGET_SAMPLE_RATE,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (!stream) {
          throw new Error('Microphone access denied');
        }
        mediaStreamRef.current = stream;
        const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
        audioContextRef.current = context;
        if (context.state === 'suspended') {
          await context.resume();
        }
        const source = context.createMediaStreamSource(stream);
        sourceRef.current = source;
        const processor = context.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
        processorRef.current = processor;
        processor.onaudioprocess = (event) => {
          pushSamples(event.inputBuffer.getChannelData(0));
        };
        source.connect(processor);
        processor.connect(context.destination);
      } catch (error) {
        cleanupStream();
        logClientEvent?.(
          {
            type: 'microphone_error',
            message: (error as Error)?.message ?? 'Failed to initialize microphone stream',
          },
          'microphone_error',
        );
      }
    })().finally(() => {
      startPromiseRef.current = null;
    });

    startPromiseRef.current = promise;
    return promise;
  }, [cleanupStream, logClientEvent, pushSamples]);

  useEffect(() => {
    if (sessionStatus !== 'CONNECTED' || !enabled) {
      cleanupStream();
      return;
    }
    void startMicrophone();
    return () => {
      cleanupStream();
    };
  }, [cleanupStream, enabled, sessionStatus, startMicrophone]);
}
