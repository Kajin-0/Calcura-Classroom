import { resolveCalcuraPreviewTarget } from '../src/features/assignments/calcuraPreviewTarget';

export function classroomSecurityPolicy(env: Record<string, string>): string {
  const connections = ["'self'"];
  if (env.VITE_SUPABASE_URL?.trim()) {
    const url = new URL(env.VITE_SUPABASE_URL.trim());
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.protocol === 'http:' &&
        !['localhost', '127.0.0.1'].includes(url.hostname))
    )
      throw new Error('Invalid public Supabase origin for CSP');
    connections.push(url.origin, url.origin.replace(/^http/, 'ws'));
  }
  const preview = resolveCalcuraPreviewTarget(env);
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connections.join(' ')}`,
    `frame-src ${preview?.origin ?? "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
