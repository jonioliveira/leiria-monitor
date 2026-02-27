package middleware

import (
	"net/http"
	"strings"
)

// CronAuth returns a middleware that validates the CRON_SECRET bearer token.
// This matches the verifyCronSecret pattern used in the Next.js API routes.
func CronAuth(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			auth := r.Header.Get("Authorization")
			token := strings.TrimPrefix(auth, "Bearer ")
			if token != secret {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
