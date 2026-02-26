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

const COLL = "orders";

export function createFirebaseOrderRepo() {
  return {
    async nextOrderSl() {
      const rows = await this.listAll();
      const maxSl = rows.reduce((mx, r) => Math.max(mx, Math.round(n(r.order_sl, 0))), 0);
      return maxSl + 1;
    },

    async getById(orderId) {
      const id = s(orderId);
      if (!id) return null;
      const snap = await getDoc(doc(firestoreDb, COLL, id));
      return snap.exists() ? { order_id: snap.id, ...snap.data() } : null;
    },

    async listAll() {
      const snap = await getDocs(query(collection(firestoreDb, COLL), orderBy("created_at", "desc")));
      return snap.docs.map((d) => ({ order_id: d.id, ...d.data() }));
    },

    async listByCreatorEmail(email) {
      const e = s(email).toLowerCase();
      if (!e) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, COLL), where("creator_email", "==", e), orderBy("created_at", "desc")),
      );
      return snap.docs.map((d) => ({ order_id: d.id, ...d.data() }));
    },

    async create(payload = {}) {
      const id = s(payload.order_id);
      if (!id) throw new Error("Missing order_id");
      const row = {
        order_id: id,
        order_sl: Math.max(1, Math.round(n(payload.order_sl, 1))),
        order_name: s(payload.order_name),
        creator_email: s(payload.creator_email).toLowerCase(),
        creator_name: s(payload.creator_name),
        creator_role: s(payload.creator_role || "customer").toLowerCase(),
        status: s(payload.status || "submitted").toLowerCase(),
        shipment_id: s(payload.shipment_id),
        total_needed_qty: n(payload.total_needed_qty, 0),
        total_delivered_qty: n(payload.total_delivered_qty, 0),
        shipment_count: n(payload.shipment_count, 0),
        total_purchase_gbp: n(payload.total_purchase_gbp, 0),
        total_final_bdt: n(payload.total_final_bdt, 0),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };
      await setDoc(doc(firestoreDb, COLL, id), row, { merge: false });
      return this.getById(id);
    },

    async update(orderId, patch = {}) {
      const id = s(orderId);
      if (!id) throw new Error("Missing order_id");
      const row = { updated_at: serverTimestamp() };
      if ("order_sl" in patch) row.order_sl = Math.max(1, Math.round(n(patch.order_sl, 1)));
      if ("order_name" in patch) row.order_name = s(patch.order_name);
      if ("creator_name" in patch) row.creator_name = s(patch.creator_name);
      if ("creator_role" in patch) row.creator_role = s(patch.creator_role).toLowerCase();
      if ("status" in patch) row.status = s(patch.status).toLowerCase();
      if ("shipment_id" in patch) row.shipment_id = s(patch.shipment_id);
      if ("total_needed_qty" in patch) row.total_needed_qty = n(patch.total_needed_qty, 0);
      if ("total_delivered_qty" in patch) row.total_delivered_qty = n(patch.total_delivered_qty, 0);
      if ("shipment_count" in patch) row.shipment_count = n(patch.shipment_count, 0);
      if ("total_purchase_gbp" in patch) row.total_purchase_gbp = n(patch.total_purchase_gbp, 0);
      if ("total_final_bdt" in patch) row.total_final_bdt = n(patch.total_final_bdt, 0);
      await updateDoc(doc(firestoreDb, COLL, id), row);
      return this.getById(id);
    },

    async remove(orderId) {
      const id = s(orderId);
      if (!id) return { success: true };
      await deleteDoc(doc(firestoreDb, COLL, id));
      return { success: true };
    },
  };
}

export const orderRepo = createFirebaseOrderRepo();
