import { parseMeta } from "@/lib/package-presentation";

// What the member wallet offers for a payment that is waiting for staff confirmation.
export type PendingPaymentAction = "pay" | "slip-sent" | "counter";

export function pendingPaymentAction(payment: { method?: string | null; slipUploadedAt?: string | null }, promptPayEnabled: boolean): PendingPaymentAction {
  if (payment.slipUploadedAt) return "slip-sent";
  // Rows from an older API carry no method: they were PromptPay requests.
  if ((payment.method ?? "promptpay") !== "promptpay" || !promptPayEnabled) return "counter";
  return "pay";
}

// Coin price of a reward (content type "reward", metadata.cost): a positive whole number, else not redeemable.
export function rewardCost(metadata: unknown) {
  const cost = parseMeta(metadata).cost;
  return typeof cost === "number" && Number.isSafeInteger(cost) && cost > 0 ? cost : null;
}

// After a failed request, keep its request id for the retry unless the server answered definitively
// (4xx): a lost response or a 5xx may have been processed, and the same id makes the retry a replay.
export function keepRequestForRetry(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status !== "number" || status >= 500;
}
