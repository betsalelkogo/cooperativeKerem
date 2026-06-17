import { AdminGate } from "@/components/auth/AdminGate";
import { AdminNav } from "@/components/admin/AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGate>
      <div>
        <AdminNav />
        {children}
      </div>
    </AdminGate>
  );
}
