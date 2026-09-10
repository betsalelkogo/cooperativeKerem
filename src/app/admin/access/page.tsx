"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { AccessCodesRecord, SafetyRule } from "@/lib/types";
import { parseSafetyRules, safetyRulesToText } from "@/lib/tools-admin";

export default function AdminAccessCodesPage() {
  const { getIdToken } = useAuth();
  const [caravanCode, setCaravanCode] = useState("");
  const [caravanNote, setCaravanNote] = useState("");
  const [clubRoomCode, setClubRoomCode] = useState("");
  const [clubRoomNote, setClubRoomNote] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [returnText, setReturnText] = useState("");
  const [returnSaving, setReturnSaving] = useState(false);
  const [returnSuccess, setReturnSuccess] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const token = await getIdToken();
        const res = await authFetch("/api/admin/access-codes", { token });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "טעינה נכשלה");
        }
        const data = (await res.json()) as AccessCodesRecord;
        setCaravanCode(data.caravanCode);
        setCaravanNote(data.caravanNote);
        setClubRoomCode(data.clubRoomCode);
        setClubRoomNote(data.clubRoomNote);
        setUpdatedAt(data.clubRoomUpdatedAt);
        const instr = await authFetch("/api/admin/return-instructions", { token });
        if (instr.ok) {
          const body = (await instr.json()) as { rules?: SafetyRule[] };
          setReturnText(safetyRulesToText(body.rules));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [getIdToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const token = await getIdToken();
      const res = await authFetch("/api/admin/access-codes", {
        method: "PATCH",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caravanCode,
          caravanNote,
          clubRoomCode,
          clubRoomNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שמירה נכשלה");
      const saved = data as AccessCodesRecord;
      setCaravanCode(saved.caravanCode);
      setCaravanNote(saved.caravanNote);
      setClubRoomCode(saved.clubRoomCode);
      setClubRoomNote(saved.clubRoomNote);
      setUpdatedAt(saved.clubRoomUpdatedAt);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="קודי גישה"
        description="קוד הקרוואן גלוי לכל המחוברים. קוד מנעול החדר גלוי לחברי מועדון בלבד — החליפו אותו מדי פעם."
      />

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-5">
            <fieldset className="space-y-3 rounded-xl border border-[var(--border)] p-4">
              <legend className="px-1 text-sm font-bold text-stone-900">קרוואן — לכולם</legend>
              <div>
                <label htmlFor="caravanCode" className="mb-1.5 block text-sm font-semibold text-stone-800">
                  קוד
                </label>
                <input
                  id="caravanCode"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  dir="ltr"
                  maxLength={16}
                  value={caravanCode}
                  onChange={(e) => setCaravanCode(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 font-mono text-sm tracking-widest focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                />
              </div>
              <div>
                <label htmlFor="caravanNote" className="mb-1.5 block text-sm font-semibold text-stone-800">
                  הערה (אופציונלי)
                </label>
                <input
                  id="caravanNote"
                  type="text"
                  maxLength={120}
                  value={caravanNote}
                  onChange={(e) => setCaravanNote(e.target.value)}
                  placeholder="למשל: דלת שמאלית"
                  className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                />
              </div>
            </fieldset>

            <fieldset className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <legend className="px-1 text-sm font-bold text-stone-900">
                חדר המועדון — חברי מועדון בלבד
              </legend>
              <div>
                <label htmlFor="clubRoomCode" className="mb-1.5 block text-sm font-semibold text-stone-800">
                  קוד מנעול קומבינציה
                </label>
                <input
                  id="clubRoomCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  dir="ltr"
                  maxLength={16}
                  value={clubRoomCode}
                  onChange={(e) => setClubRoomCode(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 font-mono text-sm tracking-widest focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                />
                {updatedAt && (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    עודכן לאחרונה: {new Date(updatedAt).toLocaleDateString("he-IL")}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="clubRoomNote" className="mb-1.5 block text-sm font-semibold text-stone-800">
                  הערה (אופציונלי)
                </label>
                <input
                  id="clubRoomNote"
                  type="text"
                  maxLength={120}
                  value={clubRoomNote}
                  onChange={(e) => setClubRoomNote(e.target.value)}
                  placeholder="למשל: מנעול על דלת החדר"
                  className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                />
              </div>
            </fieldset>

            {error && <Alert variant="error">{error}</Alert>}
            {success && <Alert variant="success">הקודים נשמרו. חברי המועדון יראו את הקוד החדש מיד.</Alert>}

            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "שומר…" : "שמירת קודים"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardBody>
          <h2 className="text-lg font-bold text-stone-900">הנחיות החזרה גנריות</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            מוצגות בסגירת השאלה כשאין הנחיות ייעודיות לכלי. שורה אחת לכל הנחיה.
          </p>
          <form
            className="mt-4 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setReturnSaving(true);
              setReturnSuccess(false);
              setError("");
              try {
                const token = await getIdToken();
                const res = await authFetch("/api/admin/return-instructions", {
                  method: "PATCH",
                  token,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ rules: parseSafetyRules(returnText) }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? "שמירה נכשלה");
                setReturnText(safetyRulesToText(data.rules));
                setReturnSuccess(true);
              } catch (err) {
                setError(err instanceof Error ? err.message : "שגיאה");
              } finally {
                setReturnSaving(false);
              }
            }}
          >
            <textarea
              rows={5}
              value={returnText}
              onChange={(e) => setReturnText(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
            />
            {returnSuccess && (
              <Alert variant="success">הנחיות ההחזרה הגנריות נשמרו.</Alert>
            )}
            <Button type="submit" disabled={returnSaving} className="w-full">
              {returnSaving ? "שומר…" : "שמירת הנחיות החזרה"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
