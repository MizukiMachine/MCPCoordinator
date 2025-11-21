import { describe, expect, it } from "vitest";

import { normalizeTranscriptEvent, upsertTranscriptItems } from "../useSessionSpectator";
import type { SpectatorTranscript } from "@/app/types";

describe("useSessionSpectator helpers", () => {
  it("normalizes transcription events with fallback item id", () => {
    const event = {
      type: "response.output_audio_transcript.delta",
      item_id: "abc",
      delta: "hello ",
    };
    const normalized = normalizeTranscriptEvent(event);
    expect(normalized).toMatchObject({
      itemId: "abc",
      stage: "delta",
      text: "hello ",
    });
  });

  it("merges delta then completed events into transcripts", () => {
    const initial: SpectatorTranscript[] = [];
    const delta = {
      itemId: "item1",
      stage: "delta" as const,
      text: "hello ",
      raw: { type: "response.output_audio_transcript.delta" },
    };
    const completed = {
      itemId: "item1",
      stage: "completed" as const,
      text: "hello world",
      raw: { type: "response.output_audio_transcript.done" },
    };

    const withDelta = upsertTranscriptItems(initial, delta);
    expect(withDelta[0]).toMatchObject({
      itemId: "item1",
      text: "hello ",
      status: "STREAMING",
      lastEventType: "response.output_audio_transcript.delta",
    });

    const merged = upsertTranscriptItems(withDelta, completed);
    expect(merged[0]).toMatchObject({
      itemId: "item1",
      text: "hello world",
      status: "COMPLETED",
      lastEventType: "response.output_audio_transcript.done",
    });
  });

  it("caps transcript list length to 50 items", () => {
    let state: SpectatorTranscript[] = [];
    for (let i = 0; i < 55; i += 1) {
      state = upsertTranscriptItems(state, {
        itemId: `id-${i}`,
        stage: "completed",
        text: "x",
        raw: {},
      });
    }
    expect(state.length).toBe(50);
  });
});
