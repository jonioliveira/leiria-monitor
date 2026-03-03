.PHONY: build run dev test lint sqlc migrate-up migrate-down migrate-create tidy clean

BINARY     := bin/api
MIGRATIONS := migrations
DB_URL     ?= $(DATABASE_URL)

## Build the binary
build:
	go build -ldflags="-s -w" -o $(BINARY) ./cmd/api

## Run the built binary
run: build
	./$(BINARY)

## Hot-reload development server (requires air: go install github.com/air-verse/air@latest)
dev:
	air

## Run tests with race detector
test:
	go test -v -race -cover ./...

## Run golangci-lint (requires: go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest)
lint:
	golangci-lint run ./...

## Generate sqlc query code
sqlc:
	sqlc generate

## Run all pending migrations
migrate-up:
	migrate -path $(MIGRATIONS) -database "$(DB_URL)" up

## Roll back the last migration
migrate-down:
	migrate -path $(MIGRATIONS) -database "$(DB_URL)" down 1

## Create a new migration pair: make migrate-create name=add_foo_table
migrate-create:
	migrate create -ext sql -dir $(MIGRATIONS) -seq $(name)

## Tidy go modules
tidy:
	go mod tidy

## Remove build artifacts
clean:
	rm -rf bin/
