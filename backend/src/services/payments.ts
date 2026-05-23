import type { PaymentProfile, Payout, Reimbursement } from "@crypto-reimbursement-agent/shared";
import { db, id, nowIso, parseJson, savePayout } from "../db.js";

export interface PaymentProviderAdapter {
  pay(reimbursement: Reimbursement): Promise<Payout>;
}

export class MockPaymentProvider implements PaymentProviderAdapter {
  async pay(reimbursement: Reimbursement): Promise<Payout> {
    const profile = getPaymentProfile(reimbursement.userId);
    return savePayout({
      id: id("pay"),
      reimbursementId: reimbursement.id,
      provider: "mock",
      rail: profile?.preferredRail ?? "mock",
      status: "paid",
      externalReference: `mock_${Date.now()}`,
      createdAt: nowIso()
    });
  }
}

export class OneClawCryptoProvider implements PaymentProviderAdapter {
  async pay(): Promise<Payout> {
    throw new Error("1Claw testnet payouts are intentionally disabled in v1.");
  }
}

export class RazorpayProvider implements PaymentProviderAdapter {
  async pay(): Promise<Payout> {
    throw new Error("Razorpay payouts are intentionally disabled in v1.");
  }
}

export function getPaymentProvider(name: string): PaymentProviderAdapter {
  if (name === "mock") return new MockPaymentProvider();
  if (name === "oneclaw_crypto") return new OneClawCryptoProvider();
  if (name === "razorpay") return new RazorpayProvider();
  return new MockPaymentProvider();
}

function getPaymentProfile(userId: string): PaymentProfile | null {
  const row = db.prepare("SELECT payload FROM payment_profiles WHERE user_id = ?").get(userId) as
    | { payload: string }
    | undefined;
  return row ? parseJson<PaymentProfile>(row.payload) : null;
}
