import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore/lite";

function getFirebaseConfig() {
  const cfg = {
    apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || "").trim(),
    authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "").trim(),
    projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim(),
    storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "").trim(),
    messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "").trim(),
    appId: String(import.meta.env.VITE_FIREBASE_APP_ID || "").trim(),
  };
  const required = [
    "apiKey",
    "authDomain",
    "projectId",
    "appId",
  ];

  const missing = required.filter((k) => !String(cfg?.[k] || "").trim());
  if (missing.length) {
    throw new Error(`Missing VITE_FIREBASE fields: ${missing.join(", ")}`);
  }

  return cfg;
}

const app = initializeApp(getFirebaseConfig());

export const firebaseApp = app;
export const firebaseAuth = getAuth(app);
export const firestoreDb = getFirestore(app);
