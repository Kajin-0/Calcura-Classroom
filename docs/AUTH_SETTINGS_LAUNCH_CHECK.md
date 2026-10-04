# Auth settings — bounded launch check

Observed 2026-10-04 against project `qsuacjqcrpswognhhikv` using public configuration
and metadata only. No user contents, password values or Auth credentials exported.

Verified public settings: email enabled; signup enabled; email confirmation
required; anonymous and phone sign-in disabled; listed social providers, SAML and
passkeys disabled. The product UI uses email OTP. Aggregate metadata still reports
six password-bearing accounts, so password authentication cannot be dismissed
merely because it is absent from the UI. Security advisor still reports leaked
password protection disabled.

Available MCP methods do not expose full Auth administration or a settings update;
no Management API credential is provisioned in the operator environment. Plan and
feature availability cannot be established by project health. **No Auth setting
mutation was performed** and working OTP behavior was not changed.

Owner Dashboard checklist, project verified before any action:

1. **Authentication → Sign In / Providers → Email**: confirm password surface and
   leaked-password protection. Enable protection if the existing plan supports it
   and no unexpected paid upgrade is required. Current [Supabase password
   security docs](https://supabase.com/docs/guides/auth/password-security) state
   protection is available on Pro and above. Do not change plan or disable working
   email/OTP authentication solely to clear the advisor.
2. In that Email page, record actual OTP expiry and send cooldown; inspect
   **Authentication → Rate Limits** and **Bot and Abuse Protection** for current
   limits/CAPTCHA. These are not observable from public `/auth/v1/settings`.
   Do not invent defaults or enable a client-incompatible challenge.
3. **Authentication → URL Configuration**: verify the production Site/Classroom
   redirect allowlist; **Multi-Factor Authentication**: record actual configuration.
   Avoid speculative redirect/MFA edits. Public settings do not prove these values.

Record a dated, non-secret configuration summary and advisor recheck after any
approved narrow change. The OTP/session/security regressions remain the authority
for current frontend behavior, not proof of unobserved dashboard settings.
