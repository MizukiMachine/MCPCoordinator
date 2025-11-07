import { TextEncoder, TextDecoder } from 'util';

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
