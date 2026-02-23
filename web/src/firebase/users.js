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
  return {
    email,
    name: String(raw?.name || "").trim(),
    role,
    active,
    can_see_price_gbp: canSee,
    is_admin: role === "admin",
  };
}

function userDocRefByEmail(email) {
  return doc(firestoreDb, USERS_COLLECTION, normalizeEmail(email));
}

export async function getUserProfileByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const byIdSnap = await getDoc(userDocRefByEmail(normalized));
  if (!byIdSnap.exists()) return null;
  return normalizeUser({ ...byIdSnap.data(), email: normalized });
}

export async function listUsers() {
  const q = query(
    collection(firestoreDb, USERS_COLLECTION),
    orderBy("email", "asc"),
  );
  const qs = await getDocs(q);
  return qs.docs.map((d) => normalizeUser(d.data()));
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
  update.updated_at = serverTimestamp();

  await updateDoc(userDocRefByEmail(email), update);
}

export async function removeUser(userEmail) {
  const email = normalizeEmail(userEmail);
  if (!email) throw new Error("User email is required");
  await deleteDoc(userDocRefByEmail(email));
}
