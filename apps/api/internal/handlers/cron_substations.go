package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jonioliveira/leiria-monitor-api/internal/scraper"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

// CronSubstations handles POST /api/cron/substations.
// Fetches E-Redes substation load data and replaces the substation_cache entry.
func CronSubstations(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()

		data, err := scraper.FetchSubstationData(ctx)
		if err != nil {
			respond(w, http.StatusServiceUnavailable,
				envelope{Success: false, Error: "substation fetch failed: " + err.Error()})
			return
		}

		q := sqlcdb.New(pool)
		_ = q.DeleteSubstationCache(ctx)
		_, _ = q.InsertSubstationCache(ctx, data)

		respond(w, http.StatusOK, map[string]any{
			"success":   true,
			"ingested":  1,
			"timestamp": now(),
		})
	}
}
