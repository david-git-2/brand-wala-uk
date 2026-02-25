import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  deleteDoc,
} from "firebase/firestore/lite";
import { firestoreDb } from "./client";

function s(v) {
  return String(v || "").trim();
}

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function ng(v, d = 0) {
  return Math.max(0, Math.round(n(v, d)));
}

export function buildWeightKey({ product_code, barcode, product_id } = {}) {
  const pc = s(product_code);
  const bc = s(barcode);
  const pid = s(product_id);
  if (pc && bc) return `${pc}-${bc}`;
  if (bc) return bc;
  if (pid) return pid;
  return "";
}

export async function getProductWeight(weightKey) {
  const key = s(weightKey);
  if (!key) return null;
  const snap = await getDoc(doc(firestoreDb, "product_weights", key));
  return snap.exists() ? { weight_key: snap.id, ...snap.data() } : null;
}

export async function listProductWeights() {
  const snap = await getDocs(
    query(collection(firestoreDb, "product_weights"), orderBy("updated_at", "desc")),
  );
  return snap.docs.map((d) => ({ weight_key: d.id, ...d.data() }));
}

export async function upsertProductWeight(payload = {}) {
  const weight_key = s(payload.weight_key) || buildWeightKey(payload);
  if (!weight_key) throw new Error("Missing weight key (product_code-barcode/barcode/product_id)");

  const unit_product_weight_g = ng(payload.unit_product_weight_g, 0);
  const unit_package_weight_g = ng(payload.unit_package_weight_g, 0);
  const unit_total_weight_g = unit_product_weight_g + unit_package_weight_g;

  await setDoc(
    doc(firestoreDb, "product_weights", weight_key),
    {
      weight_key,
      product_id: s(payload.product_id),
      product_code: s(payload.product_code),
      barcode: s(payload.barcode),
      name: s(payload.name),
      unit_product_weight_g,
      unit_package_weight_g,
      unit_total_weight_g,
      source: s(payload.source) || "manual",
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );

  return getProductWeight(weight_key);
}

export async function deleteProductWeight(weightKey) {
  const key = s(weightKey);
  if (!key) return;
  await deleteDoc(doc(firestoreDb, "product_weights", key));
}

