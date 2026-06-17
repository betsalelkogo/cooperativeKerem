import { getGrowConfig, isGrowConfigured } from "./config";

export interface GrowPaymentLinkParams {
  amount: number;
  title: string;
  productName: string;
  fullName: string;
  phone: string;
  email?: string;
  successUrl: string;
  notifyUrl?: string;
  cField1?: string;
  cField2?: string;
}

export interface GrowPaymentLinkResult {
  paymentUrl: string;
  processId?: string;
  processToken?: string;
}

export async function createGrowPaymentLink(
  params: GrowPaymentLinkParams
): Promise<GrowPaymentLinkResult | null> {
  if (!isGrowConfigured()) return null;

  const { userId, pageCode, apiKey, apiBaseUrl } = getGrowConfig();

  const body = new URLSearchParams({
    userId,
    pageCode,
    paymentLinkType: "2",
    isActive: "1",
    title: params.title,
    successUrl: params.successUrl,
    "paymentTypes[0][type]": "payments",
    "paymentTypes[0][payments][paymentsPaymentNum]": "1",
    "pageFieldSettings[fullName][value]": params.fullName,
    "pageFieldSettings[phone][value]": params.phone,
    "products[data][0][name]": params.productName,
    "products[data][0][price]": String(Math.round(params.amount)),
    "products[data][0][quantity]": "1",
    "products[data][0][vatType]": "1",
    "transactionType[5]": "5",
  });

  if (params.email) {
    body.set("pageFieldSettings[email][value]", params.email);
  }
  if (params.notifyUrl) {
    body.set("notifyUrl", params.notifyUrl);
  }
  if (params.cField1) {
    body.set("cField1", params.cField1);
  }
  if (params.cField2) {
    body.set("cField2", params.cField2);
  }

  const res = await fetch(`${apiBaseUrl}/createPaymentLink`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-api-key": apiKey,
    },
    body: body.toString(),
  });

  const data = (await res.json()) as {
    status?: number | string;
    data?: {
      url?: string;
      paymentLinkProcessId?: string;
      paymentLinkProcessToken?: string;
    };
    url?: string;
  };

  const paymentUrl = data.data?.url ?? data.url;
  if (!paymentUrl) {
    throw new Error("Grow did not return a payment URL");
  }

  return {
    paymentUrl,
    processId: data.data?.paymentLinkProcessId,
    processToken: data.data?.paymentLinkProcessToken,
  };
}
