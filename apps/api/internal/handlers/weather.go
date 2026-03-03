package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

var levelLabels = map[string]string{
	"green":  "Verde",
	"yellow": "Amarelo",
	"orange": "Laranja",
	"red":    "Vermelho",
}

func Weather(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := sqlcdb.New(pool)

		warnings, err := q.ListCurrentWarnings(r.Context())
		if err != nil {
			respond(w, http.StatusInternalServerError, envelope{Success: false, Error: err.Error()})
			return
		}
		forecasts, err := q.ListForecast(r.Context())
		if err != nil {
			respond(w, http.StatusInternalServerError, envelope{Success: false, Error: err.Error()})
			return
		}

		type warningOut struct {
			Area       string  `json:"area"`
			Type       string  `json:"type"`
			Level      string  `json:"level"`
			LevelLabel string  `json:"level_label"`
			LevelColor *string `json:"level_color"`
			Text       *string `json:"text"`
			Start      *string `json:"start"`
			End        *string `json:"end"`
		}
		type forecastOut struct {
			Date             string   `json:"date"`
			TempMin          *float64 `json:"temp_min"`
			TempMax          *float64 `json:"temp_max"`
			PrecipitationProb *float64 `json:"precipitation_prob"`
			WindDirection    *string  `json:"wind_direction"`
			WindClass        *int32   `json:"wind_class"`
			WeatherType      *int32   `json:"weather_type"`
		}

		wOut := make([]warningOut, 0, len(warnings))
		for _, ww := range warnings {
			label, ok := levelLabels[ww.Level]
			if !ok {
				label = ww.Level
			}
			wo := warningOut{
				Area:       ww.Area,
				Type:       ww.Type,
				Level:      ww.Level,
				LevelLabel: label,
			}
			if ww.LevelColor.Valid {
				wo.LevelColor = &ww.LevelColor.String
			}
			if ww.Text.Valid {
				wo.Text = &ww.Text.String
			}
			if ww.StartTime.Valid {
				s := ww.StartTime.Time.UTC().Format("2006-01-02T15:04:05Z07:00")
				wo.Start = &s
			}
			if ww.EndTime.Valid {
				e := ww.EndTime.Time.UTC().Format("2006-01-02T15:04:05Z07:00")
				wo.End = &e
			}
			wOut = append(wOut, wo)
		}

		fOut := make([]forecastOut, 0, len(forecasts))
		for _, f := range forecasts {
			fo := forecastOut{
				Date: f.ForecastDate.Time.Format("2006-01-02"),
			}
			if f.TempMin.Valid {
				v := float64(f.TempMin.Float32); fo.TempMin = &v
			}
			if f.TempMax.Valid {
				v := float64(f.TempMax.Float32); fo.TempMax = &v
			}
			if f.PrecipProb.Valid {
				v := float64(f.PrecipProb.Float32); fo.PrecipitationProb = &v
			}
			if f.WindDir.Valid {
				fo.WindDirection = &f.WindDir.String
			}
			if f.WindClass.Valid {
				v := f.WindClass.Int32; fo.WindClass = &v
			}
			if f.WeatherType.Valid {
				v := f.WeatherType.Int32; fo.WeatherType = &v
			}
			fOut = append(fOut, fo)
		}

		respond(w, http.StatusOK, map[string]any{
			"success":    true,
			"timestamp":  now(),
			"source":     "IPMA — Instituto Português do Mar e da Atmosfera",
			"source_url": "https://api.ipma.pt",
			"warnings":   wOut,
			"forecast":   fOut,
		})
	}
}
