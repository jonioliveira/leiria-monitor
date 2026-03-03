package handlers

import "net/http"

// CronSnapshot handles POST /api/cron/snapshot.
// The snapshot job is not implemented; returns a graceful skipped response.
func CronSnapshot() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		respond(w, http.StatusOK, map[string]any{
			"success":   true,
			"timestamp": now(),
			"detail": map[string]any{
				"skipped": true,
				"reason":  "snapshot not implemented — use the dedicated cron jobs",
			},
		})
	}
}
