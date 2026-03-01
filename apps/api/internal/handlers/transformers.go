package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

// Transformers serves GET /api/electricity/transformers.
// Returns the cached JSONB blob directly, matching the Next.js route shape.
func Transformers(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := sqlcdb.New(pool)

		row, err := q.GetTransformerCacheEntry(r.Context())
		if err != nil {
			respond(w, http.StatusOK, map[string]any{
				"success":      false,
				"timestamp":    now(),
				"error":        "cache not yet populated — run /api/cron/transformers first",
				"total":        0,
				"transformers": []any{},
			})
			return
		}

		var payload json.RawMessage = row.Data
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(payload)
	}
}
