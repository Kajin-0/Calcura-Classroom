# Authentication contract

## Shared identity

Classroom uses the same Supabase project and Auth users as Calcura. Do not create a second account store or identity provider. A user signing in to either application will have the same Supabase `user.id`.

## Current flow

```text
Email → send OTP → enter six digits → verify email OTP → /app
```

The client uses `signInWithOtp` with `shouldCreateUser: true`, then `verifyOtp` with `type: 'email'`. Supabase persists and refreshes the session. Auth state changes are subscribed through the Supabase client. Classroom does not use passwords, OAuth, or magic-link URL navigation in this foundation.

Configuration is parsed centrally in `src/lib/supabase/config.ts`. A client is constructed only when the URL and publishable key are valid. The client uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, with persisted session, automatic token refresh, and URL session detection disabled to match Calcura's typed OTP flow.

## Email delivery

OTP delivery uses the existing Calcura Supabase Auth project and its email template/SMTP configuration. Production delivery changes belong in the Supabase project operations, not this browser repository. Do not put SMTP credentials in this repository or in Vite variables.

## Error handling

Input is normalized before submission. Provider errors are mapped to useful general messages; raw provider text, OTPs, access tokens, refresh tokens, and configuration secrets are not logged. Resend is locally disabled for 60 seconds while Supabase remains the rate-limit authority.

## Not authorization

An authenticated session identifies a user but does not grant workspace or class access. Workspace roles, enrollment, plans, and entitlements are deferred. Do not use `user_metadata` as an authorization source. Protected product data must be enforced by server-side authorization and database RLS.
