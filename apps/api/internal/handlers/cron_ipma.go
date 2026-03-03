package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

const (
	ipmaWarningsURL = "https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json"
	ipmaForecastURL = "https://api.ipma.pt/open-data/forecast/meteorology/cities/daily"
	ipmaLeiriaCityID = 1100900
	ipmaLeiriaAreaID = "LRA"
)

var awarenessTypes = map[string]string{
	"1": "Vento", "2": "Chuva", "3": "Neve", "4": "Trovoada",
	"5": "Nevoeiro", "6": "Frio extremo", "7": "Calor extremo",
	"8": "Ondas costeiras", "9": "Incêndios", "10": "Precipitação",
	"11": "Agitação marítima",
}

var awarenessLevelColors = map[string]string{
	"green": "#10b981", "yellow": "#f59e0b", "orange": "#f97316", "red": "#ef4444",
}

// ingestIPMA fetches IPMA warnings and forecasts, writes to DB.
// Returns (warningCount, forecastCount, error).
func ingestIPMA(ctx context.Context, pool *pgxpool.Pool) (int, int, error) {
	client := &http.Client{Timeout: 20 * time.Second}

	var (
		warningsBody []byte
		forecastBody []byte
		wg           sync.WaitGroup
	)

	wg.Add(2)
	go func() {
		defer wg.Done()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, ipmaWarningsURL, nil)
		if err != nil {
			return
		}
		resp, err := client.Do(req)
		if err != nil || resp.StatusCode >= 400 {
			if resp != nil {
				resp.Body.Close()
			}
			return
		}
		defer resp.Body.Close()
		var buf []byte
		buf = make([]byte, 0, 1<<16)
		tmp := make([]byte, 4096)
		for {
			n, err := resp.Body.Read(tmp)
			buf = append(buf, tmp[:n]...)
			if err != nil {
				break
			}
		}
		warningsBody = buf
	}()
	go func() {
		defer wg.Done()
		url := ipmaForecastURL + "/1100900.json"
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return
		}
		resp, err := client.Do(req)
		if err != nil || resp.StatusCode >= 400 {
			if resp != nil {
				resp.Body.Close()
			}
			return
		}
		defer resp.Body.Close()
		buf := make([]byte, 0, 1<<16)
		tmp := make([]byte, 4096)
		for {
			n, err := resp.Body.Read(tmp)
			buf = append(buf, tmp[:n]...)
			if err != nil {
				break
			}
		}
		forecastBody = buf
	}()
	wg.Wait()

	q := sqlcdb.New(pool)
	warnCount, forecastCount := 0, 0

	// ── Warnings ──────────────────────────────────────────────────────────────
	if len(warningsBody) > 0 {
		var all []map[string]any
		if err := json.Unmarshal(warningsBody, &all); err == nil {
			var leiriaWarnings []map[string]any
			for _, w := range all {
				area, _ := w["idAreaAviso"].(string)
				if area == ipmaLeiriaAreaID || area == "PTC" {
					leiriaWarnings = append(leiriaWarnings, w)
				}
			}
			_ = q.DeleteIpmaWarnings(ctx)
			for _, w := range leiriaWarnings {
				area, _ := w["idAreaAviso"].(string)
				if area == "" {
					area = "unknown"
				}
				typeName := ""
				if tn, ok := w["awarenessTypeName"].(string); ok {
					typeName = awarenessTypes[tn]
					if typeName == "" {
						typeName = tn
					}
				}
				if typeName == "" {
					typeName = "unknown"
				}
				level := "green"
				if lv, ok := w["awarenessLevelID"].(string); ok && lv != "" {
					level = lv
				}
				color := awarenessLevelColors[level]
				if color == "" {
					color = "#94a3b8"
				}
				startStr, _ := w["startTime"].(string)
				endStr, _ := w["endTime"].(string)
				textStr2 := ""
				if t, ok := w["text"].(string); ok {
					textStr2 = t
				}
				params := sqlcdb.InsertIpmaWarningParams{
					Area:       area,
					Type:       typeName,
					Level:      level,
					LevelColor: pgtype.Text{String: color, Valid: true},
					Text:       pgtype.Text{String: textStr2, Valid: textStr2 != ""},
					StartTime:  parseTimestamp(startStr),
					EndTime:    parseTimestamp(endStr),
				}
				if _, err := q.InsertIpmaWarning(ctx, params); err == nil {
					warnCount++
				}
			}
		}
	}

	// ── Forecasts ─────────────────────────────────────────────────────────────
	if len(forecastBody) > 0 {
		var fc struct {
			Data []map[string]any `json:"data"`
		}
		if err := json.Unmarshal(forecastBody, &fc); err == nil {
			days := fc.Data
			if len(days) > 5 {
				days = days[:5]
			}
			_ = q.DeleteIpmaForecasts(ctx)
			for _, d := range days {
				dateStr, _ := d["forecastDate"].(string)
				if dateStr == "" {
					continue
				}
				t, err := time.Parse("2006-01-02", dateStr)
				forecastDate := pgtype.Date{}
				if err == nil {
					forecastDate = pgtype.Date{Time: t, Valid: true}
				}
				tMinStr := ""
				if v, ok := d["tMin"].(string); ok {
					tMinStr = v
				}
				tMaxStr := ""
				if v, ok := d["tMax"].(string); ok {
					tMaxStr = v
				}
				precipStr := ""
				if v, ok := d["precipitaProb"].(string); ok {
					precipStr = v
				}
				windDir := ""
				if v, ok := d["predWindDir"].(string); ok {
					windDir = v
				}
				params := sqlcdb.InsertIpmaForecastParams{
					ForecastDate: forecastDate,
					TempMin:      parseFloat4Str(tMinStr),
					TempMax:      parseFloat4Str(tMaxStr),
					PrecipProb:   parseFloat4Str(precipStr),
					WindDir:      pgtype.Text{String: windDir, Valid: windDir != ""},
					WindClass:    nullInt4Any(d["classWindSpeed"]),
					WeatherType:  nullInt4Any(d["idWeatherType"]),
				}
				if _, err := q.InsertIpmaForecast(ctx, params); err == nil {
					forecastCount++
				}
			}
		}
	}

	return warnCount, forecastCount, nil
}

// CronIPMA handles POST /api/cron/ipma.
func CronIPMA(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		warnCount, forecastCount, err := ingestIPMA(r.Context(), pool)
		if err != nil {
			respond(w, http.StatusServiceUnavailable,
				envelope{Success: false, Error: "IPMA fetch failed: " + err.Error()})
			return
		}
		respond(w, http.StatusOK, map[string]any{
			"success":   true,
			"ingested":  map[string]int{"warnings": warnCount, "forecasts": forecastCount},
			"timestamp": now(),
		})
	}
}
