package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jonioliveira/leiria-monitor-api/internal/scraper"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

// CronTelecom handles POST /api/cron/telecom.
// Scrapes telecom data and replaces the telecom_cache entry.
func CronTelecom(pool *pgxpool.Pool, meoAPIKey string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()

		data, err := scraper.FetchTelecomData(ctx, meoAPIKey)
		if err != nil {
			respond(w, http.StatusServiceUnavailable,
				envelope{Success: false, Error: "telecom scrape failed: " + err.Error()})
			return
		}

		q := sqlcdb.New(pool)
		_ = q.DeleteTelecomCache(ctx)
		_, _ = q.InsertTelecomCache(ctx, data)

		respond(w, http.StatusOK, map[string]any{
			"success":   true,
			"ingested":  1,
			"timestamp": now(),
		})
	}
}
