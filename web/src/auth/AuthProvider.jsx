import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp, firebaseAuth } from "@/firebase/client";
import { getUserProfileByEmail } from "@/firebase/users";

const AuthCtx = createContext(null);
const functionsRegion = String(window.BW_CONFIG?.APP?.functionsRegion || "us-central1").trim();
const firebaseFunctions = getFunctions(firebaseApp, functionsRegion);
const syncMyClaimsFn = httpsCallable(firebaseFunctions, "syncMyClaims");
const SESSION_USER_KEY = "bw.auth.user.v1";

function toBool(v, fallback = false) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  if (typeof v === "number") return v === 1;
  if (typeof v === "boolean") return v;
  return fallback;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_USER_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  function writeSessionUser(nextUser) {
    try {
      if (!nextUser) {
        sessionStorage.removeItem(SESSION_USER_KEY);
        return;
      }
      sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(nextUser));
    } catch {
      // ignore storage errors
    }
  }

  async function hydrateFromFirebaseAuth(firebaseUser, { forceSignOut = true } = {}) {
    const email = String(firebaseUser?.email || "").trim().toLowerCase();
    if (!email) {
      if (forceSignOut) await signOut(firebaseAuth);
      return null;
    }

    let token = await firebaseUser.getIdTokenResult(true);
    let claims = token?.claims || {};
    const isLocalDev =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (!isLocalDev && (!("active" in claims) || !("role" in claims))) {
      try {
        await syncMyClaimsFn({});
        await firebaseUser.getIdToken(true);
        token = await firebaseUser.getIdTokenResult(true);
        claims = token?.claims || {};
      } catch (_) {
        // Fallback below reads profile directly.
      }
    }

    let active = "active" in claims ? toBool(claims.active, false) : null;
    let role = "role" in claims
      ? (String(claims.role || "customer").toLowerCase() === "admin" ? "admin" : "customer")
      : null;
    let canSeePriceGbp = "can_see_price_gbp" in claims
      ? toBool(claims.can_see_price_gbp, false)
      : null;
    let canUseCart = "can_use_cart" in claims
      ? toBool(claims.can_use_cart, true)
      : null;

    if (active === null || role === null || canSeePriceGbp === null || canUseCart === null) {
      try {
        const profile = await getUserProfileByEmail(email);
        if (profile) {
          if (active === null) active = toBool(profile.active, false);
          if (role === null) role = String(profile.role || "customer").toLowerCase() === "admin" ? "admin" : "customer";
          if (canSeePriceGbp === null) canSeePriceGbp = toBool(profile.can_see_price_gbp, false);
          if (canUseCart === null) canUseCart = toBool(profile.can_use_cart, true);
        }
      } catch (err) {
        console.error("Profile fallback read failed", err);
      }
    }

    const resolvedActive = active === null ? false : active;
    if (!resolvedActive) {
      if (forceSignOut) await signOut(firebaseAuth);
      return null;
    }

    const resolvedRole = role === "admin" ? "admin" : "customer";

    return {
      uid: firebaseUser.uid,
      email,
      name: firebaseUser.displayName || "",
      photo_url: String(firebaseUser.photoURL || ""),
      role: resolvedRole,
      is_admin: resolvedRole === "admin",
      can_see_price_gbp: canSeePriceGbp === null ? false : canSeePriceGbp,
      can_use_cart: canUseCart === null ? true : canUseCart,
      active: resolvedActive,
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
      writeSessionUser(next);
      if (!next) return { ok: false, reason: "profile_not_found_or_inactive" };
      return { ok: true, user: next };
    } catch (err) {
      console.error("refreshAccess failed", err);
      setUser(null);
      writeSessionUser(null);
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
          writeSessionUser(null);
          return;
        }
        const next = await hydrateFromFirebaseAuth(firebaseUser);
        setUser(next);
        writeSessionUser(next);
      } catch (err) {
        console.error("Auth state hydration failed", err);
        setUser(null);
        writeSessionUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // Polling disabled to avoid periodic Firestore reads/quota usage.

  async function logout() {
    await signOut(firebaseAuth);
    setUser(null);
    writeSessionUser(null);
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
