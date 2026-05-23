import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BadgeCheck,
  Ban,
  Banknote,
  Brain,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  CreditCard,
  FileText,
  IndianRupee,
  LayoutDashboard,
  MessageSquareText,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound
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

type Tab = "reimbursements" | "submit" | "policy" | "audit";

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>("reimbursements");
  const [busy, setBusy] = useState<string | null>(null);
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

  async function action(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
      await load();
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
    { id: "submit" as const, label: "New claim", icon: Send, show: true },
    { id: "policy" as const, label: "Policy memory", icon: Brain, show: isAdmin },
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
          <span className="status-chip">
            <ShieldCheck size={15} />
            {state.policy.config.paymentProvider === "mock" ? "Mock payout rail" : state.policy.config.paymentProvider}
          </span>
        </header>

        {tab === "reimbursements" && (
          <ReimbursementsView
            summary={state.summary}
            policy={state.policy}
            reimbursements={state.reimbursements}
            isAdmin={isAdmin}
            busy={busy}
            onApprove={(id) => action(`approve-${id}`, () => request(`/api/reimbursements/${id}/approve`, state.currentUser.id, { method: "POST" }))}
            onReject={(id) => action(`reject-${id}`, () => request(`/api/reimbursements/${id}/reject`, state.currentUser.id, { method: "POST" }))}
            onPay={(id) => action(`pay-${id}`, () => request(`/api/reimbursements/${id}/pay`, state.currentUser.id, { method: "POST" }))}
            onRescore={(id) =>
              action(`rescore-${id}`, () => request(`/api/reimbursements/${id}/re-score`, state.currentUser.id, { method: "POST" }))
            }
          />
        )}

        {tab === "submit" && (
          <SubmitClaim currentUser={state.currentUser} users={state.users} onCreated={() => load()} />
        )}

        {tab === "policy" && isAdmin && (
          <PolicyMemory
            policy={state.policy}
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
      </main>
    </div>
  );
}

function ReimbursementsView(props: {
  summary: DashboardSummary;
  policy: CompanyPolicyState;
  reimbursements: Reimbursement[];
  isAdmin: boolean;
  busy: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPay: (id: string) => void;
  onRescore: (id: string) => void;
}) {
  return (
    <section className="stack">
      <SummaryCards summary={props.summary} isAdmin={props.isAdmin} />
      {props.isAdmin ? (
        <AdminClaimsTable {...props} />
      ) : (
        <EmployeeClaimsByCycle reimbursements={props.reimbursements} cycleDays={props.policy.config.cycleDays} />
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
  busy: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPay: (id: string) => void;
  onRescore: (id: string) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Review queue</h2>
          <p>Recommendations are internal finance signals. Employees only see claim status.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Claim</th>
              <th>Recommendation</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {props.reimbursements.map((item) => (
              <tr key={item.id}>
                <td>
                  <PersonCell item={item} />
                </td>
                <td>
                  <strong>
                    {item.currency} {item.amount.toLocaleString("en-IN")}
                  </strong>
                  <small>
                    {sentenceCase(item.category)} · {item.reason}
                  </small>
                </td>
                <td>
                  <RecommendationBadge item={item} />
                </td>
                <td>
                  <StatusBadge status={item.status} />
                  <small>{formatPayoutStatus(item.payoutStatus)}</small>
                </td>
                <td>
                  <div className="actions">
                    <button onClick={() => props.onRescore(item.id)} disabled={Boolean(props.busy)}>
                      <RefreshCw size={15} /> Re-score
                    </button>
                    <button onClick={() => props.onApprove(item.id)} disabled={item.status === "paid" || Boolean(props.busy)}>
                      <BadgeCheck size={15} /> Approve
                    </button>
                    <button onClick={() => props.onReject(item.id)} disabled={item.status === "paid" || Boolean(props.busy)}>
                      <Ban size={15} /> Reject
                    </button>
                    <button onClick={() => props.onPay(item.id)} disabled={item.status !== "approved" || Boolean(props.busy)}>
                      <Banknote size={15} /> Pay
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmployeeClaimsByCycle({ reimbursements, cycleDays }: { reimbursements: Reimbursement[]; cycleDays: 14 | 30 }) {
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
                <div>
                  <strong>
                    {item.currency} {item.amount.toLocaleString("en-IN")}
                  </strong>
                  <small>
                    {sentenceCase(item.category)} · {new Date(item.submittedAt).toLocaleDateString()}
                  </small>
                  <p>{item.reason}</p>
                </div>
                <div className="claim-status">
                  <StatusBadge status={item.status} />
                  <small>{formatPayoutStatus(item.payoutStatus)}</small>
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
      <entry.icon size={18} />
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
  return <span className={`pill status-${status}`}>{status.replace("_", " ")}</span>;
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

function SubmitClaim({ currentUser, users, onCreated }: { currentUser: User; users: User[]; onCreated: () => void }) {
  const employees = users.filter((user) => user.role === "employee");
  const [form, setForm] = useState({
    userId: currentUser.role === "admin" ? employees[0]?.id ?? currentUser.id : currentUser.id,
    amount: 1200,
    currency: "INR",
    category: "meals",
    reason: "Team lunch after release freeze",
    receiptUrl: "https://receipts.example/demo"
  });
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await request("/api/reimbursements", currentUser.id, {
        method: "POST",
        body: JSON.stringify({ ...form, amount: Number(form.amount) })
      });
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel form-panel">
      <div className="panel-head">
        <div>
          <h2>New reimbursement</h2>
          <p>Claims move into under review after submission.</p>
        </div>
      </div>
      <form onSubmit={submit} className="form-grid">
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
        <button className="primary wide" disabled={busy}>
          <Send size={16} /> Submit claim
        </button>
      </form>
    </section>
  );
}

function PolicyMemory(props: {
  policy: CompanyPolicyState;
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
              <option value="mock">Mock payout</option>
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
            <h2>Temporary memory</h2>
            <p>Refresh cycle-specific rules from recent company messages.</p>
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
    submit: "New claim",
    policy: "Policy memory",
    audit: "Audit log"
  };
  return titles[tab];
}

function formatPayoutStatus(status: Reimbursement["payoutStatus"]) {
  return status.replace("_", " ");
}

function sentenceCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
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
