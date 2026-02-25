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

const COLL = "shipments";

export function createFirebaseShipmentRepo() {
  return {
    async getById(shipmentId) {
      const id = s(shipmentId);
      if (!id) return null;
      const snap = await getDoc(doc(firestoreDb, COLL, id));
      return snap.exists() ? { shipment_id: snap.id, ...snap.data() } : null;
    },

    async list() {
      const snap = await getDocs(query(collection(firestoreDb, COLL), orderBy("created_at", "desc")));
      return snap.docs.map((d) => ({ shipment_id: d.id, ...d.data() }));
    },

    async create(payload = {}) {
      const id = s(payload.shipment_id);
      if (!id) throw new Error("Missing shipment_id");
      const row = {
        shipment_id: id,
        name: s(payload.name),
        status: s(payload.status || "draft").toLowerCase(),
        cargo_cost_per_kg_gbp: n(payload.cargo_cost_per_kg_gbp, 0),
        gbp_rate_product_bdt: n(payload.gbp_rate_product_bdt, 0),
        gbp_rate_cargo_bdt: n(payload.gbp_rate_cargo_bdt, 0),
        gbp_rate_avg_bdt: n(payload.gbp_rate_avg_bdt, 0),
        order_date: payload.order_date || null,
        arrived_date: payload.arrived_date || null,
        total_value_gbp: n(payload.total_value_gbp, 0),
        total_weight_g: n(payload.total_weight_g, 0),
        received_weight_g: n(payload.received_weight_g, 0),
        notes: s(payload.notes),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };
      await setDoc(doc(firestoreDb, COLL, id), row, { merge: false });
      return this.getById(id);
    },

    async update(shipmentId, patch = {}) {
      const id = s(shipmentId);
      if (!id) throw new Error("Missing shipment_id");
      const row = { updated_at: serverTimestamp() };
      const strFields = ["name", "status", "notes"];
      strFields.forEach((f) => {
        if (f in patch) row[f] = s(patch[f]);
      });
      const numFields = [
        "cargo_cost_per_kg_gbp",
        "gbp_rate_product_bdt",
        "gbp_rate_cargo_bdt",
        "gbp_rate_avg_bdt",
        "total_value_gbp",
        "total_weight_g",
        "received_weight_g",
      ];
      numFields.forEach((f) => {
        if (f in patch) row[f] = n(patch[f], 0);
      });
      if ("order_date" in patch) row.order_date = patch.order_date || null;
      if ("arrived_date" in patch) row.arrived_date = patch.arrived_date || null;
      await updateDoc(doc(firestoreDb, COLL, id), row);
      return this.getById(id);
    },

    async remove(shipmentId) {
      const id = s(shipmentId);
      if (!id) return { success: true };
      await deleteDoc(doc(firestoreDb, COLL, id));
      return { success: true };
    },
  };
}

export const shipmentRepo = createFirebaseShipmentRepo();
