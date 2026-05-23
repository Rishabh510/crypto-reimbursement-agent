export type Role = "admin" | "employee";

export type EmploymentType = "employee" | "contractor";

export type PaymentProvider = "mock" | "oneclaw_crypto" | "razorpay";

export type PaymentRail = "mock" | "crypto" | "bank" | "upi";

export type ReimbursementStatus =
  | "submitted"
  | "approved"
  | "rejected"
  | "paid";

export type PayoutStatus = "not_started" | "queued" | "paid" | "failed";

export type RecommendationStatus =
  | "safe_to_approve"
  | "needs_review"
  | "should_not_approve";

export type RuleType = "permanent" | "temporary";

export type RuleCategory =
  | "travel"
  | "meals"
  | "software"
  | "wellness"
  | "equipment"
  | "event"
  | "other";

export interface User {
  id: string;
  role: Role;
  name: string;
  employeeId: string;
  employmentType: EmploymentType;
  department: string;
  title: string;
  email: string;
  avatarColor: string;
}

export interface PaymentProfile {
  userId: string;
  preferredRail: PaymentRail;
  bankAccountMasked?: string;
  upiId?: string;
  walletAddress?: string;
  currency: "INR" | "USD" | "USDC" | "ETH";
}

export interface CompanyRule {
  id: string;
  type: RuleType;
  category: RuleCategory;
  title: string;
  description: string;
  maxAmount: number;
  currency: "INR" | "USD" | "USDC";
  keywords: string[];
  requiresReceipt: boolean;
  activeUntil?: string;
  source?: "admin" | "mock_slack" | "mock_whatsapp" | "llm";
}

export interface CompanyConfig {
  companyName: string;
  cycleDays: 14 | 30;
  paymentProvider: PaymentProvider;
  automaticPaymentsEnabled: boolean;
  automaticPaymentsAvailable: boolean;
  recommendationThresholds: {
    safe: number;
    review: number;
  };
}

export interface CompanyPolicyState {
  config: CompanyConfig;
  permanentRules: CompanyRule[];
  temporaryRules: CompanyRule[];
  updatedAt: string;
}

export interface CompanyMessage {
  id: string;
  source: "slack" | "whatsapp";
  channel: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface Reimbursement {
  id: string;
  userId: string;
  amount: number;
  currency: "INR" | "USD" | "USDC";
  category: RuleCategory;
  reason: string;
  receiptUrl?: string;
  status: ReimbursementStatus;
  payoutStatus: PayoutStatus;
  submittedAt: string;
  recommendation: Recommendation;
  employee?: User;
}

export interface Recommendation {
  status: RecommendationStatus;
  score: number;
  summary: string;
  reasons: string[];
  matchedRuleIds: string[];
  model: string;
  scoredAt: string;
}

export interface Payout {
  id: string;
  reimbursementId: string;
  provider: PaymentProvider;
  rail: PaymentRail;
  status: PayoutStatus;
  externalReference: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  message: string;
  createdAt: string;
}

export interface RuleRefreshResult {
  runId: string;
  model: string;
  processedMessageCount: number;
  temporaryRules: CompanyRule[];
  summary: string;
  createdAt: string;
}

export interface DashboardSummary {
  totalSubmitted: number;
  safeCount: number;
  reviewCount: number;
  rejectCount: number;
  approvedCount: number;
  paidCount: number;
  totalAmount: number;
}
