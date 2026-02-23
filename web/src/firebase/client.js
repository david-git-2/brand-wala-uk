import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore/lite";

function getFirebaseConfig() {
  const cfg = window.BW_CONFIG?.FIREBASE || {};
  const required = [
    "apiKey",
    "authDomain",
    "projectId",
    "appId",
  ];

  const missing = required.filter((k) => !String(cfg?.[k] || "").trim());
  if (missing.length) {
    throw new Error(`Missing BW_CONFIG.FIREBASE fields: ${missing.join(", ")}`);
  }

  return cfg;
}

const app = initializeApp(getFirebaseConfig());

export const firebaseApp = app;
export const firebaseAuth = getAuth(app);
export const firestoreDb = getFirestore(app);
