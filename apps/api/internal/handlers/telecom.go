package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jonioliveira/leiria-monitor-api/internal/config"
	"github.com/jonioliveira/leiria-monitor-api/internal/scraper"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

const telecomCacheTTL = 15 * time.Minute

// Telecom handles GET /api/telecom.
// Serves cached JSONB directly when fresh; background-refreshes on stale;
// scrapes synchronously on cold start.
func Telecom(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := sqlcdb.New(pool)

		entry, err := q.GetTelecomCacheEntry(r.Context())
		if err == nil {
			age := time.Since(entry.FetchedAt.Time)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(entry.Data)
			if age >= telecomCacheTTL {
				go refreshTelecomCache(pool, cfg.MeoAPIKey)
			}
			return
		}

		// Cache miss — scrape synchronously.
		data, scrapeErr := scraper.FetchTelecomData(r.Context(), cfg.MeoAPIKey)
		if scrapeErr != nil {
			respond(w, http.StatusServiceUnavailable,
				envelope{Success: false, Error: "telecom data unavailable"})
			return
		}
		_ = q.DeleteTelecomCache(r.Context())
		_, _ = q.InsertTelecomCache(r.Context(), data)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(data)
	}
}

func refreshTelecomCache(pool *pgxpool.Pool, meoAPIKey string) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	data, err := scraper.FetchTelecomData(ctx, meoAPIKey)
	if err != nil {
		return
	}
	q := sqlcdb.New(pool)
	_ = q.DeleteTelecomCache(ctx)
	_, _ = q.InsertTelecomCache(ctx, data)
}
