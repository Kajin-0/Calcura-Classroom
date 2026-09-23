export interface SupabaseEnvSource {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

export type SupabaseConfig =
  | { configured: true; url: string; publishableKey: string }
  | {
      configured: false;
      url: string;
      publishableKey: string;
      problem: 'missing_url' | 'invalid_url' | 'missing_publishable_key';
    };

const environment = (): SupabaseEnvSource => {
  try {
    return import.meta.env as unknown as SupabaseEnvSource;
  } catch {
    return {};
  }
};

export function readSupabaseConfig(
  env: SupabaseEnvSource = environment(),
): SupabaseConfig {
  const url = String(env.VITE_SUPABASE_URL ?? '').trim();
  const publishableKey = String(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();

  if (!url)
    return { configured: false, url, publishableKey, problem: 'missing_url' };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { configured: false, url, publishableKey, problem: 'invalid_url' };
  }
  const isLocalHttp =
    parsedUrl.protocol === 'http:' &&
    ['localhost', '127.0.0.1', 'supabase_kong_calcura-classroom'].includes(
      parsedUrl.hostname,
    );
  if (parsedUrl.protocol !== 'https:' && !isLocalHttp) {
    return { configured: false, url, publishableKey, problem: 'invalid_url' };
  }
  if (!publishableKey) {
    return {
      configured: false,
      url,
      publishableKey,
      problem: 'missing_publishable_key',
    };
  }

  return { configured: true, url: parsedUrl.origin, publishableKey };
}

export function supabaseConfigMessage(
  problem: SupabaseConfig extends infer Config
    ? Config extends { configured: false; problem: infer Problem }
      ? Problem
      : never
    : never,
): string {
  switch (problem) {
    case 'missing_url':
      return 'Add VITE_SUPABASE_URL to your local environment to enable sign in.';
    case 'missing_publishable_key':
      return 'Add VITE_SUPABASE_PUBLISHABLE_KEY to your local environment to enable sign in.';
    case 'invalid_url':
      return 'The Supabase URL is invalid. Check VITE_SUPABASE_URL in your local environment.';
  }
}
