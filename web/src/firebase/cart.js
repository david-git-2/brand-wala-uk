import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore/lite";
import { firestoreDb } from "./client";

const CART_TTL_MS = 15 * 1000;
const cartCache = new Map();
const cartInflight = new Map();

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normProductId(productId) {
  return String(productId || "").trim();
}

function itemRef(email, productId) {
  return doc(
    firestoreDb,
    "carts",
    normEmail(email),
    "items",
    normProductId(productId),
  );
}

function minStep(caseSize) {
  return Math.max(6, Math.round(Number(caseSize || 0) || 0));
}

function roundUpToStep(qty, step) {
  const s = Math.max(1, Math.round(Number(step || 1) || 1));
  const q = Math.max(0, Math.round(Number(qty || 0) || 0));
  if (q === 0) return 0;
  return Math.max(s, Math.ceil(q / s) * s);
}

function itemsCol(email) {
  return collection(firestoreDb, "carts", normEmail(email), "items");
}

function invalidateCartCache(email) {
  const e = normEmail(email);
  if (!e) return;
  cartCache.delete(e);
  cartInflight.delete(e);
}

function fromDocData(data = {}, fallbackId = "") {
  const product_id = String(data.product_id || fallbackId || "").trim();
  const unit_price_gbp = Number(data.unit_price_gbp ?? data.price_gbp ?? data.price ?? 0) || 0;
  const case_size = Number(data.case_size ?? 0) || 0;
  const qty_step = minStep(Number(data.qty_step ?? case_size));
  const quantity = Number(data.quantity ?? 0) || 0;
  return {
    product_id,
    product_code: String(data.product_code || "").trim(),
    barcode: String(data.barcode || "").trim(),
    name: String(data.name || "").trim(),
    brand: String(data.brand || "").trim(),
    image_url: String(data.image_url || data.imageUrl || "").trim(),
    unit_price_gbp,
    price_gbp: unit_price_gbp,
    case_size,
    qty_step,
    country_of_origin: String(data.country_of_origin || "").trim(),
    quantity,
    line_total_gbp: Number((unit_price_gbp * quantity).toFixed(2)),
  };
}

export async function cartGetItems(email) {
  const e = normEmail(email);
  if (!e) return { items: [] };

  const now = Date.now();
  const hit = cartCache.get(e);
  if (hit && now - hit.ts < CART_TTL_MS) return hit.value;
  if (cartInflight.has(e)) return cartInflight.get(e);

  const p = (async () => {
    const snap = await getDocs(itemsCol(e));
    const items = snap.docs
      .map((d) => fromDocData(d.data(), d.id))
      .filter((it) => !!it.product_id && it.quantity > 0);
    const value = { items };
    cartCache.set(e, { ts: Date.now(), value });
    return value;
  })();

  cartInflight.set(e, p);
  try {
    return await p;
  } finally {
    cartInflight.delete(e);
  }
}

export async function cartAddItem(email, item) {
  const e = normEmail(email);
  const product_id = normProductId(item?.product_id);
  if (!e) throw new Error("Missing email");
  if (!product_id) throw new Error("Missing product_id");

  const payload = fromDocData(item, product_id);
  const step = minStep(payload.case_size);
  const safeQty = roundUpToStep(payload.quantity || step, step);
  await setDoc(
    itemRef(e, product_id),
    {
      ...payload,
      quantity: safeQty,
      qty_step: step,
      unit_price_gbp: payload.unit_price_gbp,
      line_total_gbp: Number((payload.unit_price_gbp * safeQty).toFixed(2)),
      updated_at: serverTimestamp(),
      created_at: serverTimestamp(),
    },
    { merge: true },
  );
  invalidateCartCache(e);
  return { success: true };
}

export async function cartUpdateItem(email, product_id, quantity, options = {}) {
  const e = normEmail(email);
  const pid = normProductId(product_id);
  if (!e) throw new Error("Missing email");
  if (!pid) throw new Error("Missing product_id");
  let step = minStep(options?.qty_step ?? options?.case_size ?? 0);
  let unitPrice = Number(options?.unit_price_gbp ?? options?.price_gbp ?? 0) || 0;
  if (!options?.qty_step || !options?.unit_price_gbp) {
    const snap = await getDoc(itemRef(e, pid));
    if (snap.exists()) {
      const row = fromDocData(snap.data(), pid);
      if (!options?.qty_step) step = minStep(row.qty_step || row.case_size);
      if (!options?.unit_price_gbp) unitPrice = Number(row.unit_price_gbp || row.price_gbp || 0) || 0;
    }
  }
  const safeQty = roundUpToStep(quantity, step);
  await updateDoc(itemRef(e, pid), {
    quantity: safeQty,
    qty_step: step,
    line_total_gbp: Number((unitPrice * safeQty).toFixed(2)),
    updated_at: serverTimestamp(),
  });
  invalidateCartCache(e);
  return { success: true };
}

export async function cartDeleteItem(email, product_id) {
  const e = normEmail(email);
  const pid = normProductId(product_id);
  if (!e || !pid) return { success: true };
  await deleteDoc(itemRef(e, pid));
  invalidateCartCache(e);
  return { success: true };
}

export async function cartClear(email) {
  const e = normEmail(email);
  if (!e) return { success: true };
  const snap = await getDocs(itemsCol(e));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  invalidateCartCache(e);
  return { success: true };
}
