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