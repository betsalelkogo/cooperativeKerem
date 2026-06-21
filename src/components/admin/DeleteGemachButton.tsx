"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Card, CardBody } from "@/components/ui/Card";

interface DeleteGemachButtonProps {
  gemachId: string;
  gemachName: string;
  variant?: "inline" | "card";
}

export function DeleteGemachButton({
  gemachId,
  gemachName,
  variant = "inline",
}: DeleteGemachButtonProps) {
  const router = useRouter();
  const { getIdToken, refreshMember } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setClosing(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await authFetch("/api/admin/gemach/close", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gemachId, confirmName: confirmName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "מחיקה נכשלה");
      await refreshMember();
      router.push("/tools");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setClosing(false);
    }
  }

  if (variant === "inline") {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setError("");
            setConfirmName("");
          }}
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 transition hover:bg-red-100"
        >
          מחק גמ״ח
        </button>

        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <Card className="w-full max-w-md shadow-xl">
              <CardBody className="pt-6">
                <h3 className="text-lg font-bold text-red-800">מחיקת גמ״ח לצמיתות</h3>
                <p className="mt-2 text-sm text-stone-600">
                  הגמ״ח, כל הכלים והשריונים יימחקו. הקלידו את השם לאישור.
                </p>
                {error && (
                  <Alert variant="error" className="mt-3">
                    {error}
                  </Alert>
                )}
                <p className="mt-3 text-sm font-medium">
                  שם: <strong>{gemachName}</strong>
                </p>
                <input
                  type="text"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-red-200 px-4 py-3 text-sm"
                  placeholder="שם הגמ״ח"
                />
                <div className="mt-4 flex gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    className="flex-1"
                    disabled={closing || confirmName.trim() !== gemachName.trim()}
                    onClick={handleDelete}
                  >
                    {closing ? "מוחק…" : "מחק לצמיתות"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    disabled={closing}
                    onClick={() => setOpen(false)}
                  >
                    ביטול
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </>
    );
  }

  return null;
}
