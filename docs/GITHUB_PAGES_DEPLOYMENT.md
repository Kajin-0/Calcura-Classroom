# Classroom GitHub Pages hosting

Calcura Classroom's teacher SPA is deployed from `main` to GitHub Pages. It is
separate from the public marketing page at `https://calcura.study/classroom/`.
The intended production teacher URL is `https://classroom.calcura.study`.

## Workflow

`.github/workflows/deploy-pages.yml` builds with Node 24 and `npm ci`, then
uploads the Vite `dist/` artifact using the GitHub Pages Actions deployment
workflow. GitHub's `configure-pages` output determines the build base path:
the default repository Pages URL uses its repository subpath, and the eventual
custom-domain deployment uses `/`. Vite asset URLs and React Router's basename
are generated from the same base path, so local development and the custom
domain remain root-mounted.

The build copies `dist/index.html` to `dist/404.html`. GitHub Pages serves this
fallback for direct deep-route requests; root-safe assets load the same SPA,
and BrowserRouter then renders the requested route. The fallback is prepared
after the build and does not replace or affect Calcura-Site's marketing page.

## GitHub repository variables

Add these as repository **Variables**, not Secrets. They are included in the
browser bundle and are public by design:

| Variable                        | Required production value                  | Notes                                                                                |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `VITE_SUPABASE_URL`             | `https://qsuacjqcrpswognhhikv.supabase.co` | Existing production Supabase URL; validated by the workflow.                         |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The project's browser-publishable key      | A legacy `anon` JWT is accepted. Service-role and Supabase secret keys are rejected. |
| `VITE_CALCURA_APP_URL`          | `https://calcura.study/`                   | Calcura-owned problem preview provider.                                              |

No Stripe, service-role, database, webhook, or other server credential belongs
in these variables or the Pages workflow.

## Initial enablement and custom domain

Before the first workflow can deploy, repository Pages must be enabled with
source **GitHub Actions**. Confirm a successful deployment at the default URL
reported by the Pages deployment job before configuring a custom domain. Then
set the Pages custom domain to `classroom.calcura.study` and configure the
domain-provider DNS record only after confirming GitHub's current target. Do
not replace the separate `https://calcura.study/classroom/` marketing page.
