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

function weightLogId() {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rnd = Math.floor(Math.random() * 900000) + 100000;
  return `PWL_${ts}_${rnd}`;
}

async function writeWeightLog({ action, weight_key, actor_email, source, before = null, after = null }) {
  const id = weightLogId();
  await setDoc(
    doc(firestoreDb, "product_weight_logs", id),
    {
      log_id: id,
      action: s(action).toLowerCase(),
      weight_key: s(weight_key),
      actor_email: s(actor_email).toLowerCase(),
      source: s(source || "manual"),
      before,
      after,
      created_at: serverTimestamp(),
    },
    { merge: false },
  );
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
  const prev = await getProductWeight(weight_key);

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

  const next = await getProductWeight(weight_key);
  await writeWeightLog({
    action: prev ? "update" : "create",
    weight_key,
    actor_email: payload.actor_email,
    source: payload.source,
    before: prev,
    after: next,
  });
  return next;
}

export async function deleteProductWeight(weightKey, meta = {}) {
  const key = s(weightKey);
  if (!key) return;
  const prev = await getProductWeight(key);
  await deleteDoc(doc(firestoreDb, "product_weights", key));
  if (prev) {
    await writeWeightLog({
      action: "delete",
      weight_key: key,
      actor_email: meta.actor_email,
      source: meta.source,
      before: prev,
      after: null,
    });
  }
}
