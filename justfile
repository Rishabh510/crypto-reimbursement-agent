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
    docker compose up --build

docker-down:
    docker compose down

docker-reset:
    docker compose down -v
    docker compose up --build
