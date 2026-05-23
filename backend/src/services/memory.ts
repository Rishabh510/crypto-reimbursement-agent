import type { CompanyMessage, CompanyRule, RuleRefreshResult } from "@crypto-reimbursement-agent/shared";
import { getMessages, getPolicyState, id, nowIso, savePolicyState, saveRefreshRun } from "../db.js";
import { deriveTemporaryRulesWithLlm, geminiModel } from "./llm.js";

export async function refreshTemporaryMemory(): Promise<RuleRefreshResult> {
  const policy = getPolicyState();
  const messages = messagesInCycle(getMessages(), policy.config.cycleDays);
  const llmRules = await deriveTemporaryRulesWithLlm(messages);
  const temporaryRules = llmRules?.length ? llmRules : deriveTemporaryRulesFallback(messages);

  savePolicyState({
    ...policy,
    temporaryRules
  });

  return saveRefreshRun({
    runId: id("run"),
    model: llmRules?.length ? geminiModel : "mock-memory-extractor-v1",
    processedMessageCount: messages.length,
    temporaryRules,
    summary: `Refreshed ${temporaryRules.length} temporary rules from ${messages.length} mocked Slack/WhatsApp messages.`,
    createdAt: nowIso()
  });
}

function messagesInCycle(messages: CompanyMessage[], cycleDays: number): CompanyMessage[] {
  const cutoff = Date.now() - cycleDays * 24 * 60 * 60 * 1000;
  return messages.filter((message) => new Date(message.createdAt).getTime() >= cutoff);
}

function deriveTemporaryRulesFallback(messages: CompanyMessage[]): CompanyRule[] {
  const text = messages.map((message) => message.text).join(" ").toLowerCase();
  const rules: CompanyRule[] = [];

  if (text.includes("offsite") || text.includes("dinner")) {
    rules.push(rule("meals", "Mumbai offsite meals", "Offsite dinner and release-freeze meals are reimbursable this cycle.", 1800, [
      "offsite",
      "dinner",
      "release freeze",
      "team lunch"
    ]));
  }

  if (text.includes("figma") || text.includes("cursor") || text.includes("github copilot")) {
    rules.push(rule("software", "Cycle-approved software", "Approved software subscriptions from team messages are reimbursable.", 3000, [
      "figma",
      "cursor",
      "github copilot",
      "software"
    ]));
  }

  if (text.includes("airport") || text.includes("investor demo") || text.includes("bengaluru client")) {
    rules.push(rule("travel", "Investor demo and client travel", "Investor demo and client-meeting travel are reimbursable with receipts.", 3500, [
      "airport",
      "investor demo",
      "bengaluru client",
      "cab"
    ]));
  }

  rules.push(rule("equipment", "Personal equipment restriction", "Personal equipment and gaming keyboards are not reimbursable without manager approval.", 0, [
    "gaming",
    "keyboard",
    "personal equipment"
  ]));

  return rules;
}

function rule(category: CompanyRule["category"], title: string, description: string, maxAmount: number, keywords: string[]): CompanyRule {
  const activeUntil = new Date();
  activeUntil.setDate(activeUntil.getDate() + 14);
  return {
    id: id("rule_tmp"),
    type: "temporary",
    category,
    title,
    description,
    maxAmount,
    currency: "INR",
    keywords,
    requiresReceipt: true,
    activeUntil: activeUntil.toISOString(),
    source: "mock_slack"
  };
}
