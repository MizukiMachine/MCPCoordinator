import { File as NodeFile, Blob as NodeBlob } from 'node:buffer';
import { TextEncoder, TextDecoder } from 'util';
import React from 'react';

if (!globalThis.TextEncoder) {
  // @ts-ignore
  globalThis.TextEncoder = TextEncoder;
}
if (!globalThis.TextDecoder) {
  // @ts-ignore
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}

if (typeof globalThis.RTCPeerConnection === 'undefined') {
  class FakeRTCPeerConnection {
    getTransceivers() {
      return [];
    }
  }
  // @ts-ignore
  globalThis.RTCPeerConnection = FakeRTCPeerConnection;
}

if (typeof globalThis.RTCRtpSender === 'undefined') {
  // @ts-ignore
  globalThis.RTCRtpSender = {
    getCapabilities: () => null,
  };
}

if (typeof globalThis.MediaStream === 'undefined') {
  class FakeMediaStream {}
  // @ts-ignore
  globalThis.MediaStream = FakeMediaStream;
}

if (typeof globalThis.SharedArrayBuffer === 'undefined') {
  // jsdom expects SharedArrayBuffer to exist when loading whatwg-url.
  // Fallback to ArrayBuffer so that webidl-conversions can inspect the prototype safely.
  // @ts-ignore
  globalThis.SharedArrayBuffer = ArrayBuffer;
}

// Vitest (jsdom) does not inject React automatically; ensure classic runtime works for JSX.
// @ts-ignore
globalThis.React = React;

// JSDOM で File/Blob が未定義な環境向けのフォールバック
if (typeof globalThis.File === 'undefined') {
  // @ts-ignore
  globalThis.File = NodeFile;
}
if (typeof globalThis.Blob === 'undefined') {
  // @ts-ignore
  globalThis.Blob = NodeBlob;
}
