"use client";

/**
 * Razorpay Checkout for every "Pay" button.
 *
 * Flow: our API creates the order (amount computed server-side, never trusted from the
 * browser) → Checkout opens for that order id → on success Razorpay returns
 * {order_id, payment_id, signature} → our API verifies the HMAC signature with the key
 * secret and records the payment. The key SECRET never reaches the browser; only the
 * public key id does (from the order response, or NEXT_PUBLIC_RAZORPAY_KEY_ID).
 */

export type GatewayOrder = {
  order_id: string;
  gateway: "mock" | "razorpay";
  amount: number;
  amount_minor?: number;
  currency: string;
  key_id?: string;
};

export type CheckoutResult =
  | { status: "paid"; paymentId: string }
  | { status: "dismissed" }
  | { status: "failed"; reason: string };

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (event: string, cb: (r: { error?: { description?: string } }) => void) => void };

declare global {
  interface Window { Razorpay?: new (opts: Record<string, unknown>) => RazorpayInstance }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Payments need a browser"));
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    const s = existing ?? document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment window. Check your internet connection."));
    if (!existing) document.body.appendChild(s);
  });
}

/** Opens Checkout for a server-created order and settles once the payment is verified (or abandoned). */
export async function payWithRazorpay(
  order: GatewayOrder,
  details: { name: string; description: string; prefill?: { name?: string; email?: string; contact?: string } },
): Promise<CheckoutResult> {
  const key = order.key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  if (!key) throw new Error("Online payment is not configured");
  await loadRazorpay();
  if (!window.Razorpay) throw new Error("Payment window unavailable");

  return new Promise<CheckoutResult>((resolve) => {
    let settled = false;
    const done = (r: CheckoutResult) => { if (!settled) { settled = true; resolve(r); } };

    const rzp = new window.Razorpay!({
      key,
      order_id: order.order_id,
      amount: order.amount_minor ?? Math.round(order.amount * 100),
      currency: order.currency,
      name: details.name,
      description: details.description,
      prefill: details.prefill ?? {},
      theme: { color: "#142B4A" }, // brand-700 navy
      retry: { enabled: true },
      handler: async (resp: RazorpayResponse) => {
        try {
          const res = await fetch("/api/payments/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(resp),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            done({ status: "failed", reason: body.message ?? `Verification failed (${res.status})` });
            return;
          }
          done({ status: "paid", paymentId: resp.razorpay_payment_id });
        } catch (e) {
          // Money may have moved: the server webhook will still record it.
          done({ status: "failed", reason: `Payment made, but confirmation is pending: ${(e as Error).message}` });
        }
      },
      // Closing the window ends the attempt; report the last failure if there was one.
      modal: { ondismiss: () => done(lastError ? { status: "failed", reason: lastError } : { status: "dismissed" }), escape: true },
    });
    // With retry enabled the window stays open after a failed attempt and the payer can try
    // again, so a failure is only remembered here, not final.
    let lastError: string | null = null;
    rzp.on("payment.failed", (r) => { lastError = r.error?.description ?? "Payment failed"; });
    rzp.open();
  });
}
