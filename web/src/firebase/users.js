import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore/lite";
import { firestoreDb } from "./client";

const USERS_COLLECTION = "users";
const PROFILE_TTL_MS = 60 * 1000;
const LIST_TTL_MS = 30 * 1000;

const profileCache = new Map();
const profileInflight = new Map();
let usersListCache = null;
let usersListCacheTs = 0;
let usersListInflight = null;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function toNum01(v, fallback = 0) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return 1;
  if (s === "0" || s === "false" || s === "no") return 0;
  return Number(v) === 1 ? 1 : fallback;
}

function normalizeRole(role) {
  const r = String(role || "customer").trim().toLowerCase();
  return r === "admin" ? "admin" : "customer";
}

function normalizeUser(raw) {
  const email = normalizeEmail(raw?.email);
  const role = normalizeRole(raw?.role);
  const active = toNum01(raw?.active, 1);
  const canSee = toNum01(raw?.can_see_price_gbp, 0);
  const canUseCart = toNum01(raw?.can_use_cart, 1);
  return {
    email,
    name: String(raw?.name || "").trim(),
    role,
    active,
    can_see_price_gbp: canSee,
    can_use_cart: canUseCart,
    is_admin: role === "admin",
  };
}

function userDocRefByEmail(email) {
  return doc(firestoreDb, USERS_COLLECTION, normalizeEmail(email));
}

function invalidateUsersCache(email) {
  const e = normalizeEmail(email);
  if (e) {
    profileCache.delete(e);
    profileInflight.delete(e);
  }
  usersListCache = null;
  usersListCacheTs = 0;
  usersListInflight = null;
}

export async function getUserProfileByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const now = Date.now();
  const hit = profileCache.get(normalized);
  if (hit && now - hit.ts < PROFILE_TTL_MS) return hit.value;
  if (profileInflight.has(normalized)) return profileInflight.get(normalized);

  const p = (async () => {
    const byIdSnap = await getDoc(userDocRefByEmail(normalized));
    const value = byIdSnap.exists()
      ? normalizeUser({ ...byIdSnap.data(), email: normalized })
      : null;
    profileCache.set(normalized, { ts: Date.now(), value });
    return value;
  })();
  profileInflight.set(normalized, p);
  try {
    return await p;
  } finally {
    profileInflight.delete(normalized);
  }
}

export async function listUsers() {
  const now = Date.now();
  if (usersListCache && now - usersListCacheTs < LIST_TTL_MS) {
    return usersListCache;
  }
  if (usersListInflight) return usersListInflight;

  usersListInflight = (async () => {
    const q = query(
      collection(firestoreDb, USERS_COLLECTION),
      orderBy("email", "asc"),
    );
    const qs = await getDocs(q);
    const rows = qs.docs.map((d) => normalizeUser(d.data()));
    usersListCache = rows;
    usersListCacheTs = Date.now();
    rows.forEach((r) => {
      profileCache.set(normalizeEmail(r.email), { ts: Date.now(), value: r });
    });
    return rows;
  })();
  try {
    return await usersListInflight;
  } finally {
    usersListInflight = null;
  }
}

export async function createUser(payload) {
  const email = normalizeEmail(payload?.user_email || payload?.email);
  if (!email) throw new Error("Email is required");
  const data = normalizeUser({ ...payload, email });
  await setDoc(userDocRefByEmail(email), {
    ...data,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
  invalidateUsersCache(email);
}

export async function updateUser(userEmail, patch = {}) {
  const email = normalizeEmail(userEmail);
  if (!email) throw new Error("User email is required");

  const update = {};
  if (patch.name !== undefined) update.name = String(patch.name || "").trim();
  if (patch.role !== undefined) update.role = normalizeRole(patch.role);
  if (patch.active !== undefined) update.active = toNum01(patch.active, 1);
  if (patch.can_see_price_gbp !== undefined) {
    update.can_see_price_gbp = toNum01(patch.can_see_price_gbp, 0);
  }
  if (patch.can_use_cart !== undefined) {
    update.can_use_cart = toNum01(patch.can_use_cart, 1);
  }
  update.updated_at = serverTimestamp();

  await updateDoc(userDocRefByEmail(email), update);
  invalidateUsersCache(email);
}

export async function removeUser(userEmail) {
  const email = normalizeEmail(userEmail);
  if (!email) throw new Error("User email is required");
  await deleteDoc(userDocRefByEmail(email));
  invalidateUsersCache(email);
}
