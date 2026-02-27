# ── Stage 1: builder ────────────────────────────────────────────────────────
FROM golang:1.23-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/api ./cmd/api

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM alpine:3.21

RUN addgroup -S app && adduser -S -G app app

WORKDIR /app
COPY --from=builder /bin/api ./api
COPY --from=builder /app/migrations ./migrations

USER app

EXPOSE 8080
CMD ["./api"]
