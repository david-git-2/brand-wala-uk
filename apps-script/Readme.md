```markdown
# Brand Wala UK — Apps Script Backend (clasp) Workflow

This project keeps Google Apps Script code **in the repo** (GitHub) and deploys to Apps Script using **clasp**.
This prevents code getting “scrambled” in Drive and gives you proper version control + repeatable deployments.

## Backend Logic Doc

- Full backend behavior + calculation formulas:
  - `/Users/david/Desktop/projects/brand-wala-uk/apps-script/BACKEND_SYSTEM.md`

> Script type: **Standalone Apps Script project**  
> Data store: **Google Sheets** (the script accesses one or more sheets by ID)

---

## 1) Folder Structure

Recommended layout:
```

brand-wala-uk/
web/ # React frontend (optional)
apps-script/ # Apps Script backend (source of truth)
appsscript.json
UK*Main.gs
UK*\*.gs
...

````

`apps-script/` is where you edit Apps Script code.

---

## 2) Prerequisites

### Install clasp
```bash
npm i -g @google/clasp
````

### Login

```bash
clasp login
```

Log in using the **same Google account** that owns the Apps Script project.

### Enable Apps Script API (one-time)

In your Google account settings:

- Open Apps Script settings: `https://script.google.com/home/usersettings`
- Enable **Apps Script API**

If this API is not enabled, `clasp push/pull` may fail.

---

## 3) One-Time Setup (Link Repo ↔ Apps Script)

### Step 1 — Create/enter the backend folder

```bash
cd /path/to/brand-wala-uk
mkdir -p apps-script
cd apps-script
```

### Step 2 — Clone the existing Apps Script project

1. Open Apps Script in browser
2. Copy the Script ID from the URL:

`https://script.google.com/home/projects/<SCRIPT_ID>/edit`

3. Clone:

```bash
clasp clone <SCRIPT_ID>
```

After cloning, you should see:

- `appsscript.json`
- `*.gs` source files

### Step 3 — Verify the link

```bash
clasp pull
```

If there’s no error, your local folder is correctly linked.

---

## 4) Configuration

### `appsscript.json`

Ensure runtime is V8:

```json
{
  "timeZone": "Asia/Dhaka",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}
```

---

## 5) Daily Development Workflow (Recommended)

### A) Start your day / sync

Pull latest script from Apps Script (only needed if someone edited online, ideally nobody does):

```bash
cd apps-script
clasp pull
```

### B) Make changes locally

- Edit `.gs` files in VS Code / your editor
- Run local checks (linting/tests if you have them)
- Commit to GitHub as usual

### C) Push changes to Apps Script

```bash
cd apps-script
clasp push
```

### D) Deploy updated web app (keep same URL)

```bash
clasp deployments
# copy your existing production deploymentId (left column)
clasp deploy -i <deploymentId> --description "Update: <short message>"
```

Example:

```bash
clasp deploy -i AKfycbxRStB58mfRogX-EvQvytt6PSJmJMMCAtEjPLfK0-bD4evgx1n5QeOYymHrj_2xlmoh --description "Update: allocation recompute logic"
```

### E) Confirm deployment

List deployments:

```bash
clasp deployments
```

Open Apps Script project in browser (optional):

```bash
clasp open
```

---

## 6) Deployment Notes (Web App)

### Where to get the Web App URL

Apps Script UI:

- **Deploy → Manage deployments**
- Copy the Web App URL
- Put it into your frontend config:
  - `BW_CONFIG.API_URL`

### Updating the deployed URL

If you create a **new deployment**, URL may change depending on configuration.
Best practice:

- Keep one main deployment for production
- Create new ones for testing only

---

## 7) Team Rules (Avoid “Scrambled Code”)

**DO**

- Edit code only in repo (`apps-script/`)
- Push with `clasp push`
- Deploy with `clasp deploy`
- Commit changes to GitHub

**DON’T**

- Edit Apps Script in Drive editor (except emergencies)
- Copy/paste from Google Docs into `.gs` (formatting issues)

---

## 8) Troubleshooting

### Error: “Apps Script API has not been used or is disabled”

Enable Apps Script API:

- `https://script.google.com/home/usersettings`

### Error: “Permission denied” or wrong account

Make sure you logged in with the correct Google account:

```bash
clasp login
```

### You pushed but changes not reflected

- Ensure you deployed after pushing:

```bash
clasp push
clasp deployments
clasp deploy -i <deploymentId> --description "Update"
```

- Check in Apps Script UI that the correct deployment is used.

---

## 9) Suggested Git Hygiene

### `.gitignore`

Decide whether to commit `.clasp.json`:

**Option A (Solo dev):** commit `.clasp.json` (simpler)

**Option B (Team):** ignore `.clasp.json` and document setup

If ignoring:

```gitignore
# clasp
.clasp.json
```

---

## 10) Quick Commands Summary

```bash
# One-time setup
npm i -g @google/clasp
clasp login
cd apps-script
clasp clone <SCRIPT_ID>

# Daily
clasp pull        # optional
clasp push
clasp deployments
clasp deploy -i <deploymentId> --description "Update: ..."
clasp deployments
```

---

## 11) Recommended Release Flow

1. Commit to GitHub (main branch)
2. `clasp push`
3. `clasp deploy --description "Release: vX.Y"`
4. Update frontend `API_URL` if needed
5. Smoke test endpoints:
   - `uk_check_access`
   - `uk_get_orders`
   - `uk_recompute_order`

---

## 12) Auto Setup Sheet Headers

From project root:

```bash
npm run gas:release
ADMIN_EMAIL='your-admin-email@example.com' npm run gas:setup-sheets:web
```

What this does:

- Calls backend action `uk_setup_sheets`
- Verifies user is admin
- Creates missing tabs
- Writes required header row for each tab

⚠️ Warning:

- This setup currently clears each target tab before writing headers
- Existing data in those tabs will be removed

---

### Owner / Account Note

Make sure you always deploy using the correct Google account (the one that owns the script project).

```

If you want, I can also add:
- A “Rollback” section (how to revert to a previous deployment)
- A “Production vs Staging” deployment pattern (two deployments, two URLs)
```
