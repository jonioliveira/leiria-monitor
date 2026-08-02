package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jonioliveira/leiria-monitor-api/internal/scraper"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

// CronTransformers handles POST /api/cron/transformers.
// Fetches PTD transformer data and replaces the transformer_cache entry.
func CronTransformers(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()

		data, err := scraper.FetchTransformerData(ctx)
		if err != nil {
			respond(w, http.StatusServiceUnavailable,
				envelope{Success: false, Error: "transformer fetch failed: " + err.Error()})
			return
		}

		q := sqlcdb.New(pool)
		_ = q.DeleteTransformerCache(ctx)
		_, _ = q.InsertTransformerCache(ctx, data)

		respond(w, http.StatusOK, map[string]any{
			"success":   true,
			"ingested":  1,
			"timestamp": now(),
		})
	}
}
