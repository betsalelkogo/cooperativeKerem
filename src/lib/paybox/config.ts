import type { PayboxSettings } from "@/lib/types";

export function isGrowConfigured(): boolean {
  return Boolean(
    process.env.GROW_USER_ID &&
      process.env.GROW_PAGE_CODE &&
      process.env.GROW_API_KEY
  );
}

export function getGrowConfig() {
  return {
    userId: process.env.GROW_USER_ID ?? "",
    pageCode: process.env.GROW_PAGE_CODE ?? "",
    apiKey: process.env.GROW_API_KEY ?? "",
    apiBaseUrl:
      process.env.GROW_API_BASE_URL ??
      "https://sandbox.meshulam.co.il/api/light/server/1.0",
  };
}

export function getDefaultPayboxSettings(): PayboxSettings {
  return {
    enabled: Boolean(process.env.PAYBOX_OPERATIONS_GROUP_URL),
    operationsGroupUrl: process.env.PAYBOX_OPERATIONS_GROUP_URL ?? "",
    deviceGroupUrl:
      process.env.PAYBOX_DEVICE_GROUP_URL ??
      process.env.PAYBOX_OPERATIONS_GROUP_URL ??
      "",
    growPageCode: process.env.GROW_PAGE_CODE,
  };
}

export function resolvePayboxGroupUrl(
  settings: PayboxSettings,
  target: "operations" | "device"
): string {
  if (target === "device" && settings.deviceGroupUrl) {
    return settings.deviceGroupUrl;
  }
  return settings.operationsGroupUrl;
}
