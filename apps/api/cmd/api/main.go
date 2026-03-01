package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"
	"github.com/jonioliveira/leiria-monitor-api/internal/config"
	"github.com/jonioliveira/leiria-monitor-api/internal/db"
	"github.com/jonioliveira/leiria-monitor-api/internal/handlers"
	"github.com/jonioliveira/leiria-monitor-api/internal/middleware"
)

func main() {
	// Load .env in development (ignored if file missing)
	_ = godotenv.Load()

	cfg := config.Load()

	pool, err := db.NewPool(cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	r := chi.NewRouter()
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.RealIP)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: false,
	}))

	// Health check (used by k8s liveness/readiness probes — also pings DB)
	r.Get("/healthz", handlers.Health(pool))

	// ── Public API ────────────────────────────────────────────
	r.Route("/api", func(r chi.Router) {
		// Reports
		r.Get("/reports", handlers.NotImplemented)
		r.Post("/reports", handlers.NotImplemented)
		r.Patch("/reports", handlers.NotImplemented)

		// Dashboard
		r.Get("/dashboard", handlers.NotImplemented)
		r.Get("/dashboard/area", handlers.NotImplemented)

		// Weather
		r.Get("/weather", handlers.Weather(pool))

		// Electricity
		r.Get("/electricity", handlers.Electricity(pool))
		r.Get("/electricity/substations", handlers.Substations(pool))
		r.Get("/electricity/transformers", handlers.Transformers(pool))
		r.Get("/electricity/poles", handlers.Poles(pool))

		// Telecom
		r.Get("/telecom", handlers.NotImplemented)

		// Antennas
		r.Get("/antennas", handlers.Antennas(pool))

		// Occurrences / ProCiv
		r.Get("/occurrences", handlers.Occurrences(pool))

		// Copernicus
		r.Get("/copernicus", handlers.NotImplemented)

		// Push notifications
		r.Handle("/push/subscribe", handlers.PushSubscribe(pool))

		// ── Cron handlers (protected by CRON_SECRET) ──────────
		r.Route("/cron", func(r chi.Router) {
			r.Use(middleware.CronAuth(cfg.CronSecret))
			r.Post("/ingest-all", handlers.NotImplemented)
			r.Post("/telecom", handlers.NotImplemented)
			r.Post("/substations", handlers.NotImplemented)
			r.Post("/transformers", handlers.NotImplemented)
			r.Post("/antennas", handlers.NotImplemented)
			r.Post("/poles", handlers.NotImplemented)
			r.Post("/eredes", handlers.NotImplemented)
			r.Post("/ipma", handlers.NotImplemented)
			r.Post("/prociv", handlers.NotImplemented)
			r.Post("/prociv-warnings", handlers.NotImplemented)
			r.Post("/snapshot", handlers.NotImplemented)
		})
	})

	addr := fmt.Sprintf(":%s", cfg.Port)
	server := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	// Graceful shutdown on SIGTERM / SIGINT (Kubernetes sends SIGTERM on eviction)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	go func() {
		slog.Info("leiria-monitor API starting", "addr", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down server gracefully")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("server shutdown error", "err", err)
		os.Exit(1)
	}
	slog.Info("server stopped")
}
