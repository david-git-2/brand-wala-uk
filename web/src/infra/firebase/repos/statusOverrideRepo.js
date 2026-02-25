import { addDoc, collection, serverTimestamp } from "firebase/firestore/lite";
import { firestoreDb } from "@/firebase/client";

function s(v) {
  return String(v || "").trim();
}

export function createFirebaseStatusOverrideRepo() {
  return {
    async log(entry = {}) {
      const docRef = await addDoc(collection(firestoreDb, "status_overrides"), {
        entity_type: s(entry.entity_type),
        entity_id: s(entry.entity_id),
        from_status: s(entry.from_status).toLowerCase(),
        to_status: s(entry.to_status).toLowerCase(),
        reason: s(entry.reason),
        actor_email: s(entry.actor_email).toLowerCase(),
        actor_role: s(entry.actor_role).toLowerCase(),
        created_at: serverTimestamp(),
      });
      return { override_id: docRef.id };
    },
  };
}

export const statusOverrideRepo = createFirebaseStatusOverrideRepo();
