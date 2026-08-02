package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

const substationStaleAfter = 30 * time.Minute

// Substations serves GET /api/electricity/substations.
// Returns the cached JSONB blob directly, matching the Next.js route shape.
func Substations(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := sqlcdb.New(pool)

		row, err := q.GetSubstationCacheEntry(r.Context())
		if err != nil {
			// No cache yet — return empty shell matching expected shape
			respond(w, http.StatusOK, map[string]any{
				"success":      false,
				"timestamp":    now(),
				"error":        "cache not yet populated — run /api/cron/substations first",
				"substations":  []any{},
				"baseline":     0,
				"actual":       []any{},
				"projection":   []any{},
				"perSubstation": map[string]any{},
			})
			return
		}

		// Pass the raw JSONB through without re-encoding
		var payload json.RawMessage = row.Data
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(payload)
	}
}
