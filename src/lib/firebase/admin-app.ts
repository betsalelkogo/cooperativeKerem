import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let adminDb: Firestore | null = null;

function readAdminCredentials() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  return { projectId, clientEmail, privateKey };
}

/** Shared Firebase Admin app — used by Auth and Firestore. */
export function ensureAdminApp(): App {
  if (getApps().length) return getApps()[0];

  const { projectId, clientEmail, privateKey } = readAdminCredentials();
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin not configured");
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export function isAdminConfigured(): boolean {
  const { projectId, clientEmail, privateKey } = readAdminCredentials();
  return Boolean(projectId && clientEmail && privateKey);
}

export function getAdminDb(): Firestore {
  if (!adminDb) {
    adminDb = getFirestore(ensureAdminApp());
  }
  return adminDb;
}

/** Firestore rejects explicit `undefined` — omit optional fields instead. */
export function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as Partial<T>;
}
