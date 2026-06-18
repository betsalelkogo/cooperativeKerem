import { Suspense } from "react";
import { AdminGate } from "@/components/auth/AdminGate";
import { AdminNav } from "@/components/admin/AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGate>
      <div>
        <Suspense fallback={<div className="mb-6 h-12 animate-pulse rounded-xl bg-warm-100" />}>
          <AdminNav />
        </Suspense>
        {children}
      </div>
    </AdminGate>
  );
}
