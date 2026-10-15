import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Media Store creates SAR charges only. Tap signs these fields, NOT the JSON bytes
// or metadata: https://developers.tap.company/docs/webhook (charge hashstring).
const chargeSchema = z.object({
  id: z.string().regex(/^chg_[A-Za-z0-9_-]+$/),
  object: z.literal("charge"),
  amount: z.number().finite().nonnegative(),
  currency: z.literal("SAR"),
  status: z.string().min(1),
  transaction: z.object({ created: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]) }),
  reference: z.object({ gateway: z.string().nullish(), payment: z.string().nullish() }).default({}),
  metadata: z.object({ orderId: z.string().min(1) }),
});

export function verifyMediaStoreCharge(raw: Buffer, signature: unknown) {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return null;
  const secret = process.env.TAP_SECRET_KEY;
  if (!secret) return null; // Same API secret used to create/retrieve this merchant's charges.
  let json: unknown;
  try { json = JSON.parse(raw.toString("utf8")); } catch { return null; }
  const parsed = chargeSchema.safeParse(json);
  if (!parsed.success) return null;
  const charge = parsed.data;
  const signed = `x_id${charge.id}x_amount${charge.amount.toFixed(2)}x_currency${charge.currency}`
    + `x_gateway_reference${charge.reference.gateway ?? ""}x_payment_reference${charge.reference.payment ?? ""}`
    + `x_status${charge.status}x_created${charge.transaction.created}`;
  const expected = createHmac("sha256", secret).update(signed).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex")) ? charge : null;
}
