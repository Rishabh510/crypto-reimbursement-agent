import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const vaultName = process.env.ONECLAW_VAULT_NAME ?? "crypto-reimbursement-agent-dev";
const agentName = process.env.ONECLAW_AGENT_NAME ?? "reimbursement-agent-dev";
const secretPrefix = process.env.ONECLAW_SECRET_PREFIX ?? "app";

const cliEnv = {
  ...process.env,
  HOME: `${process.cwd()}/.home`,
  npm_config_cache: "/private/tmp/crypto-reimbursement-agent-npm-cache"
};

function runRaw(args) {
  return execFileSync("npx", ["--yes", "@1claw/cli", ...args], {
    cwd: process.cwd(),
    env: cliEnv,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  }).trim();
}

function runJson(args) {
  const output = runRaw(["--json", ...args]);
  const parsed = parseJson(output);
  if (parsed === null) {
    throw new Error(`Expected JSON from 1Claw CLI, got: ${output}`);
  }
  return parsed;
}

function parseJson(output) {
  const trimmed = output.trim();
  const firstObject = trimmed.indexOf("{");
  const firstArray = trimmed.indexOf("[");
  const jsonStart =
    firstObject === -1 ? firstArray : firstArray === -1 ? firstObject : Math.min(firstObject, firstArray);
  if (jsonStart < 0) return null;
  return JSON.parse(trimmed.slice(jsonStart));
}

function uuidFromText(text) {
  return text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
}

function apiKeyFromText(text) {
  return text.match(/ocv_[A-Za-z0-9._-]+/)?.[0];
}

function getByName(collection, name) {
  if (!Array.isArray(collection)) return undefined;
  return collection.find((item) => item?.name === name || item?.Name === name);
}

function ensureVault() {
  const existing = getByName(runJson(["vault", "list"]), vaultName);
  if (existing?.id) {
    console.log(`Using existing vault: ${vaultName} (${existing.id})`);
    return existing.id;
  }

  console.log(`Creating 1Claw vault: ${vaultName}`);
  const output = runRaw(["vault", "create", vaultName, "--description", "Crypto reimbursement agent demo secrets"]);
  const vaultId = uuidFromText(output);
  if (!vaultId) throw new Error(`Could not read vault id from response: ${output}`);
  return vaultId;
}

function ensureAgent(vaultId) {
  const existing = getByName(runJson(["agent", "list"]), agentName);
  if (existing?.id) {
    console.log(`Using existing agent: ${agentName} (${existing.id})`);
    return { agentId: existing.id, agentApiKey: undefined };
  }

  console.log(`Creating 1Claw agent: ${agentName}`);
  const output = runRaw([
    "agent",
    "create",
    agentName,
    "--vault-ids",
    vaultId
  ]);
  let agentId = uuidFromText(output);
  const agentApiKey = apiKeyFromText(output);
  if (!agentId) {
    const created = getByName(runJson(["agent", "list"]), agentName);
    agentId = created?.id;
  }
  if (!agentId) throw new Error(`Could not read agent id from response: ${output}`);
  return { agentId, agentApiKey };
}

const vaultId = ensureVault();
const { agentId, agentApiKey } = ensureAgent(vaultId);

const policies = runJson(["policy", "list", "--vault", vaultId]);
const hasPolicy =
  Array.isArray(policies) &&
  policies.some((policy) => {
    const principalId = policy.principal_id ?? policy.principalId ?? policy.principal?.id;
    const path = policy.path ?? policy.path_pattern ?? policy.pathPattern ?? policy.secret_path_pattern;
    return principalId === agentId && path === `${secretPrefix}/*`;
  });

if (hasPolicy) {
  console.log(`Using existing policy for ${agentName} on ${secretPrefix}/*`);
} else {
  console.log("Granting agent read access to app/* secrets");
  runRaw([
    "policy",
    "create",
    "--vault",
    vaultId,
    "--principal-type",
    "agent",
    "--principal-id",
    agentId,
    "--path",
    `${secretPrefix}/*`,
    "--permissions",
    "read"
  ]);
}

const secrets = [
  ["GEMINI_API_KEY", `${secretPrefix}/gemini-api-key`, "api_key"],
  ["RPC_URL", `${secretPrefix}/rpc-url`, "url"],
  ["RAZORPAY_KEY_ID", `${secretPrefix}/razorpay-key-id`, "api_key"],
  ["RAZORPAY_KEY_SECRET", `${secretPrefix}/razorpay-key-secret`, "api_key"]
];

for (const [envName, path, type] of secrets) {
  const value = process.env[envName];
  if (!value) {
    console.log(`Skipping ${path}; ${envName} is not set.`);
    continue;
  }
  console.log(`Storing ${path}`);
  runRaw(["secret", "set", path, "--vault", vaultId, "--type", type, "--value", value]);
}

const envFile = [
  `ONECLAW_VAULT_ID=${vaultId}`,
  `ONECLAW_AGENT_ID=${agentId}`,
  agentApiKey
    ? `ONECLAW_AGENT_API_KEY=${agentApiKey}`
    : "# ONECLAW_AGENT_API_KEY was not returned because the agent already existed or the CLI response omitted it",
  `ONECLAW_SECRET_PREFIX=${secretPrefix}`
].join("\n");

writeFileSync(".env.oneclaw", `${envFile}\n`);
console.log("Wrote .env.oneclaw with vault/agent ids. Keep it out of git.");
