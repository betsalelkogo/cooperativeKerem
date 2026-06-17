import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getFirebaseDb } from "./client";
import type { Member } from "@/lib/types";
import { roleFromMemberData, DEFAULT_MEMBER_ROLE, gemachAdminIdsFromData } from "@/lib/admin";

export async function upsertMemberFromUser(user: User): Promise<Member> {
  const db = getFirebaseDb();
  if (!db) {
    return {
      id: user.uid,
      name: user.displayName ?? user.email ?? "חבר",
      email: user.email ?? "",
      hasPaymentMethod: false,
      role: DEFAULT_MEMBER_ROLE,
    };
  }

  const ref = doc(db, "members", user.uid);
  const existing = await getDoc(ref);

  const memberData = {
    name: user.displayName ?? user.email ?? "חבר",
    email: user.email ?? "",
    photoURL: user.photoURL ?? null,
    hasPaymentMethod: existing.exists()
      ? (existing.data().hasPaymentMethod as boolean)
      : false,
    updatedAt: serverTimestamp(),
    ...(existing.exists() ? {} : { createdAt: serverTimestamp(), role: DEFAULT_MEMBER_ROLE }),
  };

  await setDoc(ref, memberData, { merge: true });

  const role = existing.exists()
    ? roleFromMemberData(existing.data())
    : DEFAULT_MEMBER_ROLE;

  const gemachAdminIds = existing.exists()
    ? gemachAdminIdsFromData(existing.data())
    : [];

  return {
    id: user.uid,
    name: memberData.name,
    email: memberData.email,
    hasPaymentMethod: memberData.hasPaymentMethod,
    role,
    gemachAdminIds,
  };
}

export async function getMember(uid: string): Promise<Member | null> {
  const db = getFirebaseDb();
  if (!db) return null;

  const snap = await getDoc(doc(db, "members", uid));
  if (!snap.exists()) return null;

  const data = snap.data();
  return {
    id: uid,
    name: data.name as string,
    email: data.email as string,
    hasPaymentMethod: (data.hasPaymentMethod as boolean) ?? false,
    role: roleFromMemberData(data),
    gemachAdminIds: gemachAdminIdsFromData(data),
  };
}
