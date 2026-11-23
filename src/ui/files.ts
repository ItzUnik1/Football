import { Capacitor } from '@capacitor/core';

export const isNative = (): boolean => { try { return Capacitor.isNativePlatform(); } catch { return false; } };

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>));
  return new Uint8Array(await out.arrayBuffer());
}
const canGzip = (): boolean => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/** Text -> bytes, gzip-compressed when the browser supports it (the reader detects either form). */
export async function packText(text: string): Promise<{ bytes: Uint8Array; gz: boolean }> {
  const raw = new TextEncoder().encode(text);
  if (!canGzip()) return { bytes: raw, gz: false };
  try { return { bytes: await pipe(raw, new CompressionStream('gzip')), gz: true }; } catch { return { bytes: raw, gz: false }; }
}
export async function unpackText(bytes: Uint8Array): Promise<string> {
  if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (!canGzip()) throw new Error('This device cannot open compressed save files.');
    return new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip')));
  }
  return new TextDecoder().decode(bytes);
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(s);
}

/** Hands a file to the person: the Android share sheet in the app, a normal download in a browser. */
export async function deliverFile(name: string, bytes: Uint8Array, mime = 'application/octet-stream'): Promise<'shared' | 'downloaded'> {
  if (isNative()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    await Filesystem.writeFile({ path: name, data: toBase64(bytes), directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    await Share.share({ title: name, dialogTitle: 'Save or send this file', files: [uri] });
    return 'shared';
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}

/** Opens the system file chooser. Resolves null if cancelled. */
export function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.style.display = 'none';
    inp.onchange = () => { resolve(inp.files?.[0] ?? null); inp.remove(); };
    inp.oncancel = () => { resolve(null); inp.remove(); };
    document.body.appendChild(inp);
    inp.click();
  });
}
export async function readPickedFile(f: File): Promise<unknown> {
  const text = await unpackText(new Uint8Array(await f.arrayBuffer()));
  try { return JSON.parse(text); } catch { throw new Error('That file is not a valid Touchline file.'); }
}

export async function exitApp(): Promise<void> {
  if (isNative()) { const { App } = await import('@capacitor/app'); await App.exitApp(); return; }
  window.close();
}
