/**
 * Appels à l'API locale du modèle et des captures (voir `contract.ts`).
 */
import {
  CAPTURES_API,
  CLIENT_HEADER,
  MODEL_API,
  type CaptureFileInfo,
  type CoefficientChange,
  type ModelFileState,
} from './contract.ts';

async function check(res: Response): Promise<Response> {
  if (res.ok) return res;
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // Corps non JSON : le code HTTP suffit.
  }
  throw new Error(message);
}

const WRITE_HEADERS = { [CLIENT_HEADER]: '1' };

export async function fetchModelFile(): Promise<ModelFileState> {
  return (await (await check(await fetch(MODEL_API))).json()) as ModelFileState;
}

export async function saveModelFile(changes: CoefficientChange[]): Promise<ModelFileState> {
  const res = await fetch(MODEL_API, {
    method: 'PUT',
    headers: { ...WRITE_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes }),
  });
  return (await (await check(res)).json()) as ModelFileState;
}

function captureUrl(name: string): string {
  return `${CAPTURES_API}/${encodeURIComponent(name)}`;
}

export async function listCaptureFiles(): Promise<CaptureFileInfo[]> {
  return (await (await check(await fetch(CAPTURES_API))).json()) as CaptureFileInfo[];
}

export async function readCaptureFile(name: string): Promise<string> {
  return (await check(await fetch(captureUrl(name)))).text();
}

export async function writeCaptureFile(name: string, text: string): Promise<void> {
  await check(
    await fetch(captureUrl(name), {
      method: 'PUT',
      headers: { ...WRITE_HEADERS, 'Content-Type': 'application/json' },
      body: text,
    }),
  );
}

export async function deleteCaptureFile(name: string): Promise<void> {
  await check(await fetch(captureUrl(name), { method: 'DELETE', headers: WRITE_HEADERS }));
}
