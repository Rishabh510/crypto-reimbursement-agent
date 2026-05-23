import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AuditEvent,
  CompanyMessage,
  CompanyPolicyState,
  Payout,
  Reimbursement,
  RuleRefreshResult,
  User
} from "@crypto-reimbursement-agent/shared";

const databasePath = resolve(process.env.DATABASE_PATH ?? "./data/reimbursements.db");
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new DatabaseSync(databasePath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    employment_type TEXT NOT NULL,
    department TEXT NOT NULL,
    title TEXT NOT NULL,
    email TEXT NOT NULL,
    avatar_color TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payment_profiles (
    user_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS company_policy_state (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS company_messages (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    author TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reimbursements (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    category TEXT NOT NULL,
    reason TEXT NOT NULL,
    receipt_url TEXT,
    receipt_data_url TEXT,
    receipt_name TEXT,
    status TEXT NOT NULL,
    payout_status TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS payouts (
    id TEXT PRIMARY KEY,
    reimbursement_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    rail TEXT NOT NULL,
    status TEXT NOT NULL,
    external_reference TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(reimbursement_id) REFERENCES reimbursements(id)
  );

  CREATE TABLE IF NOT EXISTS rule_refresh_runs (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

for (const statement of [
  "ALTER TABLE reimbursements ADD COLUMN receipt_data_url TEXT",
  "ALTER TABLE reimbursements ADD COLUMN receipt_name TEXT"
]) {
  try {
    db.exec(statement);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("duplicate column")) {
      throw error;
    }
  }
}

export function json<T>(value: T): string {
  return JSON.stringify(value);
}

export function parseJson<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function rowToUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    role: row.role as User["role"],
    name: String(row.name),
    employeeId: String(row.employee_id),
    employmentType: row.employment_type as User["employmentType"],
    department: String(row.department),
    title: String(row.title),
    email: String(row.email),
    avatarColor: String(row.avatar_color)
  };
}

export function getUsers(): User[] {
  return db.prepare("SELECT * FROM users ORDER BY role, name").all().map((row) => rowToUser(row as Record<string, unknown>));
}

export function getUser(id: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToUser(row) : null;
}

export function getPolicyState(): CompanyPolicyState {
  const row = db.prepare("SELECT payload FROM company_policy_state WHERE id = 'default'").get() as
    | { payload: string }
    | undefined;
  if (!row) {
    throw new Error("Company policy state is missing. Run npm run seed.");
  }
  return parseJson<CompanyPolicyState>(row.payload);
}

export function savePolicyState(policy: CompanyPolicyState): CompanyPolicyState {
  const next = { ...policy, updatedAt: nowIso() };
  db.prepare("UPDATE company_policy_state SET payload = ?, updated_at = ? WHERE id = 'default'").run(
    json(next),
    next.updatedAt
  );
  return next;
}

export function getMessages(): CompanyMessage[] {
  return db
    .prepare("SELECT * FROM company_messages ORDER BY datetime(created_at) ASC")
    .all()
    .map((row) => {
      const value = row as Record<string, unknown>;
      return {
        id: String(value.id),
        source: value.source as CompanyMessage["source"],
        channel: String(value.channel_name),
        author: String(value.author),
        text: String(value.text),
        createdAt: String(value.created_at)
      };
    });
}

export function getReimbursements(user?: User): Reimbursement[] {
  const rows =
    user?.role === "employee"
      ? db.prepare("SELECT * FROM reimbursements WHERE user_id = ? ORDER BY datetime(submitted_at) DESC").all(user.id)
      : db.prepare("SELECT * FROM reimbursements ORDER BY datetime(submitted_at) DESC").all();

  return rows.map((row) => rowToReimbursement(row as Record<string, unknown>));
}

export function getReimbursement(id: string): Reimbursement | null {
  const row = db.prepare("SELECT * FROM reimbursements WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToReimbursement(row) : null;
}

export function rowToReimbursement(row: Record<string, unknown>): Reimbursement {
  const employee = getUser(String(row.user_id)) ?? undefined;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    amount: Number(row.amount),
    currency: row.currency as Reimbursement["currency"],
    category: row.category as Reimbursement["category"],
    reason: String(row.reason),
    receiptUrl: row.receipt_url ? String(row.receipt_url) : undefined,
    receiptDataUrl: row.receipt_data_url ? String(row.receipt_data_url) : undefined,
    receiptName: row.receipt_name ? String(row.receipt_name) : undefined,
    status: row.status as Reimbursement["status"],
    payoutStatus: row.payout_status as Reimbursement["payoutStatus"],
    submittedAt: String(row.submitted_at),
    recommendation: parseJson<Reimbursement["recommendation"]>(row.recommendation),
    employee
  };
}

export function saveReimbursement(reimbursement: Reimbursement): Reimbursement {
  db.prepare(`
    INSERT INTO reimbursements (
      id, user_id, amount, currency, category, reason, receipt_url, receipt_data_url,
      receipt_name, status, payout_status, recommendation, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    reimbursement.id,
    reimbursement.userId,
    reimbursement.amount,
    reimbursement.currency,
    reimbursement.category,
    reimbursement.reason,
    reimbursement.receiptUrl ?? null,
    reimbursement.receiptDataUrl ?? null,
    reimbursement.receiptName ?? null,
    reimbursement.status,
    reimbursement.payoutStatus,
    json(reimbursement.recommendation),
    reimbursement.submittedAt
  );
  return getReimbursement(reimbursement.id)!;
}

export function updateReimbursement(reimbursement: Reimbursement): Reimbursement {
  db.prepare(`
    UPDATE reimbursements
    SET status = ?, payout_status = ?, recommendation = ?
    WHERE id = ?
  `).run(reimbursement.status, reimbursement.payoutStatus, json(reimbursement.recommendation), reimbursement.id);
  return getReimbursement(reimbursement.id)!;
}

export function savePayout(payout: Payout): Payout {
  db.prepare(`
    INSERT INTO payouts (id, reimbursement_id, provider, rail, status, external_reference, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    payout.id,
    payout.reimbursementId,
    payout.provider,
    payout.rail,
    payout.status,
    payout.externalReference,
    payout.createdAt
  );
  return payout;
}

export function saveRefreshRun(result: RuleRefreshResult): RuleRefreshResult {
  db.prepare("INSERT INTO rule_refresh_runs (id, payload, created_at) VALUES (?, ?, ?)").run(
    result.runId,
    json(result),
    result.createdAt
  );
  return result;
}

export function addAudit(event: Omit<AuditEvent, "id" | "createdAt">): AuditEvent {
  const saved: AuditEvent = { ...event, id: id("aud"), createdAt: nowIso() };
  db.prepare(`
    INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    saved.id,
    saved.actorId,
    saved.action,
    saved.entityType,
    saved.entityId,
    saved.message,
    saved.createdAt
  );
  return saved;
}

export function getAuditEvents(): AuditEvent[] {
  return db
    .prepare("SELECT * FROM audit_events ORDER BY datetime(created_at) DESC LIMIT 100")
    .all()
    .map((row) => {
      const value = row as Record<string, unknown>;
      return {
        id: String(value.id),
        actorId: String(value.actor_id),
        action: String(value.action),
        entityType: String(value.entity_type),
        entityId: String(value.entity_id),
        message: String(value.message),
        createdAt: String(value.created_at)
      };
    });
}
