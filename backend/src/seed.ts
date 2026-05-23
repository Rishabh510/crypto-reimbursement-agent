import { db, id, json, nowIso } from "./db.js";
import type { CompanyMessage, CompanyPolicyState, Reimbursement, User } from "@crypto-reimbursement-agent/shared";
import { scoreReimbursement } from "./services/scoring.js";

const users: User[] = [
  {
    id: "usr_admin",
    role: "admin",
    name: "Ananya Rao",
    employeeId: "ADM-001",
    employmentType: "employee",
    department: "Finance",
    title: "Finance Ops Lead",
    email: "ananya@acme.example",
    avatarColor: "#2454ff"
  },
  {
    id: "usr_isha",
    role: "employee",
    name: "Isha Menon",
    employeeId: "EMP-104",
    employmentType: "employee",
    department: "Engineering",
    title: "Frontend Engineer",
    email: "isha@acme.example",
    avatarColor: "#12a87a"
  },
  {
    id: "usr_kabir",
    role: "employee",
    name: "Kabir Singh",
    employeeId: "CON-219",
    employmentType: "contractor",
    department: "Design",
    title: "Product Designer",
    email: "kabir@contractor.example",
    avatarColor: "#d97706"
  },
  {
    id: "usr_meera",
    role: "employee",
    name: "Meera Iyer",
    employeeId: "EMP-118",
    employmentType: "employee",
    department: "Growth",
    title: "Marketing Manager",
    email: "meera@acme.example",
    avatarColor: "#b423f1"
  }
];

const policy: CompanyPolicyState = {
  config: {
    companyName: "Acme Ledger Labs",
    cycleDays: 14,
    paymentProvider: "mock",
    automaticPaymentsEnabled: false,
    automaticPaymentsAvailable: false,
    recommendationThresholds: {
      safe: 80,
      review: 50
    }
  },
  permanentRules: [
    {
      id: "rule_perm_travel",
      type: "permanent",
      category: "travel",
      title: "Client travel",
      description: "Client travel, airport transfers, and inter-city cab reimbursements are allowed with receipt.",
      maxAmount: 5000,
      currency: "INR",
      keywords: ["client", "travel", "cab", "airport", "train", "flight"],
      requiresReceipt: true,
      source: "admin"
    },
    {
      id: "rule_perm_software",
      type: "permanent",
      category: "software",
      title: "Work software",
      description: "Approved SaaS subscriptions and developer tools are reimbursable up to the monthly limit.",
      maxAmount: 3000,
      currency: "INR",
      keywords: ["software", "subscription", "figma", "github", "vercel", "notion"],
      requiresReceipt: true,
      source: "admin"
    },
    {
      id: "rule_perm_meals",
      type: "permanent",
      category: "meals",
      title: "Work meals",
      description: "Meals during client work or late deployment support are reimbursable with context.",
      maxAmount: 1200,
      currency: "INR",
      keywords: ["meal", "dinner", "lunch", "client", "deployment", "late night"],
      requiresReceipt: true,
      source: "admin"
    }
  ],
  temporaryRules: [],
  updatedAt: nowIso()
};

const messages: CompanyMessage[] = [
  {
    id: "msg_001",
    source: "slack",
    channel: "#announcements",
    author: "Ananya",
    text: "Reminder: Mumbai offsite dinner reimbursements are approved up to INR 1800 for May 20 and May 21.",
    createdAt: daysAgo(11)
  },
  {
    id: "msg_002",
    source: "slack",
    channel: "#engineering",
    author: "Rohan",
    text: "Frontend team can expense Cursor or GitHub Copilot for this sprint if needed, cap INR 2500.",
    createdAt: daysAgo(10)
  },
  {
    id: "msg_003",
    source: "whatsapp",
    channel: "Acme All Hands",
    author: "People Ops",
    text: "Airport cab for the investor demo week will be reimbursed up to INR 2200. Add investor demo in the note.",
    createdAt: daysAgo(9)
  },
  {
    id: "msg_004",
    source: "slack",
    channel: "#design",
    author: "Kabir",
    text: "Can contractors claim the Figma annual add-on this month?",
    createdAt: daysAgo(8)
  },
  {
    id: "msg_005",
    source: "slack",
    channel: "#design",
    author: "Ananya",
    text: "Yes, Figma annual add-on is reimbursable for contractors this cycle, capped at INR 3000 with invoice.",
    createdAt: daysAgo(8)
  },
  {
    id: "msg_006",
    source: "whatsapp",
    channel: "Acme All Hands",
    author: "Admin",
    text: "Wellness and personal gadget purchases are not reimbursed this cycle unless pre-approved.",
    createdAt: daysAgo(7)
  },
  {
    id: "msg_007",
    source: "slack",
    channel: "#growth",
    author: "Meera",
    text: "Growth team campaign travel to Bengaluru client meeting is approved with cab receipts, cap INR 3500.",
    createdAt: daysAgo(6)
  },
  {
    id: "msg_008",
    source: "slack",
    channel: "#announcements",
    author: "Ananya",
    text: "Team lunch after release freeze is reimbursable up to INR 900 per person on Friday.",
    createdAt: daysAgo(5)
  },
  {
    id: "msg_009",
    source: "whatsapp",
    channel: "Acme All Hands",
    author: "People Ops",
    text: "Receipts are mandatory for all temporary event reimbursements.",
    createdAt: daysAgo(4)
  },
  {
    id: "msg_010",
    source: "slack",
    channel: "#random",
    author: "Dev",
    text: "Anyone know if gaming keyboards are reimbursed?",
    createdAt: daysAgo(3)
  },
  {
    id: "msg_011",
    source: "slack",
    channel: "#announcements",
    author: "Ananya",
    text: "Gaming keyboards are personal equipment and should not be reimbursed unless approved by a manager.",
    createdAt: daysAgo(3)
  },
  {
    id: "msg_012",
    source: "whatsapp",
    channel: "Acme All Hands",
    author: "Finance Bot",
    text: "Payment cycle closes today at 6 PM. Submit investor demo, offsite dinner, and approved software claims.",
    createdAt: daysAgo(1)
  }
];

async function main() {
  db.exec(`
    DELETE FROM audit_events;
    DELETE FROM payouts;
    DELETE FROM reimbursements;
    DELETE FROM rule_refresh_runs;
    DELETE FROM company_messages;
    DELETE FROM payment_profiles;
    DELETE FROM users;
    DELETE FROM company_policy_state;
  `);

  const insertUser = db.prepare(`
    INSERT INTO users (id, role, name, employee_id, employment_type, department, title, email, avatar_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const user of users) {
    insertUser.run(
      user.id,
      user.role,
      user.name,
      user.employeeId,
      user.employmentType,
      user.department,
      user.title,
      user.email,
      user.avatarColor
    );
  }

  const profiles = [
    { userId: "usr_isha", preferredRail: "upi", upiId: "isha@okaxis", bankAccountMasked: "HDFC **** 2891", currency: "INR" },
    {
      userId: "usr_kabir",
      preferredRail: "crypto",
      walletAddress: "0x91c7...A4c2",
      bankAccountMasked: "ICICI **** 7710",
      currency: "USDC"
    },
    { userId: "usr_meera", preferredRail: "bank", bankAccountMasked: "SBI **** 6408", currency: "INR" }
  ];
  for (const profile of profiles) {
    db.prepare("INSERT INTO payment_profiles (user_id, payload) VALUES (?, ?)").run(profile.userId, json(profile));
  }

  db.prepare("INSERT INTO company_policy_state (id, payload, updated_at) VALUES ('default', ?, ?)").run(
    json(policy),
    policy.updatedAt
  );

  const insertMessage = db.prepare(`
    INSERT INTO company_messages (id, source, channel_name, author, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const message of messages) {
    insertMessage.run(message.id, message.source, message.channel, message.author, message.text, message.createdAt);
  }

  const initial = [
    {
      userId: "usr_isha",
      amount: 860,
      currency: "INR",
      category: "meals",
      reason: "Late night dinner during release freeze support.",
      receiptUrl: "https://receipts.example/dinner-isha"
    },
    {
      userId: "usr_kabir",
      amount: 2950,
      currency: "INR",
      category: "software",
      reason: "Figma annual add-on discussed in design channel for contractor work.",
      receiptUrl: "https://receipts.example/figma-kabir"
    },
    {
      userId: "usr_meera",
      amount: 6700,
      currency: "INR",
      category: "equipment",
      reason: "Gaming keyboard and mouse for home desk.",
      receiptUrl: ""
    }
  ] as const;

  for (const item of initial) {
    const submittedAt = nowIso();
    const reimbursement: Reimbursement = {
      id: id("rmb"),
      userId: item.userId,
      amount: item.amount,
      currency: item.currency,
      category: item.category,
      reason: item.reason,
      receiptUrl: item.receiptUrl || undefined,
      status: "submitted",
      payoutStatus: "not_started",
      submittedAt,
      recommendation: await scoreReimbursement(
        {
          id: "draft",
          userId: item.userId,
          amount: item.amount,
          currency: item.currency,
          category: item.category,
          reason: item.reason,
          receiptUrl: item.receiptUrl || undefined,
          status: "submitted",
          payoutStatus: "not_started",
          submittedAt,
          recommendation: {
            status: "needs_review",
            score: 50,
            summary: "Pending score",
            reasons: [],
            matchedRuleIds: [],
            model: "seed",
            scoredAt: submittedAt
          }
        },
        policy
      )
    };
    db.prepare(`
      INSERT INTO reimbursements (
        id, user_id, amount, currency, category, reason, receipt_url, status,
        payout_status, recommendation, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reimbursement.id,
      reimbursement.userId,
      reimbursement.amount,
      reimbursement.currency,
      reimbursement.category,
      reimbursement.reason,
      reimbursement.receiptUrl ?? null,
      reimbursement.status,
      reimbursement.payoutStatus,
      json(reimbursement.recommendation),
      reimbursement.submittedAt
    );
  }

  db.prepare(`
    INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id("aud"), "usr_admin", "seed", "system", "default", "Demo data seeded.", nowIso());
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
