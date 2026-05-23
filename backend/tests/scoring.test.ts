import { describe, expect, it } from "vitest";
import type { CompanyPolicyState, Reimbursement } from "@crypto-reimbursement-agent/shared";
import { scoreDeterministically } from "../src/services/scoring.js";

const policy: CompanyPolicyState = {
  config: {
    companyName: "Test",
    cycleDays: 14,
    paymentProvider: "mock",
    automaticPaymentsEnabled: false,
    automaticPaymentsAvailable: false,
    recommendationThresholds: { safe: 80, review: 50 }
  },
  permanentRules: [
    {
      id: "rule_meals",
      type: "permanent",
      category: "meals",
      title: "Meals",
      description: "Meals after deployment",
      maxAmount: 1000,
      currency: "INR",
      keywords: ["deployment", "dinner"],
      requiresReceipt: true
    }
  ],
  temporaryRules: [],
  updatedAt: new Date().toISOString()
};

function claim(overrides: Partial<Reimbursement>): Reimbursement {
  return {
    id: "rmb_test",
    userId: "usr_test",
    amount: 900,
    currency: "INR",
    category: "meals",
    reason: "Deployment dinner",
    receiptUrl: "receipt",
    status: "under_review",
    payoutStatus: "not_started",
    submittedAt: new Date().toISOString(),
    recommendation: {
      status: "needs_review",
      score: 0,
      summary: "",
      reasons: [],
      matchedRuleIds: [],
      model: "test",
      scoredAt: new Date().toISOString()
    },
    ...overrides
  };
}

describe("scoreDeterministically", () => {
  it("marks clear policy matches as safe", () => {
    const result = scoreDeterministically(claim({}), policy);
    expect(result.status).toBe("safe_to_approve");
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it("marks personal equipment as reject", () => {
    const result = scoreDeterministically(
      claim({
        category: "equipment",
        amount: 6500,
        reason: "Gaming keyboard for personal home setup",
        receiptUrl: undefined
      }),
      policy
    );
    expect(result.status).toBe("should_not_approve");
  });
});
