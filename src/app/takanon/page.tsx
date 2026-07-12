import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "תקנון — כרם רעים",
  description: "תקנון קואופרטיב הציוד כרם רעים",
};

// Placeholder sections — replace the body text with the final תקנון content.
const SECTIONS = [
  { title: "1. כללי", body: "כאן יופיע תוכן התקנון. עדכנו את הטקסט הזה עם הנוסח הסופי." },
  { title: "2. חברות בקואופרטיב", body: "תוכן placeholder — פרטו את תנאי החברות." },
  { title: "3. השאלת ציוד", body: "תוכן placeholder — פרטו את כללי ההשאלה." },
  { title: "4. תשלומים וקופות", body: "תוכן placeholder — פרטו את מדיניות התשלומים." },
  { title: "5. אחריות ובטיחות", body: "תוכן placeholder — פרטו את כללי האחריות והבטיחות." },
  { title: "6. פרטיות ומידע", body: "תוכן placeholder — פרטו את מדיניות הפרטיות." },
];

export default function TakanonPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="תקנון"
        description="תנאי השימוש והתקנון של קואופרטיב הציוד כרם רעים."
      />

      <div className="space-y-4">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardBody className="py-5">
              <h2 className="text-lg font-bold text-stone-900">{section.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                {section.body}
              </p>
            </CardBody>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-[var(--muted)]">
        עודכן לאחרונה: —
      </p>
    </div>
  );
}
