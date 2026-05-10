import crypto from "crypto";

const TAP_API_BASE = "https://api.tap.company/v2";

interface TapCustomer {
  firstName: string;
  lastName?: string;
  email: string;
  phone?: {
    countryCode: string;
    number: string;
  };
}

interface CreateChargeParams {
  amountHalalas: number;
  currency?: string;
  customer: TapCustomer;
  redirectUrl: string;
  postUrl?: string;
  description?: string;
  metadata?: Record<string, any>;
}

interface TapChargeResponse {
  id: string;
  status: string;
  amount: number;
  currency: string;
  transaction?: {
    url?: string;
    created?: string;
  };
  redirect?: {
    url?: string;
    status?: string;
  };
  customer?: {
    id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  };
  source?: {
    payment_method?: string;
  };
  card?: {
    brand?: string;
    last_four?: string;
    first_six?: string;
  };
  response?: {
    code?: string;
    message?: string;
  };
  gateway?: {
    response?: {
      code?: string;
      message?: string;
    };
  };
}

function getSecretKey(): string {
  const key = process.env.TAP_SECRET_KEY;
  if (!key) {
    throw new Error("TAP_SECRET_KEY environment variable is not set");
  }
  return key;
}

function getWebhookSecret(): string {
  return process.env.TAP_WEBHOOK_SECRET || "";
}

export async function createCharge(params: CreateChargeParams): Promise<TapChargeResponse> {
  const { amountHalalas, currency = "SAR", customer, redirectUrl, postUrl, description, metadata } = params;
  
  const amountSAR = amountHalalas / 100;
  
  const requestBody = {
    amount: amountSAR,
    currency,
    customer_initiated: true,
    threeDSecure: true,
    save_card: false,
    description: description || "Article purchase",
    metadata: metadata || {},
    customer: {
      first_name: customer.firstName,
      last_name: customer.lastName || "",
      email: customer.email,
      phone: customer.phone ? {
        country_code: customer.phone.countryCode,
        number: customer.phone.number,
      } : undefined,
    },
    source: {
      id: "src_all",
    },
    redirect: {
      url: redirectUrl,
    },
    post: postUrl ? { url: postUrl } : undefined,
  };
  
  console.log(`[Tap Payment] Creating charge for ${amountSAR} ${currency}`);
  
  const response = await fetch(`${TAP_API_BASE}/charges/`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Tap Payment] Error creating charge:`, errorText);
    throw new Error(`Failed to create Tap charge: ${response.status} ${errorText}`);
  }
  
  const data = await response.json() as TapChargeResponse;
  console.log(`[Tap Payment] Charge created: ${data.id}, status: ${data.status}`);
  
  return data;
}

export async function retrieveCharge(chargeId: string): Promise<TapChargeResponse> {
  console.log(`[Tap Payment] Retrieving charge: ${chargeId}`);
  
  const response = await fetch(`${TAP_API_BASE}/charges/${chargeId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${getSecretKey()}`,
      "Accept": "application/json",
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Tap Payment] Error retrieving charge:`, errorText);
    throw new Error(`Failed to retrieve Tap charge: ${response.status}`);
  }
  
  const data = await response.json() as TapChargeResponse;
  console.log(`[Tap Payment] Charge retrieved: ${data.id}, status: ${data.status}`);
  
  return data;
}

export function verifyWebhookSignature(
  body: string,
  receivedHashstring: string
): boolean {
  const webhookSecret = getWebhookSecret();
  if (!webhookSecret) {
    console.error("[Tap Payment] CRITICAL: TAP_WEBHOOK_SECRET is not configured - rejecting webhook");
    return false;
  }
  
  if (!receivedHashstring) {
    console.error("[Tap Payment] No hashstring received in webhook request");
    return false;
  }
  
  const computedHash = crypto
    .createHmac("sha256", webhookSecret)
    .update(body)
    .digest("hex");
  
  const isValid = computedHash === receivedHashstring;
  
  if (!isValid) {
    console.error("[Tap Payment] Webhook signature mismatch");
    console.error(`[Tap Payment] Received: ${receivedHashstring}`);
    console.error(`[Tap Payment] Computed: ${computedHash}`);
  }
  
  return isValid;
}

export function computeHashstring(
  chargeId: string,
  amount: number,
  currency: string,
  gatewayReference: string,
  paymentReference: string,
  status: string,
  createdAt: string
): string {
  const webhookSecret = getWebhookSecret();
  const hashSource = `x_id${chargeId}x_amount${amount.toFixed(2)}x_currency${currency}x_gateway_reference${gatewayReference}x_payment_reference${paymentReference}x_status${status}x_created${createdAt}`;
  
  return crypto
    .createHmac("sha256", webhookSecret)
    .update(hashSource)
    .digest("hex");
}

export function isPaymentSuccessful(status: string): boolean {
  return status === "CAPTURED";
}

export function isPaymentFailed(status: string): boolean {
  return ["FAILED", "DECLINED", "CANCELLED", "ABANDONED"].includes(status);
}

export function formatPriceFromHalalas(halalas: number): string {
  const sar = halalas / 100;
  return sar.toFixed(2);
}

export function getPaymentStatusArabic(status: string): string {
  const statusMap: Record<string, string> = {
    INITIATED: "قيد المعالجة",
    CAPTURED: "مكتمل",
    FAILED: "فشل",
    DECLINED: "مرفوض",
    CANCELLED: "ملغي",
    ABANDONED: "متروك",
  };
  return statusMap[status] || status;
}
