import { GoogleGenAI } from "@google/genai";
import type {
  CompanyMessage,
  CompanyPolicyState,
  CompanyRule,
  Reimbursement,
  Recommendation
} from "@crypto-reimbursement-agent/shared";
import { id, nowIso } from "../db.js";

export const geminiModel = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
export const fallbackScoringModel = "deterministic-policy-v1";

export function getScoringStatus() {
  return {
    model: geminiModel,
    llmEnabled: Boolean(process.env.GEMINI_API_KEY),
    fallbackModel: fallbackScoringModel
  };
}

function client() {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export async function deriveTemporaryRulesWithLlm(messages: CompanyMessage[]): Promise<CompanyRule[] | null> {
  const ai = client();
  if (!ai) return null;

  const prompt = `You are a finance policy extraction agent. Extract temporary reimbursement rules from these company messages.
Return strict JSON only: {"rules":[{"category":"travel|meals|software|wellness|equipment|event|other","title":"short","description":"policy","maxAmount":number,"currency":"INR|USD|USDC","keywords":["word"],"requiresReceipt":true}]}.
Messages:
${messages.map((m) => `[${m.source}/${m.channel}/${m.author}] ${m.text}`).join("\n")}`;

  const response = await ai.models.generateContent({
    model: geminiModel,
    contents: prompt
  });

  const text = response.text ?? "";
  const parsed = parseJsonObject<{ rules?: Array<Omit<CompanyRule, "id" | "type" | "source" | "activeUntil">> }>(text);
  if (!parsed?.rules?.length) return null;

  return parsed.rules.slice(0, 8).map((rule) => ({
    ...rule,
    id: id("rule_tmp"),
    type: "temporary",
    source: "llm",
    activeUntil: cycleEndIso()
  }));
}

export async function scoreWithLlm(
  reimbursement: Reimbursement,
  policy: CompanyPolicyState,
  deterministic: Recommendation
): Promise<Recommendation> {
  const ai = client();
  if (!ai) return deterministic;

  const prompt = `You are a reimbursement review agent. Score this claim against the company rules.
Return strict JSON only: {"score":0-100,"summary":"short","reasons":["reason"],"matchedRuleIds":["id"]}.
Use safe approval only for clear matches with receipts. Be strict about missing receipts, high amounts, and personal equipment.
Claim: ${JSON.stringify({
    amount: reimbursement.amount,
    currency: reimbursement.currency,
    category: reimbursement.category,
    reason: reimbursement.reason,
    hasReceipt: Boolean(reimbursement.receiptUrl || reimbursement.receiptDataUrl)
  })}
Rules: ${JSON.stringify([...policy.permanentRules, ...policy.temporaryRules])}`;

  const response = await ai.models.generateContent({
    model: geminiModel,
    contents: prompt
  });
  const parsed = parseJsonObject<{
    score?: number;
    summary?: string;
    reasons?: string[];
    matchedRuleIds?: string[];
  }>(response.text ?? "");

  if (!parsed || typeof parsed.score !== "number") return deterministic;

  const score = Math.max(0, Math.min(100, Math.round(parsed.score)));
  const status =
    score >= policy.config.recommendationThresholds.safe
      ? "safe_to_approve"
      : score >= policy.config.recommendationThresholds.review
        ? "needs_review"
        : "should_not_approve";

  return {
    status,
    score,
    summary: parsed.summary ?? deterministic.summary,
    reasons: parsed.reasons?.length ? parsed.reasons : deterministic.reasons,
    matchedRuleIds: parsed.matchedRuleIds ?? deterministic.matchedRuleIds,
    model: geminiModel,
    scoredAt: nowIso()
  };
}

function parseJsonObject<T>(text: string): T | null {
  const cleaned = text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end < start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

function cycleEndIso(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString();
}
