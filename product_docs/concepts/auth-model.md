---
title: "Auth model"
description: "How authentication works, when it is required, and how tokens flow."
intent: concepts
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/concepts/auth-model"
version: "current"
tags: ["auth", "concepts"]
---

## Purpose
Explain how VibeSwitch's authentication works as a system: who issues tokens, who verifies them, what's public, what's protected, and what changes between public and protected deployments. The conceptual view here is the counterpart to the step-by-step setup in [Auth setup](https://docs.vibeswitch.ai/getting-started/auth-setup).

## Prerequisites
- **Required**: Basic understanding of Bearer JWT authorization (an access token carried in the `Authorization` header).
- **Useful**: Familiarity with Firebase Auth / Google Identity Platform, though the concept works the same with any OIDC-style provider.

## Inputs
- **Server env**: `AUTH_REQUIRED`, `FIREBASE_PROJECT_ID` (and, in production, a runtime service account).
- **Client env** (build-time): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`.
- **Requests**: protected endpoints expect `Authorization: Bearer <idToken>` from signed-in users.

## Outputs
- **Public mode** (`AUTH_REQUIRED=false`): API routes behave without auth. Anyone can call them.
- **Protected mode** (`AUTH_REQUIRED=true`): the server rejects unauthenticated calls to protected routes with `401`. Public bootstrap endpoints stay reachable.
- **UI behavior**: the app calls `/api/auth/config`, sees `authRequired: true/false`, and renders a sign-in screen or skips it accordingly.

## Constraints
- **Server verification is via Firebase Admin SDK.** The server reuses Google's Application Default Credentials (ADC) to verify ID tokens. Don't reimplement verification.
- **The browser never sees server credentials.** It holds only Firebase web config (API key, auth domain, project ID), which is intentionally public — identity, not authority.
- **Build-time vs. runtime.** Client config is baked into the JS bundle at build time. Server config is read at runtime. Rotations affect different things: changing `VITE_FIREBASE_*` means rebuild + redeploy; changing server env means restart.
- **Tokens expire.** The client SDK refreshes ID tokens before expiry automatically. The server accepts any valid non-expired token from the configured project.
- **Authorization (who can do what) is out of scope here.** This page is about authentication (is the caller signed in?). Role-based authorization is a separate concern; today, the system is effectively flat.

## How a request actually flows

1. **Client boot**: the SPA fetches `GET /api/auth/config`. This endpoint is always public.
2. **If `authRequired: true`**: the UI shows the Firebase sign-in screen. The user signs in with Google; Firebase issues a short-lived ID token held in local storage.
3. **API calls**: every protected `/api/*` request includes `Authorization: Bearer <idToken>`. The Fastify server uses `firebase-admin` (with ADC) to verify the token's signature, issuer, audience, and expiry.
4. **Token refresh**: before expiry, the Firebase client SDK silently refreshes. The user doesn't re-authenticate unless they sign out.
5. **Sign-out**: the UI clears the token and drops back to the sign-in screen. Server-side sessions aren't a thing — the server is stateless with respect to auth.

## Examples

### Detect whether auth is required

```bash runnable
curl -sS http://localhost:3000/api/auth/config
```

Expected: `{"authRequired":true}` or `{"authRequired":false}`. This endpoint is deliberately public so the UI can bootstrap before the user has a token.

### What's always public vs. protected

Always public (even when `AUTH_REQUIRED=true`):

- `/api/auth/config`
- `/api/openapi.json`
- `/api/swagger`
- `/api/docs/index` and `/api/docs/page/:slug` for non-gated pages

Protected when `AUTH_REQUIRED=true`:

- Anything that mutates state (submissions, reports, analysis triggers).
- `/api/report/today`, `/api/chat`, and most read endpoints that return ingested data.
- Gated doc pages (those with `gated: true` in their frontmatter — for example, internal playbooks).

### Client-side code responsibilities

- Call `/api/auth/config` first; render the sign-in screen if required.
- Use the Firebase web SDK to handle sign-in and token lifecycle — don't try to manage tokens by hand.
- Attach `Authorization: Bearer <idToken>` to every fetch.
- On `401`, re-check `/api/auth/config` and refresh the token if needed; if still `401`, prompt the user to sign in again.

### Server-side responsibilities

- Verify tokens via `firebase-admin`, using ADC in production or `GOOGLE_APPLICATION_CREDENTIALS` locally.
- Reject unverified/expired tokens with `401`.
- Never log token bodies or refresh tokens.
- Keep the public endpoints public — breaking bootstrap means the UI can't sign anyone in.

## Troubleshooting
- **Auth required but client shows a blank / "config error" screen**
  - **Check**: the client was built with all three `VITE_FIREBASE_*` values. Look for Firebase init errors in the browser console.
  - **Fix**: set the values, rebuild `client/dist`, redeploy. Don't try to inject them at runtime.
- **Server rejects tokens as invalid**
  - **Check**: the server's `FIREBASE_PROJECT_ID` matches the client's `VITE_FIREBASE_PROJECT_ID`. Check clock skew between server and Firebase (if the server clock is far off, tokens look expired).
  - **Fix**: align project IDs; ensure NTP is running on the server.
- **Works locally but fails in production with `Could not load credentials`**
  - **Check**: in production, the workload needs a runtime service account (ADC). Don't ship a JSON key in the image.
  - **Fix**: attach a service account on Cloud Run / GKE / wherever; drop `GOOGLE_APPLICATION_CREDENTIALS` from prod env.
- **Sign-in closes with "unauthorized domain"**
  - **Check**: the domain (including preview URLs) is listed in Firebase → Authentication → Settings → Authorized domains.
  - **Fix**: add the domain and retry.
- **Everyone shares one account because everyone uses one browser profile**
  - That's expected — the session is browser-scoped. If you need per-user attribution, sign each user into their own browser profile, and consider adding user metadata to the submissions they create.

See [Auth setup](https://docs.vibeswitch.ai/getting-started/auth-setup) for concrete wiring steps.
