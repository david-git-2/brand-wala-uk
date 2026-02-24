import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2";

initializeApp();
setGlobalOptions({maxInstances: 10});

type UserDoc = {
  role?: string;
  active?: number | boolean | string;
  can_see_price_gbp?: number | boolean | string;
  can_use_cart?: number | boolean | string;
};

type AppClaims = {
  role: "admin" | "customer";
  active: boolean;
  can_see_price_gbp: boolean;
  can_use_cart: boolean;
};

function toBool(v: unknown, fallback = false): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  if (typeof v === "number") return v === 1;
  if (typeof v === "boolean") return v;
  return fallback;
}

function toRole(v: unknown): "admin" | "customer" {
  return String(v || "").trim().toLowerCase() === "admin" ? "admin" : "customer";
}

function claimsFromUserDoc(raw?: UserDoc): AppClaims {
  return {
    role: toRole(raw?.role),
    active: toBool(raw?.active, true),
    can_see_price_gbp: toBool(raw?.can_see_price_gbp, false),
    can_use_cart: toBool(raw?.can_use_cart, true),
  };
}

async function setClaimsByEmail(email: string, claims: AppClaims): Promise<boolean> {
  const auth = getAuth();
  try {
    const user = await auth.getUserByEmail(email);
    await auth.setCustomUserClaims(user.uid, claims);
    if (!claims.active) {
      await auth.revokeRefreshTokens(user.uid);
    }
    return true;
  } catch {
    return false;
  }
}

export const syncUserClaimsOnUserWrite = onDocumentWritten(
  "users/{userEmail}",
  async (event) => {
    const email = String(event.params.userEmail || "").trim().toLowerCase();
    if (!email) return;

    const after = event.data?.after;
    if (!after?.exists) {
      await setClaimsByEmail(email, {
        role: "customer",
        active: false,
        can_see_price_gbp: false,
        can_use_cart: false,
      });
      return;
    }

    const data = after.data() as UserDoc;
    const claims = claimsFromUserDoc(data);
    await setClaimsByEmail(email, claims);
  },
);

export const syncMyClaims = onCall(async (request) => {
  const auth = request.auth;
  const email = String(auth?.token?.email || "").trim().toLowerCase();
  const uid = String(auth?.uid || "").trim();
  if (!auth || !email || !uid) {
    throw new HttpsError("unauthenticated", "Please sign in first.");
  }

  const db = getFirestore();
  const snap = await db.doc(`users/${email}`).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "User profile not found.");
  }

  const claims = claimsFromUserDoc(snap.data() as UserDoc);
  await getAuth().setCustomUserClaims(uid, claims);
  if (!claims.active) {
    await getAuth().revokeRefreshTokens(uid);
  }

  return {ok: true, claims};
});
