import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
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

const COLL = "shipment_allocations";

function makeId() {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rnd = Math.floor(Math.random() * 900000) + 100000;
  return `ALC_${ts}_${rnd}`;
}

export function createFirebaseShipmentAllocationRepo() {
  return {
    async getById(allocationId) {
      const id = s(allocationId);
      if (!id) return null;
      const snap = await getDoc(doc(firestoreDb, COLL, id));
      return snap.exists() ? { allocation_id: snap.id, ...snap.data() } : null;
    },

    async listByShipmentId(shipmentId) {
      const sid = s(shipmentId);
      if (!sid) return [];
      const snap = await getDocs(query(collection(firestoreDb, COLL), where("shipment_id", "==", sid)));
      return snap.docs.map((d) => ({ allocation_id: d.id, ...d.data() }));
    },

    async listByOrderItemId(orderItemId) {
      const oid = s(orderItemId);
      if (!oid) return [];
      const snap = await getDocs(query(collection(firestoreDb, COLL), where("order_item_id", "==", oid)));
      return snap.docs.map((d) => ({ allocation_id: d.id, ...d.data() }));
    },

    async create(payload = {}) {
      const id = s(payload.allocation_id) || makeId();
      const row = {
        allocation_id: id,
        shipment_id: s(payload.shipment_id),
        product_id: s(payload.product_id),
        order_id: s(payload.order_id),
        order_item_id: s(payload.order_item_id),
        planned_qty: n(payload.planned_qty, 0),
        arrived_qty_share: n(payload.arrived_qty_share, 0),
        damaged_qty_share: n(payload.damaged_qty_share, 0),
        expired_qty_share: n(payload.expired_qty_share, 0),
        stolen_qty_share: n(payload.stolen_qty_share, 0),
        other_qty_share: n(payload.other_qty_share, 0),
        customer_delivered_qty: n(payload.customer_delivered_qty, 0),
        unit_product_weight_g: Math.round(n(payload.unit_product_weight_g, 0)),
        unit_package_weight_g: Math.round(n(payload.unit_package_weight_g, 0)),
        unit_total_weight_g: Math.round(n(payload.unit_total_weight_g, 0)),
        purchase_unit_gbp_snapshot: n(payload.purchase_unit_gbp_snapshot, 0),
        line_purchase_gbp: n(payload.line_purchase_gbp, 0),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };
      await setDoc(doc(firestoreDb, COLL, id), row, { merge: false });
      return this.getById(id);
    },

    async update(allocationId, patch = {}) {
      const id = s(allocationId);
      if (!id) throw new Error("Missing allocation_id");
      const row = { updated_at: serverTimestamp() };
      const strFields = ["shipment_id", "product_id", "order_id", "order_item_id"];
      strFields.forEach((f) => {
        if (f in patch) row[f] = s(patch[f]);
      });
      const numFields = [
        "planned_qty",
        "arrived_qty_share",
        "damaged_qty_share",
        "expired_qty_share",
        "stolen_qty_share",
        "other_qty_share",
        "customer_delivered_qty",
        "unit_product_weight_g",
        "unit_package_weight_g",
        "unit_total_weight_g",
        "purchase_unit_gbp_snapshot",
        "line_purchase_gbp",
      ];
      numFields.forEach((f) => {
        if (f in patch) row[f] = n(patch[f], 0);
      });
      await updateDoc(doc(firestoreDb, COLL, id), row);
      return this.getById(id);
    },

    async remove(allocationId) {
      const id = s(allocationId);
      if (!id) return { success: true };
      await deleteDoc(doc(firestoreDb, COLL, id));
      return { success: true };
    },
  };
}

export const shipmentAllocationRepo = createFirebaseShipmentAllocationRepo();
