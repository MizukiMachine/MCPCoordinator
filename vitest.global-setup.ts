export default async function globalSetup() {
  if (typeof globalThis.SharedArrayBuffer === 'undefined') {
    // @ts-ignore
    globalThis.SharedArrayBuffer = ArrayBuffer;
  }
}
