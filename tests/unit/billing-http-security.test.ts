// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../supabase/functions/_shared/runtime.ts', () => ({
  requiredEnv: () => 'https://classroom.example.test',
}));

import {
  jsonResponse,
  optionsResponse,
  readJsonObject,
  rejectDisallowedOrigin,
} from '../../supabase/functions/_shared/http';

const limit = 16 * 1024;
const request = (body: string, headers = {}) =>
  new Request('https://edge.example.test/billing-summary', {
    method: 'POST',
    body,
    headers,
  });

describe('billing HTTP boundary', () => {
  it('accepts normal billing payloads without trusting extra owner/plan fields', async () => {
    const value = { workspace_id: 'fixture', billing_interval: 'monthly' };
    expect(await readJsonObject(request(JSON.stringify(value)))).toEqual(value);
  });

  it.each(['null', '[]', '"text"', '{invalid', ''])(
    'rejects non-object JSON: %s',
    async (body) => {
      expect(await readJsonObject(request(body))).toBeNull();
    },
  );

  it('accepts the exact byte limit and rejects one byte beyond it', async () => {
    const body = JSON.stringify({ x: 'a'.repeat(limit - 8) });
    expect(new TextEncoder().encode(body).length).toBe(limit);
    expect(await readJsonObject(request(body))).not.toBeNull();
    expect(
      await readJsonObject(request(body.replace('aaa', 'aaaa'))),
    ).toBeNull();
  });

  it('counts UTF-8 bytes rather than characters', async () => {
    expect(
      await readJsonObject(
        request(JSON.stringify({ x: 'é'.repeat(limit / 2) })),
      ),
    ).toBeNull();
  });

  it.each([{}, { 'Content-Length': '1' }, { 'Content-Length': 'invalid' }])(
    'rejects oversized bodies regardless of declared length: %j',
    async (headers) => {
      expect(
        await readJsonObject(
          request(JSON.stringify({ x: 'a'.repeat(limit) }), headers),
        ),
      ).toBeNull();
    },
  );

  it('cancels an oversized stream rather than reading the remaining chunks', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(limit + 1));
      },
      cancel,
    });
    const input = { headers: new Headers(), body: stream } as Request;
    expect(await readJsonObject(input)).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('fails closed on stream errors', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('disconnected'));
      },
    });
    expect(
      await readJsonObject({ headers: new Headers(), body: stream } as Request),
    ).toBeNull();
  });

  it('allows only the configured browser origin; absent Origin still requires handler auth', () => {
    const trusted = request('{}', { Origin: 'https://classroom.example.test' });
    const foreign = request('{}', { Origin: 'https://attacker.example' });
    expect(rejectDisallowedOrigin(trusted)).toBeNull();
    expect(rejectDisallowedOrigin(request('{}'))).toBeNull();
    expect(rejectDisallowedOrigin(foreign)?.status).toBe(403);
    expect(optionsResponse(foreign).status).toBe(403);
    expect(
      optionsResponse(trusted).headers.get('Access-Control-Allow-Origin'),
    ).toBe('https://classroom.example.test');
  });

  it('keeps private JSON responses uncacheable and does not reflect foreign origins', () => {
    const result = jsonResponse(
      request('{}', { Origin: 'https://attacker.example' }),
      {},
      401,
    );
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(result.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
