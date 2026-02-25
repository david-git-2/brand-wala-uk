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
  where,
} from "firebase/firestore/lite";
import { firestoreDb } from "@/firebase/client";

function s(v) {
  return String(v || "").trim();
}
function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

const COLL = "order_items";

export function createFirebaseOrderItemRepo() {
  return {
    async getById(orderItemId) {
      const id = s(orderItemId);
      if (!id) return null;
      const snap = await getDoc(doc(firestoreDb, COLL, id));
      return snap.exists() ? { order_item_id: snap.id, ...snap.data() } : null;
    },

    async listByOrderId(orderId) {
      const oid = s(orderId);
      if (!oid) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, COLL), where("order_id", "==", oid), orderBy("item_sl", "asc")),
      );
      return snap.docs.map((d) => ({ order_item_id: d.id, ...d.data() }));
    },

    async create(payload = {}) {
      const id = s(payload.order_item_id);
      if (!id) throw new Error("Missing order_item_id");
      const row = {
        order_item_id: id,
        order_id: s(payload.order_id),
        item_sl: Math.max(1, Math.round(n(payload.item_sl, 1))),
        product_id: s(payload.product_id),
        product_code: s(payload.product_code),
        barcode: s(payload.barcode),
        name: s(payload.name),
        brand: s(payload.brand),
        image_url: s(payload.image_url),
        case_size: n(payload.case_size, 0),
        needed_quantity: n(payload.needed_quantity, 0),
        delivered_quantity: n(payload.delivered_quantity, 0),
        purchase_price_gbp: n(payload.purchase_price_gbp, 0),
        offer_price_bdt_on_purchase: n(payload.offer_price_bdt_on_purchase, 0),
        offer_price_bdt_on_total: n(payload.offer_price_bdt_on_total, 0),
        offer_price_mode: s(payload.offer_price_mode || "purchase").toLowerCase(),
        offered_price_bdt: n(payload.offered_price_bdt, 0),
        customer_counter_offer_price_bdt: n(payload.customer_counter_offer_price_bdt, 0),
        final_price_bdt: n(payload.final_price_bdt, 0),
        profit_rate: n(payload.profit_rate, 0),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };
      await setDoc(doc(firestoreDb, COLL, id), row, { merge: false });
      return this.getById(id);
    },

    async update(orderItemId, patch = {}) {
      const id = s(orderItemId);
      if (!id) throw new Error("Missing order_item_id");
      const row = { updated_at: serverTimestamp() };
      const fields = [
        "order_id",
        "product_id",
        "product_code",
        "barcode",
        "name",
        "brand",
        "image_url",
        "offer_price_mode",
      ];
      fields.forEach((f) => {
        if (f in patch) row[f] = s(patch[f]);
      });
      const nums = [
        "item_sl",
        "case_size",
        "needed_quantity",
        "delivered_quantity",
        "purchase_price_gbp",
        "offer_price_bdt_on_purchase",
        "offer_price_bdt_on_total",
        "offered_price_bdt",
        "customer_counter_offer_price_bdt",
        "final_price_bdt",
        "profit_rate",
      ];
      nums.forEach((f) => {
        if (f in patch) row[f] = n(patch[f], 0);
      });
      await updateDoc(doc(firestoreDb, COLL, id), row);
      return this.getById(id);
    },

    async remove(orderItemId) {
      const id = s(orderItemId);
      if (!id) return { success: true };
      await deleteDoc(doc(firestoreDb, COLL, id));
      return { success: true };
    },
  };
}

export const orderItemRepo = createFirebaseOrderItemRepo();
