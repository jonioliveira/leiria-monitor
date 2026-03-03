package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

const ocorrencias360URL = "https://ocorrencias360-production.up.railway.app/api/historical/all"

var leiriaSet = map[string]bool{
	"Leiria": true, "Pombal": true, "Marinha Grande": true, "Alcobaça": true,
	"Batalha": true, "Porto de Mós": true, "Nazaré": true, "Ansião": true,
	"Alvaiázere": true, "Castanheira de Pera": true, "Figueiró dos Vinhos": true,
	"Pedrógão Grande": true, "Ourém": true, "Caldas da Rainha": true, "Peniche": true,
}

// ingestProciv fetches ProCiv occurrences and upserts them into the DB.
func ingestProciv(ctx context.Context, pool *pgxpool.Pool) (int, error) {
	fetchCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	client := &http.Client{Timeout: 45 * time.Second}
	req, err := http.NewRequestWithContext(fetchCtx, http.MethodGet, ocorrencias360URL, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return 0, fmt.Errorf("ocorrencias360 returned %s", resp.Status)
	}

	var data struct {
		DataByHour map[string][]map[string]any `json:"dataByHour"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, err
	}

	// Find latest hour key
	hours := make([]string, 0, len(data.DataByHour))
	for k := range data.DataByHour {
		hours = append(hours, k)
	}
	if len(hours) == 0 {
		return 0, nil
	}
	sort.Strings(hours)
	latestHour := hours[len(hours)-1]

	allFeatures := data.DataByHour[latestHour]
	q := sqlcdb.New(pool)
	_ = q.DeleteProcivOccurrences(ctx)

	ingested := 0
	for _, feature := range allFeatures {
		props, _ := feature["properties"].(map[string]any)
		if props == nil {
			continue
		}
		municipality, _ := props["Concelho"].(string)
		if !leiriaSet[municipality] {
			continue
		}

		extID := ""
		if id, ok := props["ID_oc"]; ok {
			extID = fmt.Sprintf("%v", id)
		}
		if extID == "" {
			continue
		}

		// Extract geometry
		var lat, lng float32
		if geo, ok := feature["geometry"].(map[string]any); ok {
			if coords, ok := geo["coordinates"].([]any); ok && len(coords) >= 2 {
				lng = float32(anyF64(coords[0]))
				lat = float32(anyF64(coords[1]))
			}
		}

		nature, _ := props["Natureza"].(string)
		state, _ := props["EstadoOcorrencia"].(string)
		startStr, _ := props["DataInicioOcorrencia"].(string)

		params := sqlcdb.UpsertProcivOccurrenceParams{
			ExternalID:     pgtype.Text{String: extID, Valid: true},
			Nature:         pgtype.Text{String: nature, Valid: nature != ""},
			State:          pgtype.Text{String: state, Valid: state != ""},
			Municipality:   pgtype.Text{String: municipality, Valid: municipality != ""},
			Lat:            pgtype.Float4{Float32: lat, Valid: lat != 0 || lng != 0},
			Lng:            pgtype.Float4{Float32: lng, Valid: lat != 0 || lng != 0},
			StartTime:      parseTimestamp(startStr),
			NumMeans:       nullInt4Any(props["MeiosTerrestres"]),
			NumOperatives:  nullInt4Any(props["Operacionais"]),
			NumAerialMeans: nullInt4Any(props["MeiosAereos"]),
		}
		if _, err := q.UpsertProcivOccurrence(ctx, params); err == nil {
			ingested++
		}
	}
	return ingested, nil
}

// anyF64 coerces an any to float64.
func anyF64(v any) float64 {
	if f, ok := v.(float64); ok {
		return f
	}
	return 0
}

// CronProciv handles POST /api/cron/prociv.
func CronProciv(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ingested, err := ingestProciv(r.Context(), pool)
		if err != nil {
			respond(w, http.StatusServiceUnavailable,
				envelope{Success: false, Error: "ProCiv fetch failed: " + err.Error()})
			return
		}
		respond(w, http.StatusOK, map[string]any{
			"success":   true,
			"ingested":  ingested,
			"timestamp": now(),
		})
	}
}
