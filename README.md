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

## Notes

- Google Apps Script (`clasp`) deployment scripts were removed from root `package.json`.
- Active backend path is Firebase.
- If rules/claims change, deploy rules/functions before testing auth-sensitive flows.
- Firestore schema reference: `/Users/david/Desktop/projects/brand-wala-uk/FIRESTORE_SCHEMA.md`.
- Project structure guide: `/Users/david/Desktop/projects/brand-wala-uk/PROJECT_STRUCTURE.md`.
- Firebase v2 setup guide: `/Users/david/Desktop/projects/brand-wala-uk/docs/FIREBASE_V2_SETUP.md`.
- v2 migration plan: `/Users/david/Desktop/projects/brand-wala-uk/docs/V2_MIGRATION_PLAN.md`.
