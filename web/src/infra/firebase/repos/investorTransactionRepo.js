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

function to01(v, fallback = 0) {
  const x = Number(v);
  if (Number.isFinite(x)) return x === 1 ? 1 : 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  const t = s(v).toLowerCase();
  if (t === "1" || t === "true" || t === "yes") return 1;
  if (t === "0" || t === "false" || t === "no") return 0;
  return fallback;
}

const COLL = "investor_transactions";

export function createFirebaseInvestorTransactionRepo() {
  return {
    async getById(txnId) {
      const id = s(txnId);
      if (!id) return null;
      const snap = await getDoc(doc(firestoreDb, COLL, id));
      return snap.exists() ? { txn_id: snap.id, ...snap.data() } : null;
    },

    async listByInvestorId(investorId) {
      const iid = s(investorId);
      if (!iid) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, COLL), where("investor_id", "==", iid), orderBy("txn_at", "desc")),
      );
      return snap.docs.map((d) => ({ txn_id: d.id, ...d.data() }));
    },

    async listByPeriod(periodKey) {
      const p = s(periodKey);
      if (!p) return [];
      const snap = await getDocs(
        query(collection(firestoreDb, COLL), where("period_key", "==", p), orderBy("txn_at", "desc")),
      );
      return snap.docs.map((d) => ({ txn_id: d.id, ...d.data() }));
    },

    async create(payload = {}) {
      const id = s(payload.txn_id);
      if (!id) throw new Error("Missing txn_id");
      const row = {
        txn_id: id,
        investor_id: s(payload.investor_id),
        type: s(payload.type),
        direction: s(payload.direction),
        amount_bdt: n(payload.amount_bdt, 0),
        running_balance_bdt: n(payload.running_balance_bdt, 0),
        is_shipment_linked: to01(payload.is_shipment_linked, 0),
        shipment_id: s(payload.shipment_id),
        shipment_accounting_id: s(payload.shipment_accounting_id),
        fiscal_year: ni(payload.fiscal_year, 0),
        fiscal_month: Math.min(12, Math.max(1, ni(payload.fiscal_month, 1))),
        period_key: s(payload.period_key),
        ref_no: s(payload.ref_no),
        note: s(payload.note),
        txn_at: payload.txn_at || null,
        created_by: s(payload.created_by).toLowerCase(),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };
      await setDoc(doc(firestoreDb, COLL, id), row, { merge: false });
      return this.getById(id);
    },

    async update(txnId, patch = {}) {
      const id = s(txnId);
      if (!id) throw new Error("Missing txn_id");
      const row = { updated_at: serverTimestamp() };

      const strFields = [
        "investor_id",
        "type",
        "direction",
        "shipment_id",
        "shipment_accounting_id",
        "period_key",
        "ref_no",
        "note",
      ];
      strFields.forEach((f) => {
        if (f in patch) row[f] = s(patch[f]);
      });

      if ("amount_bdt" in patch) row.amount_bdt = n(patch.amount_bdt, 0);
      if ("running_balance_bdt" in patch) row.running_balance_bdt = n(patch.running_balance_bdt, 0);
      if ("is_shipment_linked" in patch) row.is_shipment_linked = to01(patch.is_shipment_linked, 0);
      if ("fiscal_year" in patch) row.fiscal_year = ni(patch.fiscal_year, 0);
      if ("fiscal_month" in patch) row.fiscal_month = Math.min(12, Math.max(1, ni(patch.fiscal_month, 1)));
      if ("txn_at" in patch) row.txn_at = patch.txn_at || null;
      if ("created_by" in patch) row.created_by = s(patch.created_by).toLowerCase();

      await updateDoc(doc(firestoreDb, COLL, id), row);
      return this.getById(id);
    },

    async remove(txnId) {
      const id = s(txnId);
      if (!id) return { success: true };
      await deleteDoc(doc(firestoreDb, COLL, id));
      return { success: true };
    },
  };
}

export const investorTransactionRepo = createFirebaseInvestorTransactionRepo();
