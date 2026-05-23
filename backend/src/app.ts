import "dotenv/config";
import cors from "cors";
import express from "express";
import { z } from "zod";
import type { DashboardSummary, Reimbursement } from "@crypto-reimbursement-agent/shared";
import {
  addAudit,
  getAuditEvents,
  getMessages,
  getPolicyState,
  getReimbursement,
  getReimbursements,
  getUser,
  getUsers,
  id,
  nowIso,
  savePolicyState,
  saveReimbursement,
  updateReimbursement
} from "./db.js";
import { refreshTemporaryMemory } from "./services/memory.js";
import { scoreReimbursement } from "./services/scoring.js";
import { getPaymentProvider } from "./services/payments.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/session", (req, res) => {
    const users = getUsers();
    const requested = String(req.header("x-user-id") ?? req.query.userId ?? "usr_admin");
    const currentUser = getUser(requested) ?? users[0];
    res.json({ currentUser, users });
  });

  app.get("/api/dashboard", (req, res) => {
    const user = currentUser(req);
    const reimbursements = getReimbursements(user);
    const summary: DashboardSummary = {
      totalSubmitted: reimbursements.length,
      safeCount: reimbursements.filter((item) => item.recommendation.status === "safe_to_approve").length,
      reviewCount: reimbursements.filter((item) => item.recommendation.status === "needs_review").length,
      rejectCount: reimbursements.filter((item) => item.recommendation.status === "should_not_approve").length,
      approvedCount: reimbursements.filter((item) => item.status === "approved").length,
      paidCount: reimbursements.filter((item) => item.status === "paid").length,
      totalAmount: reimbursements.reduce((sum, item) => sum + item.amount, 0)
    };
    res.json(summary);
  });

  app.get("/api/reimbursements", (req, res) => {
    res.json(getReimbursements(currentUser(req)));
  });

  app.post("/api/reimbursements", async (req, res, next) => {
    try {
      const user = currentUser(req);
      if (!user) return res.status(401).json({ error: "Unknown user" });
      const payload = reimbursementInput.parse(req.body);
      const submittedAt = nowIso();
      const draft: Reimbursement = {
        id: id("rmb"),
        userId: user.role === "admin" && payload.userId ? payload.userId : user.id,
        amount: payload.amount,
        currency: payload.currency,
        category: payload.category,
        reason: payload.reason,
        receiptUrl: payload.receiptUrl || undefined,
        status: "submitted",
        payoutStatus: "not_started",
        submittedAt,
        recommendation: {
          status: "needs_review",
          score: 50,
          summary: "Pending score",
          reasons: [],
          matchedRuleIds: [],
          model: "pending",
          scoredAt: submittedAt
        }
      };
      draft.recommendation = await scoreReimbursement(draft, getPolicyState(), true);
      const saved = saveReimbursement(draft);
      addAudit({
        actorId: user.id,
        action: "submit",
        entityType: "reimbursement",
        entityId: saved.id,
        message: `${user.name} submitted ${saved.currency} ${saved.amount} for ${saved.category}.`
      });
      res.status(201).json(saved);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/reimbursements/:id/re-score", async (req, res, next) => {
    try {
      const user = requireAdmin(req, res);
      if (!user) return;
      const reimbursement = mustGetReimbursement(req.params.id, res);
      if (!reimbursement) return;
      reimbursement.recommendation = await scoreReimbursement(reimbursement, getPolicyState(), true);
      const saved = updateReimbursement(reimbursement);
      addAudit({
        actorId: user.id,
        action: "rescore",
        entityType: "reimbursement",
        entityId: saved.id,
        message: `Re-scored claim at ${saved.recommendation.score}/100 using ${saved.recommendation.model}.`
      });
      res.json(saved);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/reimbursements/:id/approve", (req, res) => {
    const user = requireAdmin(req, res);
    if (!user) return;
    const reimbursement = mustGetReimbursement(req.params.id, res);
    if (!reimbursement) return;
    if (reimbursement.status === "paid") return res.status(409).json({ error: "Paid claims cannot be changed." });
    reimbursement.status = "approved";
    const saved = updateReimbursement(reimbursement);
    addAudit({
      actorId: user.id,
      action: "approve",
      entityType: "reimbursement",
      entityId: saved.id,
      message: `${user.name} approved claim ${saved.id}.`
    });
    res.json(saved);
  });

  app.post("/api/reimbursements/:id/reject", (req, res) => {
    const user = requireAdmin(req, res);
    if (!user) return;
    const reimbursement = mustGetReimbursement(req.params.id, res);
    if (!reimbursement) return;
    if (reimbursement.status === "paid") return res.status(409).json({ error: "Paid claims cannot be rejected." });
    reimbursement.status = "rejected";
    const saved = updateReimbursement(reimbursement);
    addAudit({
      actorId: user.id,
      action: "reject",
      entityType: "reimbursement",
      entityId: saved.id,
      message: `${user.name} rejected claim ${saved.id}.`
    });
    res.json(saved);
  });

  app.post("/api/reimbursements/:id/pay", async (req, res, next) => {
    try {
      const user = requireAdmin(req, res);
      if (!user) return;
      const reimbursement = mustGetReimbursement(req.params.id, res);
      if (!reimbursement) return;
      if (reimbursement.status !== "approved") return res.status(409).json({ error: "Claim must be approved before payout." });
      const policy = getPolicyState();
      const payout = await getPaymentProvider(policy.config.paymentProvider).pay(reimbursement);
      reimbursement.status = "paid";
      reimbursement.payoutStatus = payout.status;
      const saved = updateReimbursement(reimbursement);
      addAudit({
        actorId: user.id,
        action: "pay",
        entityType: "reimbursement",
        entityId: saved.id,
        message: `Mock payout ${payout.externalReference} completed through ${payout.rail}.`
      });
      res.json({ reimbursement: saved, payout });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/company/policy", (_req, res) => {
    res.json(getPolicyState());
  });

  app.put("/api/company/policy", (req, res) => {
    const user = requireAdmin(req, res);
    if (!user) return;
    const current = getPolicyState();
    const payload = policyInput.parse(req.body);
    if (payload.config.automaticPaymentsEnabled) {
      return res.status(400).json({ error: "Automatic payments are visible in config but disabled for v1." });
    }
    const saved = savePolicyState({
      ...current,
      config: {
        ...payload.config,
        automaticPaymentsAvailable: false,
        automaticPaymentsEnabled: false
      },
      permanentRules: payload.permanentRules
    });
    addAudit({
      actorId: user.id,
      action: "update_policy",
      entityType: "company_policy",
      entityId: "default",
      message: `${user.name} updated company config and permanent memory.`
    });
    res.json(saved);
  });

  app.get("/api/company/messages", (_req, res) => {
    res.json(getMessages());
  });

  app.post("/api/company/temporary-rules/refresh", async (req, res, next) => {
    try {
      const user = requireAdmin(req, res);
      if (!user) return;
      const result = await refreshTemporaryMemory();
      addAudit({
        actorId: user.id,
        action: "refresh_temporary_memory",
        entityType: "company_policy",
        entityId: "default",
        message: result.summary
      });
      res.json({ result, policy: getPolicyState() });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/audit-events", (_req, res) => {
    res.json(getAuditEvents());
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: z.treeifyError(error) });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    res.status(500).json({ error: message });
  });

  return app;
}

function currentUser(req: express.Request) {
  return getUser(String(req.header("x-user-id") ?? "usr_admin")) ?? undefined;
}

function requireAdmin(req: express.Request, res: express.Response) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Unknown user" });
    return null;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin access required." });
    return null;
  }
  return user;
}

function mustGetReimbursement(id: string, res: express.Response) {
  const reimbursement = getReimbursement(id);
  if (!reimbursement) {
    res.status(404).json({ error: "Reimbursement not found." });
    return null;
  }
  return reimbursement;
}

const reimbursementInput = z.object({
  userId: z.string().optional(),
  amount: z.number().positive(),
  currency: z.enum(["INR", "USD", "USDC"]),
  category: z.enum(["travel", "meals", "software", "wellness", "equipment", "event", "other"]),
  reason: z.string().min(8),
  receiptUrl: z.string().optional()
});

const ruleInput = z.object({
  id: z.string(),
  type: z.literal("permanent"),
  category: z.enum(["travel", "meals", "software", "wellness", "equipment", "event", "other"]),
  title: z.string().min(2),
  description: z.string().min(5),
  maxAmount: z.number().nonnegative(),
  currency: z.enum(["INR", "USD", "USDC"]),
  keywords: z.array(z.string()).min(1),
  requiresReceipt: z.boolean(),
  source: z.literal("admin").optional()
});

const policyInput = z.object({
  config: z.object({
    companyName: z.string().min(2),
    cycleDays: z.union([z.literal(14), z.literal(30)]),
    paymentProvider: z.enum(["mock", "oneclaw_crypto", "razorpay"]),
    automaticPaymentsEnabled: z.boolean(),
    automaticPaymentsAvailable: z.boolean(),
    recommendationThresholds: z.object({
      safe: z.number().min(0).max(100),
      review: z.number().min(0).max(100)
    })
  }),
  permanentRules: z.array(ruleInput)
});
