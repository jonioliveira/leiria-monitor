package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool creates a connection pool using the provided DATABASE_URL.
// The pool is tuned for Neon serverless: short connection lifetimes prevent
// exhausting the limited connection slots on the free tier.
func NewPool(databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database config: %w", err)
	}

	// Neon free tier has a small connection limit; recycle connections aggressively.
	cfg.MaxConns = 5
	cfg.MaxConnLifetime = 5 * time.Minute
	cfg.MaxConnIdleTime = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}

	if err := pool.Ping(context.Background()); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return pool, nil
}
