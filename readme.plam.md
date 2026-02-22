Below is the full end-to-end flow to start a **React (Vite) + Python workspace** repo and deploy the React site to **GitHub Pages**. This setup does **not** require a `docs/` folder (it uses the `gh-pages` branch), and it keeps your Python “execute space” in the same repo.

---

## 0) Prereqs

Install:

* **Node.js (LTS)** → includes `npm`
* **Python 3.10+**
* **Git**

Check:

```bash
node -v
npm -v
python --version
git --version
```

---

## 1) Create the repo folder

```bash
mkdir brand-wala
cd brand-wala
git init
```

---

## 2) Create the React app in `/web`

```bash
npm create vite@latest web -- --template react
cd web
npm install
npm install react-router-dom
npm run dev
```

Open:

* `http://localhost:5173`

Stop dev server anytime with `Ctrl + C`.

---

## 3) Configure routing for GitHub Pages (HashRouter)

Edit `web/src/main.jsx`:

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
```

---

## 4) Create basic pages + route guards

Create folders:

```bash
mkdir -p src/pages src/auth src/api src/components
```

### `web/src/auth/AuthProvider.jsx`

```jsx
import React, { createContext, useContext, useEffect, useState } from "react";

const AuthCtx = createContext(null);

function getCachedUser() {
  try {
    const raw = localStorage.getItem("bw_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCachedUser(u) {
  try {
    if (!u) localStorage.removeItem("bw_user");
    else localStorage.setItem("bw_user", JSON.stringify(u));
  } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getCachedUser());
  const [loading, setLoading] = useState(true);

  // ✅ On app start: re-check access if user exists
  useEffect(() => {
    const run = async () => {
      const cached = getCachedUser();
      if (!cached?.email) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(window.BW_CONFIG?.API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "uk_check_access", email: cached.email })
        });

        const data = await res.json();
        if (!data?.success) {
          setCachedUser(null);
          setUser(null);
          setLoading(false);
          return;
        }

        const next = {
          ...cached,
          email: data.email || cached.email,
          role: (data.role || "customer").toLowerCase(),
          can_see_price_gbp: !!data.can_see_price_gbp,
          is_admin: !!data.is_admin,
          active: true
        };

        setCachedUser(next);
        setUser(next);
      } catch {
        // network fail → allow cached session
        setUser(cached);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  const logout = () => {
    setCachedUser(null);
    setUser(null);
  };

  const value = { user, setUser, loading, logout };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
```

### `web/src/auth/ProtectedRoute.jsx`

```jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
```

### `web/src/pages/Login.jsx`

This is a placeholder; you can embed Google button later.

```jsx
import { useAuth } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const { user } = useAuth();
  const nav = useNavigate();

  // if already logged in, go home
  if (user) {
    setTimeout(() => nav("/", { replace: true }), 0);
    return null;
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h2>Login</h2>
      <p>Google sign-in UI goes here (we’ll wire it next).</p>
    </div>
  );
}
```

### `web/src/pages/Products.jsx`

```jsx
import { useAuth } from "../auth/AuthProvider";

export default function Products() {
  const { user, logout } = useAuth();

  return (
    <div style={{ padding: 16 }}>
      <h2>Products</h2>
      <div style={{ marginBottom: 12 }}>
        Logged in as: <b>{user?.email}</b>
      </div>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}
```

### `web/src/pages/Orders.jsx`

```jsx
export default function Orders() {
  return (
    <div style={{ padding: 16 }}>
      <h2>Orders</h2>
    </div>
  );
}
```

### `web/src/App.jsx`

```jsx
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import ProtectedRoute from "./auth/ProtectedRoute";

import Login from "./pages/Login";
import Products from "./pages/Products";
import Orders from "./pages/Orders";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Products />
            </ProtectedRoute>
          }
        />

        <Route
          path="/orders"
          element={
            <ProtectedRoute>
              <Orders />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
```

Run again:

```bash
npm run dev
```

---

## 5) Add your runtime config (API_URL / client id)

Create `web/public/config.js`:

```js
window.BW_CONFIG = {
  API_URL: "PASTE_YOUR_GOOGLE_APPS_SCRIPT_URL_HERE",
  GOOGLE_CLIENT_ID: "PASTE_CLIENT_ID_HERE"
};
```

Then include it in `web/index.html` (Vite root html) before your app loads:

```html
<script src="/config.js"></script>
```

---

## 6) Create Python workspace in `/python`

From repo root:

```bash
cd ..
mkdir -p python/notebooks python/scripts python/data
cd python
python -m venv .venv
```

Activate:

**Windows**

```bash
.venv\Scripts\activate
```

**Mac/Linux**

```bash
source .venv/bin/activate
```

Install basics:

```bash
pip install jupyter pandas openpyxl
pip freeze > requirements.txt
jupyter notebook
```

Now you can run Python notebooks/scripts in `python/`.

---

## 7) Set up GitHub Pages deploy (gh-pages branch)

Go to `web/`:

```bash
cd ../web
npm install gh-pages --save-dev
```

### 7.1 Update `web/vite.config.js`

Replace `brand-wala` with your repo name:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/brand-wala/"
});
```

### 7.2 Update `web/package.json`

Add scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "gh-pages -d dist"
  }
}
```

---

## 8) Create `.gitignore` at repo root

From repo root (`brand-wala/.gitignore`):

```
# python
python/.venv/
python/__pycache__/
python/.ipynb_checkpoints/

# react
web/node_modules/
web/dist/

# misc
.DS_Store
```

---

## 9) Push to GitHub

From repo root:

```bash
cd ..
git add .
git commit -m "Initial React + Python workspace"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/brand-wala.git
git push -u origin main
```

---

## 10) Deploy to GitHub Pages

From `web/`:

```bash
npm run build
npm run deploy
```

Now in GitHub:

* Repo → **Settings** → **Pages**
* Source: **Deploy from branch**
* Branch: **gh-pages** / **(root)**

Your site will be at:
`https://YOUR_USERNAME.github.io/brand-wala/`

---

## Daily dev workflow

### Start frontend:

```bash
cd web
npm run dev
```

### Run Python:

```bash
cd python
source .venv/bin/activate   # mac/linux
jupyter notebook
```

### Deploy updates:

```bash
cd web
npm run build
npm run deploy
```

---

## Next step (when you’re ready)

I can plug in your **Google Login + uk_login** in React the same way you do now, with:

* storing `bw_user`
* calling `uk_check_access` on app start
* route protection
* price/cart gating

If you tell me your GitHub repo name (exact), I’ll give you the final `vite.config.js base` line and the exact deploy URL.
c







| Status              | Customer          | Admin              |
| ------------------- | ----------------- | ------------------ |
| draft               | Full edit         | Full edit          |
| submitted           | Read only         | Full edit          |
| priced              | Accept or counter | Full edit          |
| under_review        | Adjust counter    | Full edit          |
| finalized           | Read only         | Full edit          |
| processing          | Read only         | Update shipped qty |
| partially_delivered | Read only         | Full edit          |
| delivered           | Read only         | Read only          |
| cancelled           | Read only         | Full edit          |