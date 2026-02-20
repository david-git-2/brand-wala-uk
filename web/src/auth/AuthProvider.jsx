import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { UK_API } from "../api/ukApi";

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

function redirectToLogin() {
  // If you use HashRouter
  if (!window.location.hash.startsWith("#/login")) {
    window.location.hash = "#/login";
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getCachedUser());
  const [loading, setLoading] = useState(true);

  // ✅ prevents double-run (StrictMode) + dedupes calls
  const startedRef = useRef(false);
  const inflightRef = useRef(null);

  const refreshAccess = async ({ redirectOnFail = true } = {}) => {
    const cached = getCachedUser();
    const email = String(cached?.email || "").trim();

    if (!email) {
      setCachedUser(null);
      setUser(null);
      if (redirectOnFail) redirectToLogin();
      return { ok: false };
    }

    // ✅ dedupe: if already checking, return the same promise
    if (inflightRef.current) return inflightRef.current;

    inflightRef.current = (async () => {
      try {
        const data = await UK_API.checkAccess(email);

        const next = {
          ...cached,
          email: String(data.email || email).trim(),
          role: String(data.role || "customer").toLowerCase().trim(),
          is_admin: !!data.is_admin,
          can_see_price_gbp: !!data.can_see_price_gbp,
          active: true
        };

        setCachedUser(next);
        setUser(next);
        return { ok: true, user: next };
      } catch (err) {
        console.warn("uk_check_access failed:", err);
        setCachedUser(null);
        setUser(null);
        if (redirectOnFail) redirectToLogin();
        return { ok: false };
      } finally {
        inflightRef.current = null;
      }
    })();

    return inflightRef.current;
  };

  // ✅ run once on app mount
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const cached = getCachedUser();
        if (!cached?.email) {
          setLoading(false);
          redirectToLogin();
          return;
        }
        await refreshAccess({ redirectOnFail: true });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    setCachedUser(null);
    setUser(null);
    redirectToLogin();
  };

  const value = useMemo(
    () => ({ user, setUser, loading, logout, refreshAccess }),
    [user, loading]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}