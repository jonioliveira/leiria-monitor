package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

func Occurrences(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := sqlcdb.New(pool)

		rows, err := q.ListOccurrences(r.Context())
		if err != nil {
			respond(w, http.StatusInternalServerError, envelope{Success: false, Error: err.Error()})
			return
		}

		type coords struct {
			Lat float64 `json:"lat"`
			Lng float64 `json:"lng"`
		}
		type occurrenceOut struct {
			ID              int32   `json:"id"`
			ExternalID      *string `json:"externalId"`
			Nature          *string `json:"nature"`
			State           *string `json:"state"`
			Municipality    *string `json:"municipality"`
			Coordinates     *coords `json:"coordinates"`
			StartTime       *string `json:"startTime"`
			NumMeans        *int32  `json:"numMeans"`
			NumOperatives   *int32  `json:"numOperatives"`
			NumAerialMeans  *int32  `json:"numAerialMeans"`
			FetchedAt       string  `json:"fetchedAt"`
		}

		out := make([]occurrenceOut, 0, len(rows))
		for _, o := range rows {
			oo := occurrenceOut{
				ID:        o.ID,
				FetchedAt: o.FetchedAt.Time.UTC().Format("2006-01-02T15:04:05Z07:00"),
			}
			if o.ExternalID.Valid    { oo.ExternalID = &o.ExternalID.String }
			if o.Nature.Valid        { oo.Nature = &o.Nature.String }
			if o.State.Valid         { oo.State = &o.State.String }
			if o.Municipality.Valid  { oo.Municipality = &o.Municipality.String }
			if o.Lat.Valid && o.Lng.Valid {
				oo.Coordinates = &coords{Lat: float64(o.Lat.Float32), Lng: float64(o.Lng.Float32)}
			}
			if o.StartTime.Valid     {
				s := o.StartTime.Time.UTC().Format("2006-01-02T15:04:05Z07:00")
				oo.StartTime = &s
			}
			if o.NumMeans.Valid      { oo.NumMeans = &o.NumMeans.Int32 }
			if o.NumOperatives.Valid { oo.NumOperatives = &o.NumOperatives.Int32 }
			if o.NumAerialMeans.Valid { oo.NumAerialMeans = &o.NumAerialMeans.Int32 }
			out = append(out, oo)
		}

		respond(w, http.StatusOK, map[string]any{
			"success":     true,
			"timestamp":   now(),
			"source":      "ANEPC — Autoridade Nacional de Emergência e Proteção Civil",
			"total":       len(out),
			"occurrences": out,
		})
	}
}
