# Crypto Reimbursement Agent

Demo reimbursement approval system with policy memory, LLM-assisted scoring, mocked payment execution, and provider boundaries for later crypto or Razorpay-style payouts.

## Run locally

```bash
npm install
npm run seed
npm run dev
```

Or with `just`:

```bash
cd /Users/geetha/1claw/crypto-reimbursement-agent
just install
just seed
just dev
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:4000`

## Quick commands

```bash
just install
just seed
just dev
just docker-dev
just dev-logs backend
just dev-logs frontend
just build
just test
just docker-up
just logs backend
just logs frontend
```

`just docker-up` starts production-style multi-stage Docker images with Docker Compose. The backend container seeds demo data on startup so the temporary memory starts empty for each fresh demo.

For Docker-based debugging, use `just docker-dev`. It mounts the repo into both containers, runs backend `tsx watch`, and runs Vite HMR for the frontend. Use `just docker-dev-reset` when you want to clear the Docker volumes and reseed from scratch.

For direct local development without Docker, use `just dev`; it uses the same backend watch and frontend HMR, but runs against your local Node install.

### Preferred Docker debug loop

```bash
cd /Users/geetha/1claw/crypto-reimbursement-agent
just docker-dev
```

This runs two containers plus the SQLite volume:

- backend on `http://localhost:4000` with `tsx watch`
- frontend on `http://localhost:5173` with Vite HMR
- SQLite stored in the Docker volume `backend-data`

Use this when you do not want to manage local ports, DB files, or multiple terminal processes yourself.

Docker commands run detached by default. Tail logs when needed:

```bash
just dev-logs backend
just dev-logs frontend
```

For production-style Compose logs:

```bash
just logs backend
just logs frontend
```

If you do not have `just`, run the underlying npm or Docker commands directly.

## LLM configuration

The backend uses `GEMINI_MODEL=gemini-3.1-flash-lite` by default and calls Gemini when `GEMINI_API_KEY` is present. Without an API key, deterministic demo fallbacks are used so the app remains fully usable.

## Payment configuration

V1 only allows the `mock` provider. The code includes a provider interface so `oneclaw_crypto` and `razorpay` can be added later without changing reimbursement workflows.

## Next integration steps

1. Copy `backend/.env.example` to `backend/.env` for local development.
2. Add `GEMINI_API_KEY` if you want real Gemini calls instead of deterministic fallbacks.
3. Keep payment credentials out of git. Add future 1Claw, RPC, Razorpay, or webhook keys through local env vars or a secrets manager.
4. For 1Claw testnet payouts, implement the existing `OneClawCryptoProvider` adapter in `backend/src/services/payments.ts`.
5. For Razorpay, implement `RazorpayProvider` behind the same adapter and keep reimbursement approval flow unchanged.

## 1Claw setup

The project uses the 1Claw CLI through `npx @1claw/cli` without a global install. CLI config is kept in project-local `.home/`, which is gitignored.

```bash
just oneclaw-login
just oneclaw-whoami
```

After login, bootstrap a demo vault and agent:

```bash
GEMINI_API_KEY=... just oneclaw-bootstrap
```

Optional values the bootstrap script will store when provided:

```bash
RPC_URL=...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
```

The script creates:

- a vault named `crypto-reimbursement-agent-dev`
- an agent named `reimbursement-agent-dev`
- an access policy granting the agent read access to `app/*`
- secrets such as `app/gemini-api-key` when matching env vars are provided
- `.env.oneclaw` with vault/agent ids for later app integration
