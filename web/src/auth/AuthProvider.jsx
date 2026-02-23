import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { firebaseAuth } from "@/firebase/client";
import { getUserProfileByEmail } from "@/firebase/users";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function hydrateFromFirebaseAuth(firebaseUser, { forceSignOut = true } = {}) {
    const email = String(firebaseUser?.email || "").trim().toLowerCase();
    if (!email) {
      if (forceSignOut) await signOut(firebaseAuth);
      return null;
    }

    // Ensure an up-to-date auth token is available before Firestore read.
    await firebaseUser.getIdToken();

    const profile = await getUserProfileByEmail(email);
    if (!profile || Number(profile.active) !== 1) {
      if (forceSignOut) await signOut(firebaseAuth);
      return null;
    }

    return {
      uid: firebaseUser.uid,
      email: profile.email,
      name: profile.name || firebaseUser.displayName || "",
      role: profile.role,
      is_admin: profile.role === "admin",
      can_see_price_gbp: Number(profile.can_see_price_gbp) === 1,
      active: true,
    };
  }

  async function refreshAccess() {
    const current = firebaseAuth.currentUser;
    if (!current) {
      setUser(null);
      return { ok: false };
    }

    try {
      const next = await hydrateFromFirebaseAuth(current, { forceSignOut: false });
      setUser(next);
      if (!next) return { ok: false, reason: "profile_not_found_or_inactive" };
      return { ok: true, user: next };
    } catch (err) {
      console.error("refreshAccess failed", err);
      setUser(null);
      return {
        ok: false,
        reason: String(err?.code || err?.message || "unknown_error"),
      };
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      setLoading(true);
      try {
        if (!firebaseUser) {
          setUser(null);
          return;
        }
        const next = await hydrateFromFirebaseAuth(firebaseUser);
        setUser(next);
      } catch (err) {
        console.error("Auth state hydration failed", err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  async function logout() {
    await signOut(firebaseAuth);
    setUser(null);
  }

  const value = useMemo(
    () => ({ user, setUser, loading, logout, refreshAccess }),
    [user, loading],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
