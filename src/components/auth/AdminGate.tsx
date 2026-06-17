"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { canAccessAdminPath, isGemachAdmin, isPlatformAdmin } from "@/lib/admin";
import { Alert } from "@/components/ui/Alert";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, member, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!member) return;

    if (!canAccessAdminPath(member, pathname)) {
      if (isGemachAdmin(member) && !isPlatformAdmin(member)) {
        router.replace("/admin/gemach");
      } else {
        router.replace("/tools");
      }
    }
  }, [loading, user, member, pathname, router]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  if (!user || !member || !canAccessAdminPath(member, pathname)) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Alert variant="warning">גישה למנהלים בלבד</Alert>
      </div>
    );
  }

  return children;
}
