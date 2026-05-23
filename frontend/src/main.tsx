import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BadgeCheck,
  Ban,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  CreditCard,
  FileText,
  IndianRupee,
  Info,
  LayoutDashboard,
  MessageSquareText,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wallet,
  X
} from "lucide-react";
import type {
  AppState,
  AuditEvent,
  CompanyMessage,
  CompanyPolicyState,
  DashboardSummary,
  Reimbursement,
  RuleRefreshResult,
  User
} from "@crypto-reimbursement-agent/shared";
import "./styles.css";

const API = "";
const defaultUserId = localStorage.getItem("app_user_id") ?? "usr_admin";

type Tab = "reimbursements" | "policy" | "audit";
type Toast = { id: string; message: string; tone: "success" | "error" | "info" };

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>("reimbursements");
  const [busy, setBusy] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [receiptPreview, setReceiptPreview] = useState<Reimbursement | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [refreshState, setRefreshState] = useState<{
    active: boolean;
    visibleCount: number;
    lastMessage?: CompanyMessage;
    result?: RuleRefreshResult;
  }>({ active: false, visibleCount: 0 });

  async function load(userId = state?.currentUser.id ?? defaultUserId) {
    const next = await request<AppState>("/api/app-state", userId);
    setState(next);
    localStorage.setItem("app_user_id", next.currentUser.id);
    if (next.currentUser.role !== "admin" && (tab === "policy" || tab === "audit")) {
      setTab("reimbursements");
    }
  }

  useEffect(() => {
    void load(defaultUserId);
  }, []);

  if (!state) {
    return <div className="loading">Loading workspace...</div>;
  }

  const isAdmin = state.currentUser.role === "admin";

  function showToast(message: string, tone: Toast["tone"] = "info") {
    const toast = { id: crypto.randomUUID(), message, tone };
    setToasts((current) => [...current, toast]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id));
    }, 3200);
  }

  async function action(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
      showToast("Action completed.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Action failed.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function switchUser(userId: string) {
    setSwitcherOpen(false);
    await load(userId);
  }

  async function refreshMemory() {
    if (!state) return;
    const currentState = state;
    setRefreshState({ active: true, visibleCount: 0 });
    const ordered = [...currentState.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (let index = 0; index < ordered.length; index += 10) {
      await sleep(520);
      setRefreshState({
        active: true,
        visibleCount: Math.min(index + 10, ordered.length),
        lastMessage: ordered[Math.min(index + 9, ordered.length - 1)]
      });
    }
    const response = await request<{ result: RuleRefreshResult; policy: CompanyPolicyState }>(
      "/api/company/temporary-rules/refresh",
      currentState.currentUser.id,
      { method: "POST" }
    );
    setState((current) => (current ? { ...current, policy: response.policy } : current));
    setRefreshState((current) => ({ ...current, active: false, result: response.result }));
    await load();
  }

  const navItems = [
    { id: "reimbursements" as const, label: "Reimbursements", icon: LayoutDashboard, show: true },
    { id: "policy" as const, label: "Settings", icon: Settings, show: isAdmin },
    { id: "audit" as const, label: "Audit log", icon: Clock3, show: isAdmin }
  ].filter((item) => item.show);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Building2 size={18} />
          </span>
          <div>
            <strong>{state.policy.config.companyName}</strong>
            <small>Finance operations</small>
          </div>
        </div>

        <nav className="side-nav">
          {navItems.map((item) => (
            <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="profile-menu">
          <button className="profile-button" onClick={() => setSwitcherOpen((open) => !open)}>
            <span className="avatar" style={{ background: state.currentUser.avatarColor }}>
              {state.currentUser.name.slice(0, 1)}
            </span>
            <span>
              <strong>{state.currentUser.name}</strong>
              <small>{state.currentUser.title}</small>
            </span>
            <ChevronDown size={15} />
          </button>
          {switcherOpen && (
            <div className="profile-popover">
              {state.users.map((user) => (
                <button key={user.id} onClick={() => void switchUser(user.id)}>
                  <span className="avatar sm" style={{ background: user.avatarColor }}>
                    {user.name.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{user.name}</strong>
                    <small>
                      {user.employeeId} · {user.role}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <small>{isAdmin ? "Admin workspace" : "Employee workspace"}</small>
            <h1>{pageTitle(tab)}</h1>
          </div>
        </header>

        {tab === "reimbursements" && (
          <ReimbursementsView
            summary={state.summary}
            policy={state.policy}
            scoring={state.scoring}
            reimbursements={state.reimbursements}
            isAdmin={isAdmin}
            currentUser={state.currentUser}
            users={state.users}
            busy={busy}
            onReceiptPreview={setReceiptPreview}
            onClaimOptimistic={(claim) => {
              setState((current) =>
                current
                  ? {
                      ...current,
                      reimbursements: [claim, ...current.reimbursements],
                      summary: {
                        ...current.summary,
                        totalSubmitted: current.summary.totalSubmitted + 1,
                        underReviewCount: current.summary.underReviewCount + 1,
                        totalAmount: current.summary.totalAmount + claim.amount
                      }
                    }
                  : current
              );
            }}
            onClaimCreated={(claim) => {
              setState((current) =>
                current
                  ? {
                      ...current,
                      reimbursements: current.reimbursements.map((item) =>
                        item.id === claim.id || (item.id.startsWith("pending_") && item.userId === claim.userId)
                          ? claim
                          : item
                      )
                    }
                  : current
              );
              showToast("Claim submitted for review.", "success");
              void load();
            }}
            onClaimError={(message) => {
              showToast(message, "error");
              void load();
            }}
            onClaimNotice={showToast}
            onApprove={(id) => action(`approve-${id}`, () => request(`/api/reimbursements/${id}/approve`, state.currentUser.id, { method: "POST" }))}
            onReject={(id) => action(`reject-${id}`, () => request(`/api/reimbursements/${id}/reject`, state.currentUser.id, { method: "POST" }))}
            onPay={(id) => action(`pay-${id}`, () => request(`/api/reimbursements/${id}/pay`, state.currentUser.id, { method: "POST" }))}
            onPayAll={() => action("pay-approved", () => request("/api/reimbursements/pay-approved", state.currentUser.id, { method: "POST" }))}
            onRescore={(id) =>
              action(`rescore-${id}`, () => request(`/api/reimbursements/${id}/re-score`, state.currentUser.id, { method: "POST" }))
            }
          />
        )}

        {tab === "policy" && isAdmin && (
          <PolicyMemory
            policy={state.policy}
            scoring={state.scoring}
            messages={state.messages}
            refreshState={refreshState}
            busy={busy}
            onRefresh={() => action("refresh-memory", refreshMemory)}
            onSave={(next) =>
              action("save-policy", () =>
                request("/api/company/policy", state.currentUser.id, {
                  method: "PUT",
                  body: JSON.stringify({ config: next.config, permanentRules: next.permanentRules })
                })
              )
            }
          />
        )}

        {tab === "audit" && isAdmin && <AuditLog audit={state.audit} />}
        <ToastViewport toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
        {receiptPreview && <ReceiptModal reimbursement={receiptPreview} onClose={() => setReceiptPreview(null)} />}
      </main>
    </div>
  );
}

function ReimbursementsView(props: {
  summary: DashboardSummary;
  policy: CompanyPolicyState;
  scoring: AppState["scoring"];
  reimbursements: Reimbursement[];
  isAdmin: boolean;
  currentUser: User;
  users: User[];
  busy: string | null;
  onReceiptPreview: (claim: Reimbursement) => void;
  onClaimOptimistic: (claim: Reimbursement) => void;
  onClaimCreated: (claim: Reimbursement) => void;
  onClaimError: (message: string) => void;
  onClaimNotice: (message: string, tone?: Toast["tone"]) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPay: (id: string) => void;
  onPayAll: () => void;
  onRescore: (id: string) => void;
}) {
  return (
    <section className="stack">
      <ClaimAccordion
        currentUser={props.currentUser}
        users={props.users}
        onOptimistic={props.onClaimOptimistic}
        onCreated={props.onClaimCreated}
        onError={props.onClaimError}
        onNotice={props.onClaimNotice}
      />
      <SummaryCards summary={props.summary} isAdmin={props.isAdmin} />
      {props.isAdmin ? (
        <AdminClaimsTable {...props} cycleDays={props.policy.config.cycleDays} />
      ) : (
        <EmployeeClaimsByCycle
          reimbursements={props.reimbursements}
          cycleDays={props.policy.config.cycleDays}
          onReceiptPreview={props.onReceiptPreview}
        />
      )}
    </section>
  );
}

function SummaryCards({ summary, isAdmin }: { summary: DashboardSummary; isAdmin: boolean }) {
  const cards = isAdmin
    ? [
        { label: "Under review", value: summary.underReviewCount, icon: CircleAlert },
        { label: "Recommended", value: summary.safeCount, icon: BadgeCheck },
        { label: "Needs attention", value: summary.reviewCount + summary.rejectCount, icon: FileText },
        { label: "Paid", value: summary.paidCount, icon: CreditCard }
      ]
    : [
        { label: "Open claims", value: summary.underReviewCount, icon: CircleAlert },
        { label: "Approved", value: summary.approvedCount, icon: CheckCircle2 },
        { label: "Paid", value: summary.paidCount, icon: CreditCard },
        { label: "Total filed", value: summary.totalSubmitted, icon: FileText }
      ];

  return (
    <div className="metrics">
      {cards.map((card) => (
        <div className="metric" key={card.label}>
          <div className="metric-icon">
            <card.icon size={18} />
          </div>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}

function AdminClaimsTable(props: {
  reimbursements: Reimbursement[];
  cycleDays: 14 | 30;
  scoring: AppState["scoring"];
  busy: string | null;
  onReceiptPreview: (claim: Reimbursement) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPay: (id: string) => void;
  onPayAll: () => void;
  onRescore: (id: string) => void;
}) {
  const approvedCount = props.reimbursements.filter((item) => item.status === "approved").length;
  const groups = groupByCycle(props.reimbursements, props.cycleDays);
  return (
    <div className="stack">
      <div className="panel review-toolbar">
      <div className="panel-head">
        <div>
          <h2>Review queue</h2>
          <p>Recommendations are internal finance signals. Employees only see claim status.</p>
          <ScoringEngineStatus scoring={props.scoring} />
        </div>
        <Tooltip text="Pays every approved claim in parallel through the configured payout provider. Disabled until at least one claim is approved.">
          <button className="primary" onClick={props.onPayAll} disabled={!approvedCount || Boolean(props.busy)}>
            <Wallet size={15} /> Pay all approved
          </button>
        </Tooltip>
      </div>
      </div>

      {groups.map((group) => (
        <div className="panel" key={group.label}>
          <div className="panel-head compact-head">
            <div>
              <h2>{group.label}</h2>
              <p>
                {group.items.length} claim{group.items.length === 1 ? "" : "s"} · {formatMoney({
                  currency: "INR",
                  amount: group.items.reduce((sum, item) => sum + item.amount, 0)
                })}
              </p>
            </div>
            <span className="pill">{props.cycleDays}-day cycle</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Claim</th>
                  <th>Submitted</th>
                  <th>Recommendation</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <PersonCell item={item} />
                    </td>
                    <td>
                      <ClaimSummary item={item} onReceiptPreview={props.onReceiptPreview} />
                    </td>
                    <td>
                      <DateTimeCell value={item.submittedAt} />
                    </td>
                    <td>
                      <RecommendationBadge item={item} />
                    </td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      <AdminActionGroup
                        item={item}
                        busy={props.busy}
                        onApprove={props.onApprove}
                        onReject={props.onReject}
                        onPay={props.onPay}
                        onRescore={props.onRescore}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {!groups.length && (
        <div className="panel">
          <div className="empty">No reimbursements have been submitted yet.</div>
        </div>
      )}
      </div>
  );
}

function EmployeeClaimsByCycle({
  reimbursements,
  cycleDays,
  onReceiptPreview
}: {
  reimbursements: Reimbursement[];
  cycleDays: 14 | 30;
  onReceiptPreview: (claim: Reimbursement) => void;
}) {
  const groups = groupByCycle(reimbursements, cycleDays);
  return (
    <div className="cycle-list">
      {groups.map((group) => (
        <section className="panel" key={group.label}>
          <div className="panel-head">
            <div>
              <h2>{group.label}</h2>
              <p>
                {group.items.length} claim{group.items.length === 1 ? "" : "s"} · {cycleDays}-day payment cycle
              </p>
            </div>
          </div>
          <div className="employee-claims">
            {group.items.map((item) => (
              <article className="claim-card" key={item.id}>
                <div className="claim-summary employee-summary">
                  <ReceiptThumbnail item={item} onClick={() => onReceiptPreview(item)} />
                  <div>
                    <strong>{formatMoney(item)}</strong>
                    <small>{sentenceCase(item.category)} · {new Date(item.submittedAt).toLocaleDateString()}</small>
                    <p>{item.reason}</p>
                  </div>
                </div>
                <div className="claim-status">
                  <StatusBadge status={item.status} />
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function RecommendationBadge({ item }: { item: Reimbursement }) {
  const map = {
    safe_to_approve: { label: "Safe to approve", icon: BadgeCheck, className: "safe" },
    needs_review: { label: "Human review", icon: CircleAlert, className: "review" },
    should_not_approve: { label: "Do not approve", icon: Ban, className: "danger" }
  };
  const entry = map[item.recommendation.status];
  return (
    <div className={`recommendation ${entry.className}`}>
      <Tooltip text={recommendationTooltip(item)}>
        <entry.icon size={18} />
      </Tooltip>
      <div>
        <strong>
          {item.recommendation.score}/100 · {entry.label}
        </strong>
        <small>{item.recommendation.summary}</small>
        <details>
          <summary>Decision factors</summary>
          <ul>
            {item.recommendation.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Reimbursement["status"] }) {
  return (
    <Tooltip text={statusTooltip(status)}>
      <span className={`pill status-${status}`}>{status.replace("_", " ")}</span>
    </Tooltip>
  );
}

function PersonCell({ item }: { item: Reimbursement }) {
  return (
    <div className="person">
      <span className="avatar sm" style={{ background: item.employee?.avatarColor }}>
        {item.employee?.name.slice(0, 1)}
      </span>
      <div>
        <strong>{item.employee?.name}</strong>
        <small>{item.employee?.employeeId}</small>
      </div>
    </div>
  );
}

function ClaimAccordion(props: {
  currentUser: User;
  users: User[];
  onOptimistic: (claim: Reimbursement) => void;
  onCreated: (claim: Reimbursement) => void;
  onError: (message: string) => void;
  onNotice: (message: string, tone?: Toast["tone"]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel claim-accordion">
      <button className="accordion-trigger" onClick={() => setOpen((value) => !value)}>
        <span>
          <strong>New reimbursement</strong>
          <small>Submit a claim for this payment cycle</small>
        </span>
        <ChevronDown className={open ? "rotate" : ""} size={18} />
      </button>
      {open && (
        <SubmitClaim
          currentUser={props.currentUser}
          users={props.users}
          onOptimistic={props.onOptimistic}
          onCreated={(claim) => {
            props.onCreated(claim);
            setOpen(false);
          }}
          onError={props.onError}
          onNotice={props.onNotice}
        />
      )}
    </section>
  );
}

function SubmitClaim({
  currentUser,
  users,
  onOptimistic,
  onCreated,
  onError,
  onNotice
}: {
  currentUser: User;
  users: User[];
  onOptimistic: (claim: Reimbursement) => void;
  onCreated: (claim: Reimbursement) => void;
  onError: (message: string) => void;
  onNotice: (message: string, tone?: Toast["tone"]) => void;
}) {
  const employees = users.filter((user) => user.role === "employee");
  const initialForm = {
    userId: currentUser.role === "admin" ? employees[0]?.id ?? currentUser.id : currentUser.id,
    amount: 1200,
    currency: "INR",
    category: "meals",
    reason: "Team lunch after release freeze",
    receiptUrl: "https://receipts.example/demo",
    receiptDataUrl: sampleReceiptImageDataUrl(),
    receiptName: "meal-receipt.png"
  };
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const submittedAt = new Date().toISOString();
    const tempId = `pending_${Date.now()}`;
    const employee = users.find((user) => user.id === form.userId);
    onOptimistic({
      id: tempId,
      userId: currentUser.role === "admin" ? form.userId : currentUser.id,
      amount: Number(form.amount),
      currency: form.currency as Reimbursement["currency"],
      category: form.category as Reimbursement["category"],
      reason: form.reason,
      receiptUrl: form.receiptUrl || undefined,
      receiptDataUrl: form.receiptDataUrl || undefined,
      receiptName: form.receiptName || undefined,
      status: "under_review",
      payoutStatus: "not_started",
      submittedAt,
      employee,
      recommendation: {
        status: "needs_review",
        score: 0,
        summary: "Scoring in progress",
        reasons: ["Waiting for policy evaluation."],
        matchedRuleIds: [],
        model: "pending",
        scoredAt: submittedAt
      }
    });
    try {
      const saved = await request<Reimbursement>("/api/reimbursements", currentUser.id, {
        method: "POST",
        body: JSON.stringify({ ...form, amount: Number(form.amount) })
      });
      onCreated(saved);
      setForm(initialForm);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not submit claim.");
    } finally {
      setBusy(false);
    }
  }

  return (
      <form onSubmit={submit} className="form-grid embedded-form">
        {currentUser.role === "admin" && (
          <label>
            Employee
            <select value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })}>
              {employees.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Amount
          <input
            type="number"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })}
          />
        </label>
        <label>
          Currency
          <select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>
            <option>INR</option>
            <option>USD</option>
            <option>USDC</option>
          </select>
        </label>
        <label>
          Category
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
            {["travel", "meals", "software", "wellness", "equipment", "event", "other"].map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label className="wide">
          Reason
          <textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
        </label>
        <label className="wide">
          Receipt URL
          <input value={form.receiptUrl} onChange={(event) => setForm({ ...form, receiptUrl: event.target.value })} />
        </label>
        <label className="wide">
          Receipt preview
          <select
            value={form.receiptName}
            onChange={(event) => {
              const isPdf = event.target.value.endsWith(".pdf");
              setForm({
                ...form,
                receiptName: event.target.value,
                receiptDataUrl: isPdf ? sampleReceiptPdfDataUrl() : sampleReceiptImageDataUrl()
              });
            }}
          >
            <option value="meal-receipt.png">Image receipt</option>
            <option value="software-invoice.pdf">PDF invoice</option>
          </select>
        </label>
        <button className="primary wide" disabled={busy}>
          {busy ? <RefreshCw className="spin" size={16} /> : <Send size={16} />} Submit claim
        </button>
        <button
          type="button"
          className="wide"
          onClick={() => {
            setForm(initialForm);
            onNotice("Claim form reset.", "info");
          }}
          disabled={busy}
        >
          Reset form
        </button>
      </form>
  );
}

function PolicyMemory(props: {
  policy: CompanyPolicyState;
  scoring: AppState["scoring"];
  messages: CompanyMessage[];
  refreshState: { active: boolean; visibleCount: number; lastMessage?: CompanyMessage; result?: RuleRefreshResult };
  busy: string | null;
  onRefresh: () => void;
  onSave: (policy: CompanyPolicyState) => void;
}) {
  const [draft, setDraft] = useState(props.policy);
  useEffect(() => setDraft(props.policy), [props.policy]);

  const visibleMessages = useMemo(
    () => props.messages.slice(0, props.refreshState.visibleCount),
    [props.messages, props.refreshState.visibleCount]
  );

  return (
    <section className="policy-grid">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Company settings</h2>
            <p>Payment automation remains locked until testnet payout support is enabled.</p>
            <ScoringEngineStatus scoring={props.scoring} />
          </div>
        </div>
        <div className="form-grid compact">
          <label>
            Company
            <input
              value={draft.config.companyName}
              onChange={(event) => setDraft({ ...draft, config: { ...draft.config, companyName: event.target.value } })}
            />
          </label>
          <label>
            Cycle
            <select
              value={draft.config.cycleDays}
              onChange={(event) =>
                setDraft({ ...draft, config: { ...draft.config, cycleDays: Number(event.target.value) as 14 | 30 } })
              }
            >
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </label>
          <label>
            Payment provider
            <select
              value={draft.config.paymentProvider}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  config: { ...draft.config, paymentProvider: event.target.value as typeof draft.config.paymentProvider }
                })
              }
            >
              <option value="mock">Sandbox payout</option>
              <option value="oneclaw_crypto">1Claw crypto</option>
              <option value="razorpay">Razorpay</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={false} disabled />
            Auto-pay when safe
          </label>
          <button className="primary wide" onClick={() => props.onSave(draft)} disabled={Boolean(props.busy)}>
            <ShieldCheck size={16} /> Save settings
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>WhatsApp memory</h2>
            <p>Refresh cycle-specific rules from the company WhatsApp group.</p>
          </div>
          <button className="primary" onClick={props.onRefresh} disabled={Boolean(props.busy)}>
            <Sparkles size={16} /> Refresh
          </button>
        </div>
        <div className="progress-box">
          <div className="progress-line">
            <span style={{ width: `${Math.min(100, (props.refreshState.visibleCount / props.messages.length) * 100)}%` }} />
          </div>
          <strong>
            {props.refreshState.active
              ? `Loading message ${props.refreshState.visibleCount} of ${props.messages.length}`
              : props.refreshState.result?.summary ?? "No temporary rules loaded for this cycle."}
          </strong>
          {props.refreshState.lastMessage && (
            <small>
              Last loaded: {props.refreshState.lastMessage.author} in {props.refreshState.lastMessage.channel}
            </small>
          )}
        </div>
        <div className="message-list">
          {(visibleMessages.length ? visibleMessages : props.messages.slice(0, 3)).map((message) => (
            <div className="message" key={message.id}>
              <MessageSquareText size={16} />
              <div>
                <strong>
                  {message.source} · {message.channel}
                </strong>
                <small>{message.text}</small>
              </div>
            </div>
          ))}
        </div>
      </div>

      <EditableRuleList rules={draft.permanentRules} onChange={(permanentRules) => setDraft({ ...draft, permanentRules })} />
      <RuleList title="Cycle memory" rules={props.policy.temporaryRules} />
    </section>
  );
}

function EditableRuleList({
  rules,
  onChange
}: {
  rules: CompanyPolicyState["permanentRules"];
  onChange: (rules: CompanyPolicyState["permanentRules"]) => void;
}) {
  function update(index: number, patch: Partial<CompanyPolicyState["permanentRules"][number]>) {
    onChange(rules.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...patch } : rule)));
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Permanent policy</h2>
          <p>Baseline reimbursement rules maintained by finance.</p>
        </div>
        <span className="pill">{rules.length} rules</span>
      </div>
      <div className="editable-rules">
        {rules.map((rule, index) => (
          <article className="editable-rule" key={rule.id}>
            <label>
              Title
              <input value={rule.title} onChange={(event) => update(index, { title: event.target.value })} />
            </label>
            <label>
              Amount cap
              <input type="number" value={rule.maxAmount} onChange={(event) => update(index, { maxAmount: Number(event.target.value) })} />
            </label>
            <label className="wide">
              Description
              <textarea value={rule.description} onChange={(event) => update(index, { description: event.target.value })} />
            </label>
            <label className="wide">
              Keywords
              <input
                value={rule.keywords.join(", ")}
                onChange={(event) =>
                  update(index, {
                    keywords: event.target.value
                      .split(",")
                      .map((keyword) => keyword.trim())
                      .filter(Boolean)
                  })
                }
              />
            </label>
            <label className="check wide">
              <input type="checkbox" checked={rule.requiresReceipt} onChange={(event) => update(index, { requiresReceipt: event.target.checked })} />
              Receipt required
            </label>
          </article>
        ))}
      </div>
    </div>
  );
}

function RuleList({ title, rules }: { title: string; rules: CompanyPolicyState["permanentRules"] }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>Regenerated from cycle messages.</p>
        </div>
        <span className="pill">{rules.length} rules</span>
      </div>
      <div className="rule-list">
        {rules.length === 0 && <div className="empty">No temporary memory yet. Refresh messages to generate cycle rules.</div>}
        {rules.map((rule) => (
          <article key={rule.id} className="rule-card">
            <div>
              <strong>{rule.title}</strong>
              <small>{rule.description}</small>
            </div>
            <span className="pill">
              <IndianRupee size={13} /> {rule.maxAmount}
            </span>
          </article>
        ))}
      </div>
    </div>
  );
}

function AuditLog({ audit }: { audit: AuditEvent[] }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Audit log</h2>
          <p>Approval, scoring, memory refresh, and payout activity.</p>
        </div>
      </div>
      <div className="audit-list">
        {audit.map((event) => (
          <div className="audit-event" key={event.id}>
            <UserRound size={16} />
            <div>
              <strong>{event.action.replaceAll("_", " ")}</strong>
              <small>{event.message}</small>
            </div>
            <time>{new Date(event.createdAt).toLocaleString()}</time>
          </div>
        ))}
      </div>
    </section>
  );
}

function groupByCycle(reimbursements: Reimbursement[], cycleDays: 14 | 30) {
  const sorted = [...reimbursements].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const groups = new Map<string, Reimbursement[]>();
  const cycleMs = cycleDays * 24 * 60 * 60 * 1000;
  const epoch = new Date("2026-01-01T00:00:00.000Z").getTime();

  for (const item of sorted) {
    const submitted = new Date(item.submittedAt).getTime();
    const index = Math.floor((submitted - epoch) / cycleMs);
    const start = new Date(epoch + index * cycleMs);
    const end = new Date(start.getTime() + cycleMs - 1);
    const label = `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${end.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    })}`;
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function pageTitle(tab: Tab) {
  const titles: Record<Tab, string> = {
    reimbursements: "Reimbursements",
    policy: "Settings",
    audit: "Audit log"
  };
  return titles[tab];
}

function sentenceCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}, ${date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function formatMoney(item: Pick<Reimbursement, "currency" | "amount">) {
  return `${item.currency} ${item.amount.toLocaleString("en-IN")}`;
}

function ClaimSummary({ item, onReceiptPreview }: { item: Reimbursement; onReceiptPreview: (claim: Reimbursement) => void }) {
  return (
    <div className="claim-summary">
      <ReceiptThumbnail item={item} onClick={() => onReceiptPreview(item)} />
      <div>
        <strong>{formatMoney(item)}</strong>
        <small>
          {sentenceCase(item.category)} · {item.reason}
        </small>
        <small>{item.recommendation.model === "pending" ? "Scoring in progress" : `Scored by ${item.recommendation.model}`}</small>
      </div>
    </div>
  );
}

function AdminActionGroup({
  item,
  busy,
  onApprove,
  onReject,
  onPay,
  onRescore
}: {
  item: Reimbursement;
  busy: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPay: (id: string) => void;
  onRescore: (id: string) => void;
}) {
  return (
    <div className="action-group">
      <Tooltip text="Run the current scoring engine again against the latest settings and cycle memory.">
        <button aria-label="Re-score" onClick={() => onRescore(item.id)} disabled={Boolean(busy)}>
          <RefreshCw className={busy === `rescore-${item.id}` ? "spin" : ""} size={15} />
        </button>
      </Tooltip>
      <Tooltip text="Approve this claim for payout.">
        <button aria-label="Approve" onClick={() => onApprove(item.id)} disabled={item.status === "paid" || Boolean(busy)}>
          <BadgeCheck size={15} />
        </button>
      </Tooltip>
      <Tooltip text="Reject this claim and keep it out of payouts.">
        <button aria-label="Reject" onClick={() => onReject(item.id)} disabled={item.status === "paid" || Boolean(busy)}>
          <Ban size={15} />
        </button>
      </Tooltip>
      <Tooltip text="Pay this claim through the configured payout provider after approval.">
        <button aria-label="Pay" onClick={() => onPay(item.id)} disabled={item.status !== "approved" || Boolean(busy)}>
          <Banknote size={15} />
        </button>
      </Tooltip>
    </div>
  );
}

function DateTimeCell({ value }: { value: string }) {
  const date = new Date(value);
  return (
    <div className="date-cell">
      <strong>{date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</strong>
      <small>{date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</small>
    </div>
  );
}

function ScoringEngineStatus({ scoring }: { scoring: AppState["scoring"] }) {
  return (
    <div className={`engine-status ${scoring.llmEnabled ? "active" : "fallback"}`}>
      <Info size={14} />
      <span>{scoring.llmEnabled ? `Gemini active: ${scoring.model}` : `Fallback scoring: ${scoring.fallbackModel}`}</span>
      <Tooltip
        text={
          scoring.llmEnabled
            ? "New claims and re-score actions call Gemini. The API key is present in the backend environment and is never shown in the UI."
            : "GEMINI_API_KEY is not set in the backend container, so new claims and re-score actions use deterministic policy scoring."
        }
      >
        <Info size={14} />
      </Tooltip>
    </div>
  );
}

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="tooltip-wrap">
      {children}
      <span className="tooltip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}

function recommendationTooltip(item: Reimbursement) {
  return `${item.recommendation.model} scored this claim at ${item.recommendation.score}/100 on ${formatDateTime(
    item.recommendation.scoredAt
  )}.`;
}

function statusTooltip(status: Reimbursement["status"]) {
  const text: Record<Reimbursement["status"], string> = {
    under_review: "Submitted and waiting for finance action.",
    approved: "Approved by finance and ready for payout.",
    rejected: "Rejected by finance and excluded from payouts.",
    paid: "Paid through the configured payout provider."
  };
  return text[status];
}

function ReceiptThumbnail({ item, onClick }: { item: Reimbursement; onClick: () => void }) {
  if (!item.receiptDataUrl) {
    return <span className="receipt-thumb empty-thumb">No receipt</span>;
  }
  const isPdf = item.receiptDataUrl.startsWith("data:application/pdf");
  return (
    <button className="receipt-thumb" onClick={onClick} title={item.receiptName ?? "View receipt"}>
      {isPdf ? <FileText size={20} /> : <img src={item.receiptDataUrl} alt={item.receiptName ?? "Receipt"} />}
    </button>
  );
}

function ReceiptModal({ reimbursement, onClose }: { reimbursement: Reimbursement; onClose: () => void }) {
  const isPdf = reimbursement.receiptDataUrl?.startsWith("data:application/pdf");
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="receipt-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2>{reimbursement.receiptName ?? "Receipt"}</h2>
            <small>
              {formatMoney(reimbursement)} · {sentenceCase(reimbursement.category)}
            </small>
          </div>
          <button onClick={onClose} aria-label="Close receipt">
            <X size={18} />
          </button>
        </header>
        {reimbursement.receiptDataUrl ? (
          isPdf ? (
            <iframe title="Receipt PDF" src={reimbursement.receiptDataUrl} />
          ) : (
            <img src={reimbursement.receiptDataUrl} alt={reimbursement.receiptName ?? "Receipt"} />
          )
        ) : (
          <div className="empty">No receipt attached.</div>
        )}
      </section>
    </div>
  );
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-viewport">
      {toasts.map((toast) => (
        <button className={`toast ${toast.tone}`} key={toast.id} onClick={() => onDismiss(toast.id)}>
          {toast.message}
        </button>
      ))}
    </div>
  );
}

function sampleReceiptImageDataUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240"><rect width="360" height="240" fill="#f8fafc"/><rect x="24" y="24" width="312" height="192" rx="10" fill="#fff" stroke="#cbd5e1"/><text x="44" y="62" font-family="Arial" font-size="22" font-weight="700" fill="#0f172a">Receipt</text><text x="44" y="98" font-family="Arial" font-size="14" fill="#475569">Team lunch after release freeze</text><line x1="44" y1="126" x2="316" y2="126" stroke="#e2e8f0"/><text x="44" y="164" font-family="Arial" font-size="18" fill="#0f172a">Total</text><text x="252" y="164" font-family="Arial" font-size="18" font-weight="700" fill="#0f172a">INR 1200</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function sampleReceiptPdfDataUrl() {
  return "data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9Db3VudCAwID4+CmVuZG9iagp0cmFpbGVyCjw8IC9Sb290IDEgMCBSID4+CiUlRU9G";
}

async function request<T = unknown>(path: string, userId?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(userId ? { "x-user-id": userId } : {}),
      ...init?.headers
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(JSON.stringify(body));
  }
  return response.json() as Promise<T>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
