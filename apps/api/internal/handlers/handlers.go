package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// envelope is the standard error/not-implemented response shape.
type envelope struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// now returns the current UTC time as an ISO-8601 string.
func now() string {
	return time.Now().UTC().Format(time.RFC3339)
}

// nullFloat64 converts a *float64 to pgtype.Float4 for sqlc nullable columns.
func nullFloat64(v *float64) pgtype.Float4 {
	if v == nil {
		return pgtype.Float4{Valid: false}
	}
	return pgtype.Float4{Float32: float32(*v), Valid: true}
}

// nullString converts a *string to sql.NullString.
func nullString(v *string) sql.NullString {
	if v == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: *v, Valid: true}
}

// nullText converts a *string to pgtype.Text for sqlc nullable text columns.
func nullText(v *string) pgtype.Text {
	if v == nil {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: *v, Valid: true}
}

// stringPtr returns nil for empty string, otherwise a pointer to s.
func stringPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

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
