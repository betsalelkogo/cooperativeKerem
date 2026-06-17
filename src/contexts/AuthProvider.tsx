"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { authFetch } from "@/lib/api-client";
import { DEFAULT_MEMBER_ROLE } from "@/lib/admin";
import { upsertMemberFromUser } from "@/lib/firebase/members";
import type { Member } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  member: Member | null;
  loading: boolean;
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  refreshMember: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }

    let unsubscribe: (() => void) | undefined;

    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          setUser(firebaseUser);
          if (firebaseUser) {
            try {
              const memberRecord = await upsertMemberFromUser(firebaseUser);
              setMember(memberRecord);

              const token = await firebaseUser.getIdToken();
              const res = await authFetch("/api/me", { token });
              if (res.ok) {
                const { member: synced } = await res.json();
                setMember(synced);
              }
            } catch {
              setMember({
                id: firebaseUser.uid,
                name: firebaseUser.displayName ?? "חבר",
                email: firebaseUser.email ?? "",
                hasPaymentMethod: false,
                role: DEFAULT_MEMBER_ROLE,
              });
            }
          } else {
            setMember(null);
          }
          setLoading(false);
        });
      })
      .catch(() => setLoading(false));

    return () => unsubscribe?.();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase לא מוגדר");

    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }, []);

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await firebaseSignOut(auth);
  }, []);

  const getIdToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  const refreshMember = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await authFetch("/api/me", { token });
      if (res.ok) {
        const { member: synced } = await res.json();
        setMember(synced);
      }
    } catch {
      // ignore — caller can retry
    }
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      member,
      loading,
      configured,
      signInWithGoogle,
      signOut,
      getIdToken,
      refreshMember,
    }),
    [user, member, loading, configured, signInWithGoogle, signOut, getIdToken, refreshMember]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
