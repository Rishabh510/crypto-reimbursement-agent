import type { CompanyPolicyState, CompanyRule, Reimbursement, Recommendation } from "@crypto-reimbursement-agent/shared";
import { nowIso } from "../db.js";
import { fallbackScoringModel, scoreWithLlm } from "./llm.js";

export async function scoreReimbursement(
  reimbursement: Reimbursement,
  policy: CompanyPolicyState,
  useLlm = false
): Promise<Recommendation> {
  const deterministic = scoreDeterministically(reimbursement, policy);
  return useLlm ? scoreWithLlm(reimbursement, policy, deterministic) : deterministic;
}

export function scoreDeterministically(reimbursement: Reimbursement, policy: CompanyPolicyState): Recommendation {
  const rules = [...policy.permanentRules, ...policy.temporaryRules];
  const reasonText = reimbursement.reason.toLowerCase();
  const categoryRules = rules.filter((rule) => rule.category === reimbursement.category);
  const matched = categoryRules.filter((rule) =>
    rule.keywords.some((keyword) => reasonText.includes(keyword.toLowerCase()))
  );

  let score = 100;
  const reasons: string[] = [];
  const matchedRuleIds = matched.map((rule) => rule.id);

  if (!reimbursement.receiptUrl && !reimbursement.receiptDataUrl) {
    score -= 25;
    reasons.push("Receipt is missing.");
  }

  if (!categoryRules.length) {
    score -= 20;
    reasons.push("No company rule exists for this category.");
  }

  if (!matched.length) {
    score -= 18;
    reasons.push("Reason does not clearly match permanent or temporary memory.");
  } else {
    reasons.push(`Matched ${matched.map((rule) => rule.title).join(", ")}.`);
  }

  const strictestLimit = bestLimit(matched.length ? matched : categoryRules);
  if (strictestLimit && reimbursement.amount > strictestLimit.maxAmount) {
    score -= 30;
    reasons.push(`Amount exceeds ${strictestLimit.title} cap of ${strictestLimit.currency} ${strictestLimit.maxAmount}.`);
  }

  if (/(gaming|personal|gift|party|alcohol|crypto loss|fine|penalty)/i.test(reimbursement.reason)) {
    score -= 35;
    reasons.push("Reason contains terms that usually need rejection or manager override.");
  }

  if (reimbursement.amount > 5000) {
    score -= 10;
    reasons.push("High-value claim requires finance review.");
  }

  score = Math.max(0, Math.min(100, score));
  const status =
    score >= policy.config.recommendationThresholds.safe
      ? "safe_to_approve"
      : score >= policy.config.recommendationThresholds.review
        ? "needs_review"
        : "should_not_approve";

  const summary =
    status === "safe_to_approve"
      ? "Looks aligned with company memory and can be approved."
      : status === "needs_review"
        ? "Needs human review before approval."
        : "Should not be approved without explicit override.";

  return {
    status,
    score,
    summary,
    reasons,
    matchedRuleIds,
    model: fallbackScoringModel,
    scoredAt: nowIso()
  };
}

function bestLimit(rules: CompanyRule[]): CompanyRule | null {
  if (!rules.length) return null;
  return [...rules].sort((a, b) => a.maxAmount - b.maxAmount)[0];
}
