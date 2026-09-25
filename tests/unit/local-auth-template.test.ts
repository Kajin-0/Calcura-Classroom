import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('local OTP email template', () => {
  it('uses the six-digit OTP token in local Supabase configuration', () => {
    const config = read('supabase/config.toml');
    const template = read('supabase/templates/magic_link.html');

    expect(config).toContain('[auth.email.template.magic_link]');
    expect(config).toContain(
      'content_path = "./supabase/templates/magic_link.html"',
    );
    expect(template).toContain('{{ .Token }}');
    expect(template).toMatch(/six-digit code/i);
    expect(template).not.toContain('{{ .ConfirmationURL }}');
  });

  it('keeps local email delivery on the Mailpit catcher', () => {
    const config = read('supabase/config.toml');
    expect(config).toContain('[local_smtp]');
    expect(config).toMatch(/port\s*=\s*54324/);
    expect(config).toMatch(/# \[auth\.email\.smtp\]/);
  });
});
