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
function ni(v, d = 0) {
  return Math.max(0, Math.round(n(v, d)));
}

const COLL = "shipment_items";

export function createFirebaseShipmentItemRepo() {
  return {
    async getById(shipmentItemId) {
      const id = s(shipmentItemId);
      if (!id) return null;
      const snap = await getDoc(doc(firestoreDb, COLL, id));
      return snap.exists() ? { shipment_item_id: snap.id, ...snap.data() } : null;
    },

    async listByShipmentId(shipmentId) {
      const sid = s(shipmentId);
      if (!sid) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, COLL), where("shipment_id", "==", sid), orderBy("item_name", "asc")),
      );
      return snap.docs.map((d) => ({ shipment_item_id: d.id, ...d.data() }));
    },

    async create(payload = {}) {
      const shipment_id = s(payload.shipment_id);
      const product_id = s(payload.product_id);
      if (!shipment_id || !product_id) throw new Error("shipment_id and product_id are required");
      const id = s(payload.shipment_item_id) || `${shipment_id}__${product_id}`;
      const row = {
        shipment_item_id: id,
        shipment_id,
        product_id,
        product_code: s(payload.product_code),
        barcode: s(payload.barcode),
        item_name: s(payload.item_name),
        image_url: s(payload.image_url),
        needed_qty: n(payload.needed_qty, 0),
        arrived_qty: n(payload.arrived_qty, 0),
        damaged_qty: n(payload.damaged_qty, 0),
        expired_qty: n(payload.expired_qty, 0),
        stolen_qty: n(payload.stolen_qty, 0),
        other_qty: n(payload.other_qty, 0),
        delivered_qty: n(payload.delivered_qty, 0),
        unit_product_weight_g: ni(payload.unit_product_weight_g, 0),
        unit_package_weight_g: ni(payload.unit_package_weight_g, 0),
        unit_total_weight_g: ni(
          payload.unit_total_weight_g,
          ni(payload.unit_product_weight_g, 0) + ni(payload.unit_package_weight_g, 0),
        ),
        received_weight_g: n(payload.received_weight_g, 0),
        purchase_unit_gbp: n(payload.purchase_unit_gbp, 0),
        total_value_gbp: n(payload.total_value_gbp, 0),
        order_refs: Array.isArray(payload.order_refs) ? payload.order_refs : [],
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };
      await setDoc(doc(firestoreDb, COLL, id), row, { merge: false });
      return this.getById(id);
    },

    async update(shipmentItemId, patch = {}) {
      const id = s(shipmentItemId);
      if (!id) throw new Error("Missing shipment_item_id");
      const row = { updated_at: serverTimestamp() };
      const strFields = ["product_code", "barcode", "item_name", "image_url"];
      strFields.forEach((f) => {
        if (f in patch) row[f] = s(patch[f]);
      });
      const numFields = [
        "needed_qty",
        "arrived_qty",
        "damaged_qty",
        "expired_qty",
        "stolen_qty",
        "other_qty",
        "delivered_qty",
        "received_weight_g",
        "purchase_unit_gbp",
        "total_value_gbp",
      ];
      numFields.forEach((f) => {
        if (f in patch) row[f] = n(patch[f], 0);
      });
      const intFields = ["unit_product_weight_g", "unit_package_weight_g", "unit_total_weight_g"];
      intFields.forEach((f) => {
        if (f in patch) row[f] = ni(patch[f], 0);
      });
      if ("order_refs" in patch) row.order_refs = Array.isArray(patch.order_refs) ? patch.order_refs : [];
      await updateDoc(doc(firestoreDb, COLL, id), row);
      return this.getById(id);
    },

    async remove(shipmentItemId) {
      const id = s(shipmentItemId);
      if (!id) return { success: true };
      await deleteDoc(doc(firestoreDb, COLL, id));
      return { success: true };
    },
  };
}

export const shipmentItemRepo = createFirebaseShipmentItemRepo();
