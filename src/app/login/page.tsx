"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { useAuth } from "@/contexts/AuthProvider";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";

function resolveRedirect(path: string | null): string {
  if (!path || path === "/" || path.startsWith("/login")) return "/tools";
  return path;
}

function LoginContent() {
  const { user, loading, configured } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = resolveRedirect(searchParams.get("redirect"));

  useEffect(() => {
    if (!loading && user) {
      router.replace(redirect);
    }
  }, [loading, user, redirect, router]);

  if (!configured) {
    return (
      <Alert variant="warning" className="mx-auto max-w-md">
        <h1 className="mb-2 text-lg font-bold">Firebase לא מוגדר</h1>
        <p className="mb-3">
          הוסיפו את פרטי Firebase לקובץ <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">.env</code>
        </p>
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-2">
      <div className="mb-8 text-center">
        <span className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-kerem-700 text-4xl shadow-lg shadow-kerem-700/30">
          🌿
        </span>
        <h1 className="text-3xl font-bold text-stone-900">כרם</h1>
        <p className="mt-2 text-lg font-medium text-kerem-800">ספריית כלים קואופרטיבית</p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          התחברו פעם אחת — נזכור אתכם בפעם הבאה
        </p>
      </div>

      <Card className="shadow-lg shadow-stone-900/5">
        <CardBody className="py-8">
          <GoogleSignInButton label="התחברות עם Google" />
          <p className="mt-6 text-center text-xs leading-relaxed text-[var(--muted)]">
            בכניסה אתם מסכימים לתנאי השימוש של הקואופרטיב.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
