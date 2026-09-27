interface EdgeRuntime {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
}

const edgeRuntime = (globalThis as typeof globalThis & { Deno?: EdgeRuntime })
  .Deno;

if (!edgeRuntime) {
  throw new Error('This module must run inside a Supabase Edge Function.');
}

export const runtime = edgeRuntime;

export function requiredEnv(name: string): string {
  const value = runtime.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}
