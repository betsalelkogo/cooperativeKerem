"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { AccessCodeCard } from "@/components/access/AccessCodeCard";
import { JoinMembershipBanner } from "@/components/membership/JoinMembershipBanner";
import { MEMBERSHIP_REQUIRED_CODE } from "@/lib/membership";
import type { AccessCodesPublicView } from "@/lib/types";

export default function AccessPage() {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<AccessCodesPublicView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await authFetch("/api/access-codes", { token });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "לא ניתן לטעון את קודי הגישה");
        }
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה");
      }
    }
    load();
  }, [getIdToken]);

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="גישה למתחם"
        description="קוד הקרוואן פתוח לכל המחוברים. קוד מנעול החדר שמור לחברי המועדון ומתחלף מדי פעם."
      />

      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {!data && !error && (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <AccessCodeCard
            title="קרוואן"
            hint="קוד כניסה לקרוואן הקואופרטיב"
            code={data.caravanCode}
            note={data.caravanNote}
            emptyLabel="קוד הקרוואן עדיין לא הוגדר."
          />

          {data.clubRoomVisible ? (
            <AccessCodeCard
              title="חדר המועדון"
              hint="מנעול קומבינציה — לחברי מועדון בלבד"
              code={data.clubRoomCode}
              note={data.clubRoomNote}
              updatedAt={data.clubRoomUpdatedAt}
              emptyLabel="קוד החדר עדיין לא הוגדר. פנו למנהל."
              tone="club"
            />
          ) : (
            <div className="rounded-2xl border border-warm-200 bg-warm-50 p-4">
              <p className="text-sm font-bold text-stone-900">קוד חדר המועדון</p>
              <p className="mt-1 text-sm leading-relaxed text-stone-700">
                מנעול הקומבינציה של החדר גלוי לחברי המועדון בלבד.
              </p>
              <div className="mt-3">
                <JoinMembershipBanner reason={MEMBERSHIP_REQUIRED_CODE} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
