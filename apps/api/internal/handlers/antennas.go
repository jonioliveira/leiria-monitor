package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

var operatorColors = map[string]string{
	"MEO":      "#00a3e0",
	"NOS":      "#ff6600",
	"Vodafone": "#e60000",
	"DIGI":     "#003087",
}

func Antennas(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := sqlcdb.New(pool)

		rows, err := q.ListAntennas(r.Context())
		if err != nil {
			respond(w, http.StatusInternalServerError, envelope{Success: false, Error: err.Error()})
			return
		}

		type antennaOut struct {
			ID           int32    `json:"id"`
			Lat          float32  `json:"lat"`
			Lng          float32  `json:"lng"`
			Operators    []string `json:"operators"`
			Owner        *string  `json:"owner"`
			Type         string   `json:"type"`
			Technologies []string `json:"technologies"`
		}

		result := make([]antennaOut, 0, len(rows))
		operatorCounts := map[string]int{}
		ownerCounts := map[string]int{}

		for _, a := range rows {
			ao := antennaOut{
				ID:           a.ID,
				Lat:          a.Lat,
				Lng:          a.Lng,
				Operators:    a.Operators,
				Type:         a.Type,
				Technologies: a.Technologies,
			}
			if a.Owner.Valid {
				ao.Owner = &a.Owner.String
			}
			result = append(result, ao)

			for _, op := range a.Operators {
				operatorCounts[op]++
			}
			ownerKey := "Desconhecido"
			if a.Owner.Valid && a.Owner.String != "" {
				ownerKey = a.Owner.String
			}
			ownerCounts[ownerKey]++
		}

		type byOperator struct {
			Operator string `json:"operator"`
			Count    int    `json:"count"`
			Color    string `json:"color"`
		}
		type byOwner struct {
			Owner string `json:"owner"`
			Count int    `json:"count"`
		}

		opList := make([]byOperator, 0, len(operatorCounts))
		for op, cnt := range operatorCounts {
			color, ok := operatorColors[op]
			if !ok {
				color = "#8b5cf6"
			}
			opList = append(opList, byOperator{Operator: op, Count: cnt, Color: color})
		}
		// sort descending by count
		for i := 0; i < len(opList)-1; i++ {
			for j := i + 1; j < len(opList); j++ {
				if opList[j].Count > opList[i].Count {
					opList[i], opList[j] = opList[j], opList[i]
				}
			}
		}

		ownerList := make([]byOwner, 0, len(ownerCounts))
		for owner, cnt := range ownerCounts {
			ownerList = append(ownerList, byOwner{Owner: owner, Count: cnt})
		}
		for i := 0; i < len(ownerList)-1; i++ {
			for j := i + 1; j < len(ownerList); j++ {
				if ownerList[j].Count > ownerList[i].Count {
					ownerList[i], ownerList[j] = ownerList[j], ownerList[i]
				}
			}
		}

		respond(w, http.StatusOK, map[string]any{
			"success":   true,
			"timestamp": now(),
			"antennas":  result,
			"summary": map[string]any{
				"total":       len(result),
				"by_operator": opList,
				"by_owner":    ownerList,
			},
		})
	}
}
