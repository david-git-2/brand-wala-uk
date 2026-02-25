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
import { firestoreDb } from "@/firebase/client";

function s(v) {
  return String(v || "").trim();
}
function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

const COLL = "shipment_accounting";

export function createFirebaseShipmentAccountingRepo() {
  return {
    async getByShipmentId(shipmentId) {
      const id = s(shipmentId);
      if (!id) return null;
      const snap = await getDoc(doc(firestoreDb, COLL, id));
      return snap.exists() ? { shipment_id: snap.id, ...snap.data() } : null;
    },

    async create(payload = {}) {
      const id = s(payload.shipment_id);
      if (!id) throw new Error("Missing shipment_id");
      const row = {
        shipment_id: id,
        shipment_name: s(payload.shipment_name),
        cost_total_gbp: n(payload.cost_total_gbp, 0),
        cost_rate_bdt_per_gbp: n(payload.cost_rate_bdt_per_gbp, 0),
        cost_total_bdt: n(payload.cost_total_bdt, 0),
        revenue_expected_bdt: n(payload.revenue_expected_bdt, 0),
        revenue_collected_bdt: n(payload.revenue_collected_bdt, 0),
        receivable_bdt: n(payload.receivable_bdt, 0),
        profit_bdt: n(payload.profit_bdt, 0),
        status: s(payload.status || "open").toLowerCase(),
        closed_at: payload.closed_at || null,
        customer_payment_summary: Array.isArray(payload.customer_payment_summary)
          ? payload.customer_payment_summary
          : [],
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };
      await setDoc(doc(firestoreDb, COLL, id), row, { merge: false });
      return this.getByShipmentId(id);
    },

    async update(shipmentId, patch = {}) {
      const id = s(shipmentId);
      if (!id) throw new Error("Missing shipment_id");
      const row = { updated_at: serverTimestamp() };
      const strFields = ["shipment_name", "status"];
      strFields.forEach((f) => {
        if (f in patch) row[f] = s(patch[f]);
      });
      const numFields = [
        "cost_total_gbp",
        "cost_rate_bdt_per_gbp",
        "cost_total_bdt",
        "revenue_expected_bdt",
        "revenue_collected_bdt",
        "receivable_bdt",
        "profit_bdt",
      ];
      numFields.forEach((f) => {
        if (f in patch) row[f] = n(patch[f], 0);
      });
      if ("closed_at" in patch) row.closed_at = patch.closed_at || null;
      if ("customer_payment_summary" in patch) {
        row.customer_payment_summary = Array.isArray(patch.customer_payment_summary)
          ? patch.customer_payment_summary
          : [];
      }
      await updateDoc(doc(firestoreDb, COLL, id), row);
      return this.getByShipmentId(id);
    },

    async remove(shipmentId) {
      const id = s(shipmentId);
      if (!id) return { success: true };
      await deleteDoc(doc(firestoreDb, COLL, id));
      return { success: true };
    },

    async listPayments(shipmentId) {
      const id = s(shipmentId);
      if (!id) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, COLL, id, "customer_payments"), orderBy("paid_at", "desc")),
      );
      return snap.docs.map((d) => ({ payment_id: d.id, ...d.data() }));
    },

    async addPayment(shipmentId, paymentId, payload = {}) {
      const sid = s(shipmentId);
      const pid = s(paymentId);
      if (!sid || !pid) throw new Error("shipment_id and payment_id are required");
      const row = {
        customer_email: s(payload.customer_email).toLowerCase(),
        customer_name: s(payload.customer_name),
        amount_bdt: n(payload.amount_bdt, 0),
        method: s(payload.method || "other").toLowerCase(),
        note: s(payload.note),
        paid_at: payload.paid_at || null,
        created_by: s(payload.created_by).toLowerCase(),
        created_at: serverTimestamp(),
      };
      await setDoc(doc(firestoreDb, COLL, sid, "customer_payments", pid), row, { merge: false });
      return { payment_id: pid, ...row };
    },

    async updatePayment(shipmentId, paymentId, patch = {}) {
      const sid = s(shipmentId);
      const pid = s(paymentId);
      if (!sid || !pid) throw new Error("shipment_id and payment_id are required");
      const row = {};
      if ("customer_email" in patch) row.customer_email = s(patch.customer_email).toLowerCase();
      if ("customer_name" in patch) row.customer_name = s(patch.customer_name);
      if ("amount_bdt" in patch) row.amount_bdt = n(patch.amount_bdt, 0);
      if ("method" in patch) row.method = s(patch.method).toLowerCase();
      if ("note" in patch) row.note = s(patch.note);
      if ("paid_at" in patch) row.paid_at = patch.paid_at || null;
      if ("created_by" in patch) row.created_by = s(patch.created_by).toLowerCase();
      await updateDoc(doc(firestoreDb, COLL, sid, "customer_payments", pid), row);
      return { payment_id: pid, ...row };
    },

    async removePayment(shipmentId, paymentId) {
      const sid = s(shipmentId);
      const pid = s(paymentId);
      if (!sid || !pid) return { success: true };
      await deleteDoc(doc(firestoreDb, COLL, sid, "customer_payments", pid));
      return { success: true };
    },
  };
}

export const shipmentAccountingRepo = createFirebaseShipmentAccountingRepo();
