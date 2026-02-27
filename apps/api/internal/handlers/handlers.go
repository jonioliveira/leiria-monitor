package handlers

import (
	"encoding/json"
	"net/http"
)

// respond writes a JSON response with the given status code.
func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Health handles GET /healthz
func Health(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusOK, map[string]string{"status": "ok"})
}

// NotImplemented is a placeholder for handlers not yet ported from Next.js.
func NotImplemented(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusNotImplemented, map[string]string{
		"error": "not implemented — use Next.js API routes during migration",
	})
}
