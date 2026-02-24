import {
  collection,
  deleteDoc,
  doc,
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
  return {
    product_id,
    barcode: String(data.barcode || "").trim(),
    name: String(data.name || "").trim(),
    brand: String(data.brand || "").trim(),
    image_url: String(data.image_url || data.imageUrl || "").trim(),
    price_gbp: Number(data.price_gbp ?? data.price ?? 0) || 0,
    case_size: Number(data.case_size ?? 0) || 0,
    country_of_origin: String(data.country_of_origin || "").trim(),
    quantity: Number(data.quantity ?? 0) || 0,
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
  await setDoc(
    itemRef(e, product_id),
    {
      ...payload,
      updated_at: serverTimestamp(),
      created_at: serverTimestamp(),
    },
    { merge: true },
  );
  invalidateCartCache(e);
  return { success: true };
}

export async function cartUpdateItem(email, product_id, quantity) {
  const e = normEmail(email);
  const pid = normProductId(product_id);
  if (!e) throw new Error("Missing email");
  if (!pid) throw new Error("Missing product_id");
  await updateDoc(itemRef(e, pid), {
    quantity: Number(quantity || 0),
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
