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

const COLL = "investors";

export function createFirebaseInvestorRepo() {
  return {
    async getById(investorId) {
      const id = s(investorId);
      if (!id) return null;
      const snap = await getDoc(doc(firestoreDb, COLL, id));
      return snap.exists() ? { investor_id: snap.id, ...snap.data() } : null;
    },

    async list() {
      const snap = await getDocs(query(collection(firestoreDb, COLL), orderBy("name", "asc")));
      return snap.docs.map((d) => ({ investor_id: d.id, ...d.data() }));
    },

    async create(payload = {}) {
      const id = s(payload.investor_id);
      if (!id) throw new Error("Missing investor_id");
      const row = {
        investor_id: id,
        name: s(payload.name),
        phone: s(payload.phone),
        email: s(payload.email).toLowerCase(),
        status: s(payload.status || "active").toLowerCase(),
        default_share_pct: n(payload.default_share_pct, 0),
        opening_balance_bdt: n(payload.opening_balance_bdt, 0),
        current_balance_bdt: n(payload.current_balance_bdt, 0),
        notes: s(payload.notes),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };
      await setDoc(doc(firestoreDb, COLL, id), row, { merge: false });
      return this.getById(id);
    },

    async update(investorId, patch = {}) {
      const id = s(investorId);
      if (!id) throw new Error("Missing investor_id");
      const row = { updated_at: serverTimestamp() };
      const strFields = ["name", "phone", "email", "status", "notes"];
      strFields.forEach((f) => {
        if (f in patch) row[f] = f === "email" ? s(patch[f]).toLowerCase() : s(patch[f]);
      });
      const numFields = ["default_share_pct", "opening_balance_bdt", "current_balance_bdt"];
      numFields.forEach((f) => {
        if (f in patch) row[f] = n(patch[f], 0);
      });
      await updateDoc(doc(firestoreDb, COLL, id), row);
      return this.getById(id);
    },

    async remove(investorId) {
      const id = s(investorId);
      if (!id) return { success: true };
      await deleteDoc(doc(firestoreDb, COLL, id));
      return { success: true };
    },
  };
}

export const investorRepo = createFirebaseInvestorRepo();
