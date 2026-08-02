package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

const eredesScheduledURL = "https://e-redes.opendatasoft.com/api/explore/v2.1/catalog/datasets/" +
	"network-scheduling-work/records?limit=50&where=postalcode%20LIKE%20%2724%25%27"

// ingestEredes fetches E-Redes scheduled work and writes it to the DB.
// Returns the number of rows ingested.
func ingestEredes(ctx context.Context, pool *pgxpool.Pool) (int, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, eredesScheduledURL, nil)
	if err != nil {
		return 0, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	var data struct {
		Results []map[string]any `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, err
	}

	q := sqlcdb.New(pool)
	_ = q.DeleteScheduledWork(ctx)

	ingested := 0
	for _, row := range data.Results {
		params := sqlcdb.InsertScheduledWorkParams{
			PostalCode:   textFromAny(row["postalcode"]),
			Locality:     textFromAny(row["locality"], row["localidade"]),
			District:     textFromAny(row["distrito"], row["district"]),
			Municipality: textFromAny(row["municipio"], row["municipality"]),
			StartTime:    textFromAny(row["startdate"], row["data_inicio"]),
			EndTime:      textFromAny(row["enddate"], row["data_fim"]),
			Reason:       textFromAny(row["reason"], row["motivo"]),
		}
		if _, err := q.InsertScheduledWork(ctx, params); err == nil {
			ingested++
		}
	}
	return ingested, nil
}

// CronEredes handles POST /api/cron/eredes.
func CronEredes(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ingested, err := ingestEredes(r.Context(), pool)
		if err != nil {
			respond(w, http.StatusServiceUnavailable,
				envelope{Success: false, Error: "E-Redes fetch failed: " + err.Error()})
			return
		}
		respond(w, http.StatusOK, map[string]any{
			"success":        true,
			"scheduled_work": ingested,
			"timestamp":      now(),
		})
	}
}
