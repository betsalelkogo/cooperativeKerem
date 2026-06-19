import { getAuth, type Auth } from "firebase-admin/auth";
import { ensureAdminApp, isAdminConfigured } from "@/lib/firebase/admin-app";

export { isAdminConfigured };

export function getAdminAuth(): Auth | null {
  try {
    return getAuth(ensureAdminApp());
  } catch {
    return null;
  }
}

export async function verifyIdToken(token: string): Promise<string | null> {
  const auth = getAdminAuth();
  if (!auth) return null;
  try {
    const decoded = await auth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function getUidFromRequest(request: Request): Promise<string | null> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return verifyIdToken(header.slice(7));
}
