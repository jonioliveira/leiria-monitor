package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

// respond writes a JSON response with the given status code.
func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Health returns a handler for GET /healthz that also verifies DB connectivity.
func Health(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := pool.Ping(r.Context()); err != nil {
			respond(w, http.StatusServiceUnavailable, map[string]string{"status": "db_unavailable"})
			return
		}
		respond(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// NotImplemented is a placeholder for handlers not yet ported from Next.js.
func NotImplemented(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusNotImplemented, map[string]string{
		"error": "not implemented — use Next.js API routes during migration",
	})
}
