import { requiredEnv } from './runtime.ts';
import { parseTrustedAppOrigin } from './appOrigin.ts';

const ALLOWED_HEADERS = 'authorization, apikey, content-type, x-client-info';
// Billing requests contain only a workspace UUID and, for checkout, an interval.
// Bound actual streamed bytes; Content-Length is not a trusted size authority.
export const MAX_BILLING_JSON_BYTES = 16 * 1024;

function appOrigin(): string {
  return parseTrustedAppOrigin(requiredEnv('APP_ORIGIN'));
}

export function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  });
  const origin = request.headers.get('Origin');
  if (origin && origin === appOrigin()) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  return headers;
}

export function jsonResponse(
  request: Request,
  payload: unknown,
  status = 200,
): Response {
  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(payload), { status, headers });
}

export function rejectDisallowedOrigin(request: Request): Response | null {
  const origin = request.headers.get('Origin');
  if (origin && origin !== appOrigin()) {
    return new Response('Forbidden', { status: 403 });
  }
  return null;
}

export function optionsResponse(request: Request): Response {
  const disallowed = rejectDisallowedOrigin(request);
  if (disallowed) return disallowed;
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (!request.body) return null;
    reader = request.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BILLING_JSON_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  } finally {
    reader?.releaseLock();
  }
}

export function logBillingEvent(fields: Record<string, unknown>): void {
  console.info(JSON.stringify({ scope: 'classroom_billing', ...fields }));
}
