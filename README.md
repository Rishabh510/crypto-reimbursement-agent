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
just build
just test
just docker-up
```

`just docker-up` starts production-style multi-stage Docker images with Docker Compose. The backend container seeds demo data on startup so the temporary memory starts empty for each fresh demo.

For debugging, prefer direct local development with `just dev`; it uses `tsx watch` for the backend and Vite HMR for the frontend.

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
