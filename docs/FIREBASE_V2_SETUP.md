# Firebase v2 Setup (brandwala-v2)

Use a separate Firebase project for the new architecture.

## 1) Create Project

Create in Firebase Console:
- Project ID: `brandwala-v2`

Enable:
- Authentication (Google provider)
- Firestore Database
- Cloud Functions
- Hosting (if deploying from this repo)

## 2) Add Firebase aliases in this repo

From repo root:

```bash
firebase use --add
```

Set aliases:
- `prod` -> current project (`brandwala-wholesale`)
- `v2` -> new project (`brandwala-v2`)

## 3) Verify `.firebaserc`

Expected shape:

```json
{
  "projects": {
    "default": "brandwala-wholesale",
    "prod": "brandwala-wholesale",
    "v2": "brandwala-v2"
  }
}
```

## 4) Deploy rules/indexes/functions to v2

```bash
firebase deploy --only firestore:rules,firestore:indexes --project brandwala-v2
firebase deploy --only functions --project brandwala-v2
```

## 5) Configure Web Firebase keys for v2

In your frontend config source (`config.js` or env-injected config), set v2 keys:
- `apiKey`
- `authDomain`
- `projectId` = `brandwala-v2`
- `appId`

## 6) Auth domain setup

In Firebase Console -> Authentication -> Settings -> Authorized domains:
- Add your production domain
- Add `localhost` for dev

## 7) Firestore bootstrap (optional)

Create initial admin user profile in `users/{emailLower}` with:
- `role: "admin"`
- `active: 1`
- `can_see_price_gbp: 1`
- `can_use_cart: 1`

Then login once so custom claims sync runs.

## 8) Keep environments isolated

- `main` branch deploys to `prod`
- `v2` branch deploys to `v2`
- never point both branches to same Firebase project
