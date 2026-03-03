package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

// CronIngestAll handles POST /api/cron/ingest-all.
// Runs all lightweight ingestion jobs sequentially: IPMA, E-Redes scheduled work,
// ProCiv occurrences, ProCiv population warnings, and antennas.
// Heavy jobs (substations, transformers, poles) have dedicated endpoints.
func CronIngestAll(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		results := make(map[string]any)

		// 1. IPMA warnings + forecast
		warnCount, forecastCount, err := ingestIPMA(ctx, pool)
		if err != nil {
			results["ipma"] = map[string]any{"success": false, "error": err.Error()}
		} else {
			results["ipma"] = map[string]any{
				"success": true,
				"detail":  map[string]int{"warnings": warnCount, "forecasts": forecastCount},
			}
		}

		// 2. E-Redes scheduled work
		eredesCount, err := ingestEredes(ctx, pool)
		if err != nil {
			results["eredes"] = map[string]any{"success": false, "error": err.Error()}
		} else {
			results["eredes"] = map[string]any{
				"success": true,
				"detail":  map[string]int{"scheduled": eredesCount},
			}
		}

		// 3. ProCiv occurrences
		procivCount, err := ingestProciv(ctx, pool)
		if err != nil {
			results["prociv"] = map[string]any{"success": false, "error": err.Error()}
		} else {
			results["prociv"] = map[string]any{
				"success": true,
				"detail":  map[string]int{"ingested": procivCount},
			}
		}

		// 4. ProCiv population warnings
		warningsCount, err := ingestProcivWarnings(ctx, pool)
		if err != nil {
			results["procivWarnings"] = map[string]any{"success": false, "error": err.Error()}
		} else {
			results["procivWarnings"] = map[string]any{
				"success": true,
				"detail":  map[string]int{"ingested": warningsCount},
			}
		}

		// 5. Antennas
		antennasCount, err := ingestAntennas(ctx, pool)
		if err != nil {
			results["antennas"] = map[string]any{"success": false, "error": err.Error()}
		} else {
			results["antennas"] = map[string]any{
				"success": true,
				"detail":  map[string]int{"ingested": antennasCount},
			}
		}

		respond(w, http.StatusOK, map[string]any{
			"success":   true,
			"results":   results,
			"timestamp": now(),
		})
	}
}
