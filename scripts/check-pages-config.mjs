import { Buffer } from 'node:buffer';
import { Console } from 'node:console';
import process from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';

const logger = new Console(process.stdout, process.stderr);

const expectedSupabaseHost = 'qsuacjqcrpswognhhikv.supabase.co';
const expectedCalcuraOrigin = 'https://calcura.study';

function requiredValue(env, name) {
  const value = String(env[name] ?? '').trim();
  if (!value) {
    throw new Error(`Missing required GitHub repository variable ${name}.`);
  }
  return value;
}

function parsePublicSupabaseKey(value) {
  if (value.startsWith('sb_publishable_')) return;
  if (value.startsWith('sb_secret_')) {
    throw new Error(
      'VITE_SUPABASE_PUBLISHABLE_KEY is a Supabase secret key; provide a publishable key.',
    );
  }

  const [, payload, signature] = value.split('.');
  if (!payload || !signature) {
    throw new Error(
      'VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable key or a legacy anon JWT.',
    );
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error(
      'VITE_SUPABASE_PUBLISHABLE_KEY is not a valid publishable key or legacy anon JWT.',
    );
  }
  if (claims.role !== 'anon') {
    throw new Error(
      'VITE_SUPABASE_PUBLISHABLE_KEY must not contain a privileged Supabase role.',
    );
  }
}

export function validatePagesConfig(env) {
  const supabaseValue = requiredValue(env, 'VITE_SUPABASE_URL');
  const publishableKey = requiredValue(env, 'VITE_SUPABASE_PUBLISHABLE_KEY');
  const calcuraValue = requiredValue(env, 'VITE_CALCURA_APP_URL');

  let supabaseUrl;
  try {
    supabaseUrl = new URL(supabaseValue);
  } catch {
    throw new Error('VITE_SUPABASE_URL must be a valid HTTPS URL.');
  }
  if (
    supabaseUrl.protocol !== 'https:' ||
    supabaseUrl.hostname !== expectedSupabaseHost ||
    supabaseUrl.pathname !== '/' ||
    supabaseUrl.username ||
    supabaseUrl.password ||
    supabaseUrl.search ||
    supabaseUrl.hash
  ) {
    throw new Error(
      'VITE_SUPABASE_URL must target the configured production Supabase project over HTTPS.',
    );
  }

  parsePublicSupabaseKey(publishableKey);

  let calcuraUrl;
  try {
    calcuraUrl = new URL(calcuraValue);
  } catch {
    throw new Error('VITE_CALCURA_APP_URL must be a valid HTTPS URL.');
  }
  if (
    calcuraUrl.protocol !== 'https:' ||
    calcuraUrl.origin !== expectedCalcuraOrigin ||
    calcuraUrl.pathname !== '/' ||
    calcuraUrl.username ||
    calcuraUrl.password ||
    calcuraUrl.search ||
    calcuraUrl.hash
  ) {
    throw new Error(
      'VITE_CALCURA_APP_URL must be https://calcura.study/ for the production preview bridge.',
    );
  }

  return {
    supabaseHost: supabaseUrl.hostname,
    calcuraOrigin: calcuraUrl.origin,
  };
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  try {
    validatePagesConfig(process.env);
    logger.log(
      'Pages public build configuration validated; values suppressed.',
    );
  } catch (error) {
    logger.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
