.PHONY: help install install-web install-api dev dev-web dev-api \
        build build-web build-api test test-web test-api \
        lint lint-web lint-api migrate-up migrate-down \
        docker-build docker-up docker-down

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Setup ─────────────────────────────────────────────────────────────────────

install: install-web install-api ## Install all dependencies

install-web: ## Install Next.js dependencies
	cd apps/web && pnpm install

install-api: ## Download Go modules
	cd apps/api && go mod download

# ── Development ───────────────────────────────────────────────────────────────

dev-web: ## Start Next.js dev server
	cd apps/web && pnpm dev

dev-api: ## Start Go API with hot reload (requires air)
	cd apps/api && air

dev-db: ## Start local Postgres via Docker Compose
	docker compose -f apps/web/compose.yml up -d

dev-db-down: ## Stop local Postgres
	docker compose -f apps/web/compose.yml down

# ── Build ─────────────────────────────────────────────────────────────────────

build-web: ## Build Next.js for production
	cd apps/web && pnpm build

build-api: ## Build Go binary
	cd apps/api && make build

build: build-web build-api ## Build all apps

# ── Test ──────────────────────────────────────────────────────────────────────

test-web: ## Run Next.js linter (no test runner configured)
	cd apps/web && pnpm lint

test-api: ## Run Go tests with race detector
	cd apps/api && make test

test: test-web test-api ## Run all tests

# ── Lint ──────────────────────────────────────────────────────────────────────

lint-web: ## Lint Next.js
	cd apps/web && pnpm lint

lint-api: ## Lint Go (requires golangci-lint)
	cd apps/api && make lint

lint: lint-web lint-api ## Lint all apps

# ── Database ──────────────────────────────────────────────────────────────────

migrate-up: ## Run pending Go API migrations
	cd apps/api && make migrate-up

migrate-down: ## Roll back last Go API migration
	cd apps/api && make migrate-down

db-push: ## Push Drizzle schema (Next.js dev only)
	cd apps/web && pnpm db:push

# ── Code generation ───────────────────────────────────────────────────────────

sqlc: ## Regenerate sqlc query code
	cd apps/api && make sqlc

# ── Docker ────────────────────────────────────────────────────────────────────

docker-build-api: ## Build Go API Docker image
	docker build -t ghcr.io/jonioliveira/leiria-monitor-api:latest apps/api

docker-build-web: ## Build Next.js Docker image
	docker build -t ghcr.io/jonioliveira/leiria-monitor-web:latest apps/web

docker-build: docker-build-api docker-build-web ## Build all Docker images
