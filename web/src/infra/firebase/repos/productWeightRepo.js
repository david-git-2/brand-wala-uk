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

function normalizeWeightKey(payload = {}) {
  const fromPayload = s(payload.weight_key);
  if (fromPayload) return fromPayload;
  const productId = s(payload.product_id);
  const barcode = s(payload.barcode);
  if (productId && barcode) return `${productId}-${barcode}`;
  if (productId) return productId;
  return "";
}

const COLL = "product_weights";

export function createFirebaseProductWeightRepo() {
  return {
    async getById(weightKey) {
      const id = s(weightKey);
      if (!id) return null;
      const snap = await getDoc(doc(firestoreDb, COLL, id));
      return snap.exists() ? { weight_key: snap.id, ...snap.data() } : null;
    },

    async getByProductId(productId) {
      const pid = s(productId);
      if (!pid) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, COLL), where("product_id", "==", pid), orderBy("updated_at", "desc")),
      );
      return snap.docs.map((d) => ({ weight_key: d.id, ...d.data() }));
    },

    async list() {
      const snap = await getDocs(query(collection(firestoreDb, COLL), orderBy("name", "asc")));
      return snap.docs.map((d) => ({ weight_key: d.id, ...d.data() }));
    },

    async create(payload = {}) {
      const id = normalizeWeightKey(payload);
      if (!id) throw new Error("Missing weight_key or product identifier");
      const unitProduct = ni(payload.unit_product_weight_g, 0);
      const unitPackage = ni(payload.unit_package_weight_g, 0);
      const row = {
        weight_key: id,
        product_id: s(payload.product_id),
        product_code: s(payload.product_code),
        barcode: s(payload.barcode),
        name: s(payload.name),
        unit_product_weight_g: unitProduct,
        unit_package_weight_g: unitPackage,
        unit_total_weight_g: ni(payload.unit_total_weight_g, unitProduct + unitPackage),
        source: s(payload.source || "manual"),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };
      await setDoc(doc(firestoreDb, COLL, id), row, { merge: false });
      return this.getById(id);
    },

    async update(weightKey, patch = {}) {
      const id = s(weightKey);
      if (!id) throw new Error("Missing weight_key");
      const row = { updated_at: serverTimestamp() };
      const strFields = ["product_id", "product_code", "barcode", "name", "source"];
      strFields.forEach((f) => {
        if (f in patch) row[f] = s(patch[f]);
      });
      const intFields = ["unit_product_weight_g", "unit_package_weight_g", "unit_total_weight_g"];
      intFields.forEach((f) => {
        if (f in patch) row[f] = ni(patch[f], 0);
      });
      await updateDoc(doc(firestoreDb, COLL, id), row);
      return this.getById(id);
    },

    async remove(weightKey) {
      const id = s(weightKey);
      if (!id) return { success: true };
      await deleteDoc(doc(firestoreDb, COLL, id));
      return { success: true };
    },
  };
}

export const productWeightRepo = createFirebaseProductWeightRepo();
