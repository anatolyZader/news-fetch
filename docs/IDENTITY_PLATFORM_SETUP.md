# Identity Platform setup (Google Cloud)

This app uses **Google Identity Platform** (same backend as **Firebase Authentication**). The **server** verifies JWT ID tokens with the **Firebase Admin SDK** (`firebase-admin`). The **web client** signs users in with the **Firebase JS SDK** (modular `firebase/auth`).

Follow these steps **in order**. Times are approximate.

---

## Part A — Google Cloud project and APIs

### 1. Select or create a project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Use an existing project or **Create project**. Note the **Project ID** (e.g. `my-news-app`). You will use it as `FIREBASE_PROJECT_ID` and `VITE_FIREBASE_PROJECT_ID`.

### 2. Enable billing (if required)

Identity Platform may require billing to be enabled on the project. In **Billing**, link a billing account if prompted.

### 3. Enable Identity Platform

1. Go to [Identity Platform](https://console.cloud.google.com/customer-identity) (or search “Identity Platform”).
2. Click **Get started** / **Enable Identity Platform** for your project.
3. Wait until the API is enabled (this may enable **Identity Toolkit API** and related services).

### 4. Enable Identity Toolkit API (if not auto-enabled)

1. Go to [APIs & Services → Library](https://console.cloud.google.com/apis/library).
2. Search for **Identity Toolkit API**.
3. Click **Enable**.

---

## Part B — Firebase console (web app + config)

Google’s docs use the **Firebase console** to register apps and configure sign-in providers, even when the product is branded **Identity Platform** on GCP.

### 5. Open the Firebase console for the same project

1. Go [Firebase console](https://console.firebase.google.com/).
2. Click **Add project** or **Import Google Cloud project** and select **the same** GCP project ID.
3. Complete the wizard (Analytics optional).

### 6. Register a Web app

1. In Firebase project, click the **Web** icon (`</>`) → **Register app**.
2. Choose a nickname (e.g. `news-web`).
3. Copy the **Firebase configuration object** (it contains `apiKey`, `authDomain`, `projectId`, etc.).

Map to environment variables:

| Firebase config key | Environment variable (client) |
|---------------------|-------------------------------|
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |

Optional (if you add them to `client/src/lib/firebaseClient.js`): `appId` → `VITE_FIREBASE_APP_ID`, `messagingSenderId`, `storageBucket`.

### 7. Enable sign-in methods

1. Firebase console → **Build** → **Authentication** → **Sign-in method**.
2. Enable **Email/Password** (and optionally **Email link** if you want).
3. Enable **Google**:
   - Provider: **Google** → Enable.
   - Set support email and project name if prompted.
4. **Authorized domains**: Under **Authentication** → **Settings** → **Authorized domains**, ensure you have:
   - `localhost` (for local dev)
   - Your production domain (e.g. `yourdomain.com`) and any Cloud Run URL host you use for OAuth redirects.

---

## Part C — OAuth consent screen (required for Google sign-in)

If **Google** sign-in is enabled:

1. Go to [APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent).
2. Choose **External** (or **Internal** for Workspace-only).
3. Fill **App name**, **User support email**, **Developer contact**.
4. **Scopes**: default is usually enough for basic profile/email.
5. **Test users**: while in **Testing**, add test Gmail accounts if needed.
6. **Publish** the app when ready for all users.

---

## Part D — Server credentials (token verification)

The Node server uses **Application Default Credentials (ADC)** to verify Firebase ID tokens via the Admin SDK. Keep browser auth config (`VITE_FIREBASE_*`) completely separate from server credentials — the browser never needs `GOOGLE_APPLICATION_CREDENTIALS`.

### 8. Service account (already created by bootstrap script)

The `utils/bootstrap-identity-gcloud.sh` script creates `news-api-identity@<project>.iam.gserviceaccount.com` with `roles/identitytoolkit.admin`. If you need to do it manually:

1. Go to [IAM & Admin → Service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts) → **Create service account**.
2. Name: e.g. `news-api-identity`. Grant role: **`roles/identitytoolkit.admin`**.

### 9. Local development: JSON key (optional)

A JSON key is acceptable for local dev only. The bootstrap script downloads it to `secrets/service-account.json` (gitignored).

Add to root `.env` for local dev:

```env
GOOGLE_APPLICATION_CREDENTIALS=./secrets/service-account.json
```

**Do not use a JSON key in production.**

### 10. Production on GCP (Cloud Run / GCE / GKE)

Attach the service account to your Cloud Run service (or VM) as the **runtime service account**. ADC resolves credentials automatically from the metadata server — no key file needed, no `GOOGLE_APPLICATION_CREDENTIALS` in the environment.

```bash
gcloud run services update SERVICE_NAME \
  --service-account=news-api-identity@PROJECT_ID.iam.gserviceaccount.com \
  --region=REGION
```

---

## Part E — Application environment variables

Keep browser and server config strictly separate.

### 11. Server — root `.env`

Template: `docs/env.server.example`. Never commit this file.

| Variable | Required when | Notes |
|----------|---------------|-------|
| `AUTH_REQUIRED` | Always when using auth | Set `true` to protect `/api/*` routes |
| `FIREBASE_PROJECT_ID` | `AUTH_REQUIRED=true` | Same as GCP project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local dev only | Path to SA JSON; omit in production |

```env
# root .env (local dev)
AUTH_REQUIRED=true
FIREBASE_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=./secrets/service-account.json  # local only
```

In production on GCP, omit `GOOGLE_APPLICATION_CREDENTIALS` entirely — the runtime service account provides ADC automatically.

### 12. Client — `client/.env.local` (Vite build-time)

These are browser-only. They come from the Firebase console → Project settings → Web app config. Never put server credentials here.

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=1:...   # optional
```

`VITE_*` variables are embedded at **build time** — rebuild the client after changing them.

**Important:** `VITE_*` variables are embedded at **build time**. Rebuild the client after changing them:

```bash
cd client && npm run build
```

### 12b. Sanity-check server env

From the repo root:

```bash
npm run check-identity-env
```

This prints whether `AUTH_REQUIRED` / `FIREBASE_PROJECT_ID` / `GOOGLE_APPLICATION_CREDENTIALS` look consistent. See also `docs/env.server.example` for a template server `.env`.

### 13. Enable auth in the server

Without `AUTH_REQUIRED=true`, the API stays public (same as before). To require JWT on:

- `/api/report/today`, `/api/analyze`, `/api/chat`, `/api/video/*`, `/articles`

set:

```env
AUTH_REQUIRED=true
```

---

## Part F — Build and run

### 14. Install dependencies

```bash
npm install
cd client && npm install && cd ..
```

### 15. Build the SPA

```bash
npm run client:build
```

### 16. Start the API

```bash
npm start
```

### 17. Local dev with Vite + API

Terminal 1:

```bash
npm start
```

Terminal 2:

```bash
npm run client:dev
```

Vite proxies `/api` and `/articles` to `http://localhost:3000` (see `client/vite.config.js`).

---

## Part G — Verification checklist

1. **Without** `AUTH_REQUIRED`: open `http://localhost:5173` (Vite) — app loads without login.
2. **With** `AUTH_REQUIRED=true` and Firebase env set:
   - Open app → should see **Sign in**.
   - Register or sign in with email/password or Google.
   - After sign-in, **Analyze** and **Chat** should work (tokens sent automatically).
3. Call API without token (should fail when auth required):

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/report/today
# Expect 401 if AUTH_REQUIRED=true
```

4. **GET** public config:

```bash
curl -s http://localhost:3000/api/auth/config
# {"authRequired":true} or false
```

---

## Security notes

- Never commit `.env`, `client/.env.local`, or service account JSON.
- Rotate keys if leaked.
- Restrict `GOOGLE_APPLICATION_CREDENTIALS` to deployment environments only.
- For production, use **HTTPS** and correct **Authorized domains** for OAuth.

---

## Reference links

- [Identity Platform documentation](https://cloud.google.com/identity-platform/docs)
- [Installing the Admin SDK (Identity Platform)](https://cloud.google.com/identity-platform/docs/install-admin-sdk)
- [Verify ID tokens (Admin)](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Firebase Auth (Web) — modular SDK](https://firebase.google.com/docs/auth/web/start)
