# Brand Wala UK

Firebase-based wholesale ordering system (React + Firestore + Functions).

## Stack

- Frontend: React (Vite)
- Backend: Firebase Firestore + Cloud Functions
- Auth: Firebase Auth (Google sign-in)
- Hosting: Firebase Hosting / GitHub Pages (frontend)

## Project Structure

- `/Users/david/Desktop/projects/brand-wala-uk/web` - React frontend
- `/Users/david/Desktop/projects/brand-wala-uk/functions` - Firebase Functions
- `/Users/david/Desktop/projects/brand-wala-uk/firestore.rules` - Firestore security rules
- `/Users/david/Desktop/projects/brand-wala-uk/firestore.indexes.json` - Firestore indexes

## Local Development

### 1) Frontend

```bash
cd /Users/david/Desktop/projects/brand-wala-uk/web
npm install
npm run dev
```

### Local Firebase config via env (recommended)

Do this once on your machine:

```bash
cp /Users/david/Desktop/projects/brand-wala-uk/web/.env.example /Users/david/Desktop/projects/brand-wala-uk/web/.env
```

Then edit `web/.env` with real Firebase values.

- `.env` is local-only (do not commit).

### 2) Functions

```bash
cd /Users/david/Desktop/projects/brand-wala-uk/functions
npm install
npm run build
```

### 3) Firebase emulators (optional)

From repo root:

```bash
npm run fb:emulators
```

## Deploy Commands

From repo root:

### Deploy Firestore rules (your required command)

```bash
firebase deploy --only firestore:rules --project brandwala-wholesale
```

### Deploy Firestore rules + indexes

```bash
npm run fb:deploy:rules
```

### Deploy functions

```bash
npm run fb:deploy:functions
```

### Deploy hosting

```bash
npm run fb:deploy:hosting
```

## GitHub Pages Deploy (No Secrets In Git)

This repo includes CI deploy workflow:

- `/Users/david/Desktop/projects/brand-wala-uk/.github/workflows/deploy-web-gh-pages.yml`

It builds frontend and deploys `web/dist` to `gh-pages` using GitHub repository
secrets as Vite env values at build time.

Set these repository secrets in GitHub:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FUNCTIONS_REGION` (optional, default `us-central1`)

Then push to `main` (or run workflow manually).

## Notes

- Google Apps Script (`clasp`) deployment scripts were removed from root `package.json`.
- Active backend path is Firebase.
- If rules/claims change, deploy rules/functions before testing auth-sensitive flows.
- Firestore schema reference: `/Users/david/Desktop/projects/brand-wala-uk/FIRESTORE_SCHEMA.md`.
- Project structure guide: `/Users/david/Desktop/projects/brand-wala-uk/PROJECT_STRUCTURE.md`.
- Firebase v2 setup guide: `/Users/david/Desktop/projects/brand-wala-uk/docs/FIREBASE_V2_SETUP.md`.
- v2 migration plan: `/Users/david/Desktop/projects/brand-wala-uk/docs/V2_MIGRATION_PLAN.md`.
