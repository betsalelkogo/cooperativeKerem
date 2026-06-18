import type { Gemach } from "@/lib/types";
import type { PayboxSettings } from "@/lib/types";
import { resolvePayboxGroupUrl } from "@/lib/paybox/config";

export function resolveCheckoutPayboxUrl(
  gemach: Gemach,
  platformSettings: PayboxSettings
): { url: string } | { error: string } {
  if (gemach.payboxGroupUrl) {
    return { url: gemach.payboxGroupUrl };
  }

  if (gemach.isPlatform) {
    if (!platformSettings.enabled || !platformSettings.operationsGroupUrl) {
      return { error: "PayBox לא מוגדר. פנו למנהל הקואופרטיב." };
    }
    return { url: resolvePayboxGroupUrl(platformSettings, "device") };
  }

  return {
    error: "לגמ״ח זה לא הוגדר קישור PayBox. פנו למנהל הגמ״ח.",
  };
}

export function partnerUsesOwnPaybox(gemach: Gemach): boolean {
  return !gemach.isPlatform && Boolean(gemach.payboxGroupUrl);
}
