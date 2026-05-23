default:
    just --list

install:
    npm install --cache /private/tmp/crypto-reimbursement-agent-npm-cache

seed:
    npm run seed

dev:
    npm run dev

local-dev: install seed dev

test:
    npm run test

build:
    npm run build

docker-build:
    docker compose build

docker-up:
    docker compose up --build -d

docker-dev:
    docker compose -f docker-compose.dev.yml up -d

docker-dev-build:
    docker compose -f docker-compose.dev.yml up --build -d

docker-dev-down:
    docker compose -f docker-compose.dev.yml down

docker-down:
    docker compose down

docker-reset:
    docker compose down -v
    docker compose up --build -d

docker-dev-reset:
    docker compose -f docker-compose.dev.yml down -v
    docker compose -f docker-compose.dev.yml up -d

logs service:
    docker compose logs -f {{service}}

dev-logs service:
    docker compose -f docker-compose.dev.yml logs -f {{service}}

docker-ps:
    docker compose ps

docker-dev-ps:
    docker compose -f docker-compose.dev.yml ps

oneclaw *args:
    HOME="$PWD/.home" npm_config_cache=/private/tmp/crypto-reimbursement-agent-npm-cache npx --yes @1claw/cli {{args}}

oneclaw-login:
    HOME="$PWD/.home" npm_config_cache=/private/tmp/crypto-reimbursement-agent-npm-cache npx --yes @1claw/cli login

oneclaw-login-email:
    HOME="$PWD/.home" npm_config_cache=/private/tmp/crypto-reimbursement-agent-npm-cache npx --yes @1claw/cli login --email

oneclaw-whoami:
    HOME="$PWD/.home" npm_config_cache=/private/tmp/crypto-reimbursement-agent-npm-cache npx --yes @1claw/cli whoami

oneclaw-bootstrap:
    HOME="$PWD/.home" npm_config_cache=/private/tmp/crypto-reimbursement-agent-npm-cache node scripts/oneclaw-bootstrap.mjs
