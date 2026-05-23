import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BadgeCheck,
  Ban,
  Banknote,
  Brain,
  CircleAlert,
  Clock3,
  CreditCard,
  Database,
  IndianRupee,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound
} from "lucide-react";
import type {
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
const defaultUserId = localStorage.getItem("demo_user_id") ?? "usr_admin";

type Tab = "workbench" | "submit" | "policy" | "audit";

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [policy, setPolicy] = useState<CompanyPolicyState | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [messages, setMessages] = useState<CompanyMessage[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [tab, setTab] = useState<Tab>("workbench");
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshState, setRefreshState] = useState<{
    active: boolean;
    visibleCount: number;
    lastMessage?: CompanyMessage;
    result?: RuleRefreshResult;
  }>({ active: false, visibleCount: 0 });

  async function load(userId = currentUser?.id ?? defaultUserId) {
    const session = await request<{ currentUser: User; users: User[] }>("/api/session", userId);
    setCurrentUser(session.currentUser);
    setUsers(session.users);
    localStorage.setItem("demo_user_id", session.currentUser.id);
    const [nextReimbursements, nextPolicy, nextSummary, nextMessages, nextAudit] = await Promise.all([
      request<Reimbursement[]>("/api/reimbursements", session.currentUser.id),
      request<CompanyPolicyState>("/api/company/policy", session.currentUser.id),
      request<DashboardSummary>("/api/dashboard", session.currentUser.id),
      request<CompanyMessage[]>("/api/company/messages", session.currentUser.id),
      request<AuditEvent[]>("/api/audit-events", session.currentUser.id)
    ]);
    setReimbursements(nextReimbursements);
    setPolicy(nextPolicy);
    setSummary(nextSummary);
    setMessages(nextMessages);
    setAudit(nextAudit);
  }

  useEffect(() => {
    void load(defaultUserId);
  }, []);

  const isAdmin = currentUser?.role === "admin";

  async function switchUser(id: string) {
    await load(id);
  }

  async function action(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function refreshMemoryDemo() {
    setRefreshState({ active: true, visibleCount: 0 });
    const ordered = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (let index = 0; index < ordered.length; index += 10) {
      await sleep(550);
      setRefreshState({
        active: true,
        visibleCount: Math.min(index + 10, ordered.length),
        lastMessage: ordered[Math.min(index + 9, ordered.length - 1)]
      });
    }
    const response = await request<{ result: RuleRefreshResult; policy: CompanyPolicyState }>(
      "/api/company/temporary-rules/refresh",
      currentUser?.id,
      { method: "POST" }
    );
    setPolicy(response.policy);
    setRefreshState((state) => ({ ...state, active: false, result: response.result }));
    await load();
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <div className="eyebrow">
            <ShieldCheck size={16} />
            Policy-scored reimbursements with payment rails ready for crypto or Razorpay
          </div>
          <h1>Reimbursement Agent Console</h1>
          <p>
            Review employee claims against permanent company policy and temporary cycle memory, then approve and mock-pay
            through a provider boundary built for future 1Claw testnet payouts.
          </p>
        </div>
        <div className="session-card">
          <span className="label">Demo session</span>
          <select value={currentUser?.id ?? ""} onChange={(event) => void switchUser(event.target.value)}>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} - {user.role}
              </option>
            ))}
          </select>
          <div className="session-user">
            <span className="avatar" style={{ background: currentUser?.avatarColor }}>
              {currentUser?.name.slice(0, 1)}
            </span>
            <div>
              <strong>{currentUser?.name}</strong>
              <small>
                {currentUser?.employeeId} · {currentUser?.department}
              </small>
            </div>
          </div>
        </div>
      </section>

      <nav className="tabs">
        <button className={tab === "workbench" ? "active" : ""} onClick={() => setTab("workbench")}>
          <Database size={17} /> Workbench
        </button>
        <button className={tab === "submit" ? "active" : ""} onClick={() => setTab("submit")}>
          <Send size={17} /> Submit
        </button>
        {isAdmin && (
          <button className={tab === "policy" ? "active" : ""} onClick={() => setTab("policy")}>
            <Brain size={17} /> Policy & Memory
          </button>
        )}
        {isAdmin && (
          <button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>
            <Clock3 size={17} /> Audit
          </button>
        )}
      </nav>

      {tab === "workbench" && (
        <Workbench
          summary={summary}
          reimbursements={reimbursements}
          isAdmin={isAdmin}
          busy={busy}
          onApprove={(id) => action(`approve-${id}`, () => request(`/api/reimbursements/${id}/approve`, currentUser?.id, { method: "POST" }))}
          onReject={(id) => action(`reject-${id}`, () => request(`/api/reimbursements/${id}/reject`, currentUser?.id, { method: "POST" }))}
          onPay={(id) => action(`pay-${id}`, () => request(`/api/reimbursements/${id}/pay`, currentUser?.id, { method: "POST" }))}
          onRescore={(id) =>
            action(`rescore-${id}`, () => request(`/api/reimbursements/${id}/re-score`, currentUser?.id, { method: "POST" }))
          }
        />
      )}

      {tab === "submit" && currentUser && <SubmitClaim currentUser={currentUser} users={users} onCreated={() => load()} />}

      {tab === "policy" && policy && (
        <PolicyMemory
          policy={policy}
          messages={messages}
          refreshState={refreshState}
          busy={busy}
          onRefresh={() => action("refresh-memory", refreshMemoryDemo)}
          onSave={(next) =>
            action("save-policy", () =>
              request("/api/company/policy", currentUser?.id, {
                method: "PUT",
                body: JSON.stringify({ config: next.config, permanentRules: next.permanentRules })
              })
            )
          }
        />
      )}

      {tab === "audit" && <AuditLog audit={audit} />}
    </main>
  );
}

function Workbench(props: {
  summary: DashboardSummary | null;
  reimbursements: Reimbursement[];
  isAdmin: boolean;
  busy: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPay: (id: string) => void;
  onRescore: (id: string) => void;
}) {
  const cards = [
    { label: "Submitted", value: props.summary?.totalSubmitted ?? 0, icon: Database },
    { label: "Safe", value: props.summary?.safeCount ?? 0, icon: BadgeCheck },
    { label: "Review", value: props.summary?.reviewCount ?? 0, icon: CircleAlert },
    { label: "Paid", value: props.summary?.paidCount ?? 0, icon: CreditCard }
  ];

  return (
    <section className="stack">
      <div className="metrics">
        {cards.map((card) => (
          <div className="metric" key={card.label}>
            <card.icon size={18} />
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Claims workbench</h2>
            <p>Recommendation is advisory; payment remains blocked until approval.</p>
          </div>
          <span className="pill muted">Mock payouts only in v1</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Claim</th>
                <th>Recommendation</th>
                <th>Status</th>
                {props.isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {props.reimbursements.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="person">
                      <span className="avatar sm" style={{ background: item.employee?.avatarColor }}>
                        {item.employee?.name.slice(0, 1)}
                      </span>
                      <div>
                        <strong>{item.employee?.name}</strong>
                        <small>{item.employee?.employeeId}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong>
                      {item.currency} {item.amount.toLocaleString("en-IN")}
                    </strong>
                    <small>
                      {item.category} · {item.reason}
                    </small>
                  </td>
                  <td>
                    <RecommendationBadge item={item} />
                  </td>
                  <td>
                    <span className="pill">{item.status}</span>
                    <small>{item.payoutStatus.replace("_", " ")}</small>
                  </td>
                  {props.isAdmin && (
                    <td>
                      <div className="actions">
                        <button onClick={() => props.onRescore(item.id)} disabled={Boolean(props.busy)}>
                          <RefreshCw size={15} /> Score
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
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
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
          <summary>Why</summary>
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
          <h2>Submit reimbursement</h2>
          <p>New claims are scored immediately against current permanent and temporary memory.</p>
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
          <Send size={16} /> Submit and score
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
            <h2>Company config</h2>
            <p>Automatic payments are intentionally visible but locked until testnet payout support is added.</p>
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
              <option value="oneclaw_crypto">1Claw crypto (later)</option>
              <option value="razorpay">Razorpay (later)</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={false} disabled />
            Auto-pay when safe (locked for v1)
          </label>
          <button className="primary wide" onClick={() => props.onSave(draft)} disabled={Boolean(props.busy)}>
            <ShieldCheck size={16} /> Save config and permanent memory
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Temporary memory refresh</h2>
            <p>Mock Slack/WhatsApp messages load in batches of 10 before one Gemini extraction call.</p>
          </div>
          <button className="primary" onClick={props.onRefresh} disabled={Boolean(props.busy)}>
            <Sparkles size={16} /> Refresh memory
          </button>
        </div>
        <div className="progress-box">
          <div className="progress-line">
            <span style={{ width: `${Math.min(100, (props.refreshState.visibleCount / props.messages.length) * 100)}%` }} />
          </div>
          <strong>
            {props.refreshState.active
              ? `Fetching message ${props.refreshState.visibleCount} of ${props.messages.length}`
              : props.refreshState.result?.summary ?? "Temporary memory is empty until you refresh it."}
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

      <EditableRuleList
        rules={draft.permanentRules}
        onChange={(permanentRules) => setDraft({ ...draft, permanentRules })}
      />
      <RuleList title="Temporary memory" rules={props.policy.temporaryRules} />
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
          <h2>Permanent memory</h2>
          <p>Admin-owned baseline policy. Save from company config after editing.</p>
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
              <input
                type="number"
                value={rule.maxAmount}
                onChange={(event) => update(index, { maxAmount: Number(event.target.value) })}
              />
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
              <input
                type="checkbox"
                checked={rule.requiresReceipt}
                onChange={(event) => update(index, { requiresReceipt: event.target.checked })}
              />
              Receipt required
            </label>
          </article>
        ))}
      </div>
    </div>
  );
}

function RuleList({ title, rules, editable = false }: { title: string; rules: CompanyPolicyState["permanentRules"]; editable?: boolean }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{editable ? "Admin-owned baseline policy." : "Regenerated from cycle messages."}</p>
        </div>
        <span className="pill">{rules.length} rules</span>
      </div>
      <div className="rule-list">
        {rules.length === 0 && <div className="empty">No temporary memory yet. Refresh mocked messages to generate rules.</div>}
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
          <p>Every approval, scoring, memory refresh, and payout action is recorded.</p>
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
