---
title: "Auth setup (Identity Platform / Firebase)"
description: "Enable sign-in and protect the API with Firebase ID tokens."
intent: getting-started
audience: ["internal"]
stability: beta
canonical: "https://docs.vibeswitch.ai/getting-started/auth-setup"
version: "current"
tags: ["auth", "getting-started"]
---

## Purpose
Turn on authentication so that (a) the React UI prompts users to sign in with Google, and (b) the Fastify API rejects calls that don't carry a valid Firebase ID token. This guide walks you through the minimal configuration for local dev and production, the difference between client and server env vars, and the most common wiring mistakes.

## Prerequisites
- **Required**: A Google Cloud project with Identity Platform or Firebase Authentication enabled.
- **Required**: Ability to set environment variables for both the server (runtime) and the client (build time).
- **Required**: At least one sign-in method enabled in Firebase Authentication (Google is the default).
- **Optional**: A list of authorized email addresses if you want to restrict sign-in. Configure this in Firebase or via allowlists in your deployment.

## Inputs
- **Server env** (runtime):
  - `AUTH_REQUIRED=true` — flips the API into protected mode.
  - `FIREBASE_PROJECT_ID=<gcp-project-id>` — must match the project the client tokens come from.
  - `GOOGLE_APPLICATION_CREDENTIALS=./secrets/service-account.json` — local dev only. In production, use ADC instead (attach a service account to the workload).
- **Client env** (`client/.env.local`, baked at build time):
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`

All three `VITE_FIREBASE_*` values come from Firebase Console → Project Settings → General → "Your apps" → Web app → Config. These values are designed to be public — they identify the project, they don't grant access. The security boundary is the server verifying the ID token.

## Outputs
- **Protected API routes** reject calls without `Authorization: Bearer <idToken>` with `401 Unauthorized`.
- **Signed-in UI**: the React app shows a Google sign-in screen on first load; after sign-in, it attaches the ID token to every API call automatically.
- **Token refresh**: Firebase's client SDK refreshes tokens before expiry — users don't re-sign-in every hour.
- **User visibility**: `GET /api/auth/config` reports the current posture so the client knows whether to prompt.

## Constraints
- **Production should use ADC, not JSON keys.** A service account JSON file in a container image is a credential-exfiltration risk. Attach a service account to the workload (Cloud Run, GKE workload identity, etc.) and let `firebase-admin` pick it up automatically.
- **Client config is build-time.** After changing any `VITE_*` value you must rebuild `client/dist` and redeploy — restarting the server has no effect because the browser bundle is already fixed.
- **Project IDs must match.** The server's `FIREBASE_PROJECT_ID` and the client's `VITE_FIREBASE_PROJECT_ID` must refer to the same Google Cloud project. Token issuer/audience checks fail otherwise.
- **Authorized domains matter.** Firebase rejects sign-in from domains not on its "authorized domains" list. Add both `localhost` (for dev) and your production domain.
- **Public endpoints stay public.** `GET /api/auth/config`, `/api/openapi.json`, and `/api/docs/index` (for non-gated pages) don't require auth — they're needed to bootstrap the UI.

## Examples

### Check current auth posture

```bash runnable
curl -sS http://localhost:3000/api/auth/config
```

Expected: `{"authRequired":true}` after you enable auth, `{"authRequired":false}` before. The UI uses this response to decide whether to render the sign-in screen.

### Enable auth (local dev)

1. In Firebase Console, enable Google sign-in under **Authentication → Sign-in method**.
2. Add `localhost` to **Authentication → Settings → Authorized domains** if it isn't there.
3. Create `./secrets/service-account.json` — download a service account key from **IAM → Service Accounts** (for local dev only; never commit or ship this file).
4. Set root `.env`:

```env
AUTH_REQUIRED=true
FIREBASE_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=./secrets/service-account.json
```

5. Set `client/.env.local`:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
```

6. Rebuild the client and restart the server:

```bash runnable
npm run client:build
npm run start
```

Expected: the UI shows a Google sign-in screen. After signing in, the header shows a **Sign out** button and the report loads normally.

### Enable auth (production)

Same variables as local dev, except:

- **Do not** set `GOOGLE_APPLICATION_CREDENTIALS`. Instead, attach a service account to the workload (Cloud Run runtime service account, GKE workload identity, Fly Machine service account, etc.). `firebase-admin` picks this up via ADC automatically.
- **Do** add your production domain to Firebase Authentication's authorized domains list.
- **Do** build `client/dist` with the prod `VITE_*` values in your CI pipeline.

### Verify end-to-end after enabling

```bash runnable
curl -sS http://localhost:3000/api/auth/config
```

Expected: `{"authRequired":true}`.

```bash runnable
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/report/today
```

Expected: `401` (because you haven't passed a Bearer token). From the browser, after signing in, the same endpoint should return `200`.

## Troubleshooting
- **Auth required but UI shows a blank/config error screen**
  - **Check**: `VITE_FIREBASE_*` variables were set at build time. Open devtools → Console — Firebase prints a clear error if config is incomplete.
  - **Fix**: set them in `client/.env.local`, rebuild `client/dist`, redeploy.
- **401 from the server right after sign-in**
  - **Check**: the server can verify tokens. Look at server logs — `firebase-admin` will log why verification failed (wrong project, clock skew, unreadable credentials).
  - **Fix**: confirm the runtime service account or `GOOGLE_APPLICATION_CREDENTIALS` path. Make sure the project IDs match on both sides.
- **Google sign-in popup closes with "unauthorized domain"**
  - **Check**: the domain (including any preview URL) is in Firebase's authorized domains list.
  - **Fix**: add it in Firebase Console and retry. Changes propagate within a minute.
- **"Token expired" after leaving the tab open**
  - **Check**: whether the client SDK is refreshing tokens (the default behavior).
  - **Fix**: keep `firebase/auth` imports up to date, don't block network access to `securetoken.googleapis.com`.
- **Auth works locally but fails in Cloud Run**
  - **Check**: the Cloud Run revision has a runtime service account; that account has the permission to verify Firebase tokens for your project.
  - **Fix**: set the service account on the revision. Do not ship a JSON key into the image.
- **UI keeps asking to sign in on every refresh**
  - **Check**: third-party cookies / storage blocked in the browser, or Firebase auth domain blocked by a content policy.
  - **Fix**: allow storage for the auth domain, or use the app in a standard browser profile.
- **Server logs say "Could not load credentials"**
  - **Check**: `GOOGLE_APPLICATION_CREDENTIALS` points at a real file, and the process user can read it.
  - **Fix**: absolute path, correct permissions. In prod, remove `GOOGLE_APPLICATION_CREDENTIALS` entirely and rely on ADC.

See also: [Auth model](../concepts/auth-model.md) for the conceptual view of how tokens flow.
