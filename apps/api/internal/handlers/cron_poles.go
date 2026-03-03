package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

const (
	polesBase    = "https://e-redes.opendatasoft.com/api/explore/v2.1"
	polesDataset = "apoios-baixa-tensao"
	// Leiria centre coordinates
	polesLat    = 39.65
	polesLng    = -8.75
	polesRadius = 50 // km
)

// CronPoles handles POST /api/cron/poles.
// Downloads the BT poles NDJSON export for a 50 km radius around Leiria
// and bulk-inserts them into bt_poles.
func CronPoles(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
		defer cancel()

		exportURL, _ := url.Parse(polesBase + "/catalog/datasets/" + polesDataset + "/exports/jsonl")
		q := exportURL.Query()
		q.Set("where", "within_distance(geo_point_2d, geom'POINT(-8.75 39.65)', 50km)")
		q.Set("select", "geo_point_2d")
		exportURL.RawQuery = q.Encode()

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, exportURL.String(), nil)
		if err != nil {
			respond(w, http.StatusInternalServerError, envelope{Success: false, Error: err.Error()})
			return
		}
		client := &http.Client{Timeout: 5 * time.Minute}
		resp, err := client.Do(req)
		if err != nil {
			respond(w, http.StatusServiceUnavailable,
				envelope{Success: false, Error: "E-Redes API unavailable"})
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			respond(w, http.StatusBadGateway,
				envelope{Success: false, Error: "E-Redes returned " + resp.Status})
			return
		}

		type geoPoint struct {
			Lat float64 `json:"lat"`
			Lon float64 `json:"lon"`
		}
		type poleRecord struct {
			GeoPoint geoPoint `json:"geo_point_2d"`
		}

		var poles []sqlcdb.InsertBtPoleParams
		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Bytes()
			if len(line) == 0 {
				continue
			}
			var rec poleRecord
			if err := json.Unmarshal(line, &rec); err != nil {
				continue
			}
			if rec.GeoPoint.Lat == 0 && rec.GeoPoint.Lon == 0 {
				continue
			}
			poles = append(poles, sqlcdb.InsertBtPoleParams{
				Lat: float32(rec.GeoPoint.Lat),
				Lng: float32(rec.GeoPoint.Lon),
			})
		}

		db := sqlcdb.New(pool)
		_ = db.DeleteBtPoles(ctx)
		for _, p := range poles {
			_, _ = db.InsertBtPole(ctx, p)
		}

		respond(w, http.StatusOK, map[string]any{
			"success":   true,
			"ingested":  len(poles),
			"timestamp": now(),
		})
	}
}
