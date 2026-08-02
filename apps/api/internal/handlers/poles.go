package handlers

import (
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

func Poles(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		minLat, errA := strconv.ParseFloat(q.Get("minLat"), 64)
		maxLat, errB := strconv.ParseFloat(q.Get("maxLat"), 64)
		minLng, errC := strconv.ParseFloat(q.Get("minLng"), 64)
		maxLng, errD := strconv.ParseFloat(q.Get("maxLng"), 64)

		if errA != nil || errB != nil || errC != nil || errD != nil {
			respond(w, http.StatusBadRequest, envelope{
				Success: false,
				Error:   "Missing or invalid bbox params: minLat, maxLat, minLng, maxLng",
			})
			return
		}

		db := sqlcdb.New(pool)
		rows, err := db.ListPolesInBbox(r.Context(), sqlcdb.ListPolesInBboxParams{
			Lat:   float32(minLat),
			Lat_2: float32(maxLat),
			Lng:   float32(minLng),
			Lng_2: float32(maxLng),
		})
		if err != nil {
			respond(w, http.StatusInternalServerError, envelope{Success: false, Error: err.Error()})
			return
		}

		type poleOut struct {
			ID  int32   `json:"id"`
			Lat float32 `json:"lat"`
			Lng float32 `json:"lng"`
		}
		out := make([]poleOut, 0, len(rows))
		for _, p := range rows {
			out = append(out, poleOut{ID: p.ID, Lat: p.Lat, Lng: p.Lng})
		}

		respond(w, http.StatusOK, map[string]any{
			"success":   true,
			"timestamp": now(),
			"total":     len(out),
			"poles":     out,
		})
	}
}
