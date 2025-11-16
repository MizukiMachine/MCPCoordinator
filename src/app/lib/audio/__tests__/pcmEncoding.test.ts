import { describe, expect, it } from 'vitest';

import { encodeFloat32ToPCM16Base64 } from '../../audio/pcmEncoding';

function decodeInt16Samples(base64: string): number[] {
  const buffer = Buffer.from(base64, 'base64');
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const values: number[] = [];
  for (let offset = 0; offset < view.byteLength; offset += 2) {
    values.push(view.getInt16(offset, true));
  }
  return values;
}

describe('encodeFloat32ToPCM16Base64', () => {
  it('converts mono float samples to signed 16-bit PCM base64', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const base64 = encodeFloat32ToPCM16Base64(samples);

    const decoded = decodeInt16Samples(base64);
    expect(decoded).toEqual([
      0,
      Math.round(0.5 * 0x7fff),
      Math.round(-0.5 * 0x8000),
      0x7fff,
      -0x8000,
    ]);
  });

  it('clamps out-of-range samples before encoding', () => {
    const samples = new Float32Array([2, -2, Number.NaN, 0]);
    const decoded = decodeInt16Samples(encodeFloat32ToPCM16Base64(samples));
    expect(decoded).toEqual([0x7fff, -0x8000, 0, 0]);
  });
});
