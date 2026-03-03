package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

func Electricity(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := sqlcdb.New(pool)

		outages, err := q.ListEredesOutages(r.Context())
		if err != nil {
			respond(w, http.StatusInternalServerError, envelope{Success: false, Error: err.Error()})
			return
		}
		scheduled, err := q.ListScheduledWork(r.Context())
		if err != nil {
			respond(w, http.StatusInternalServerError, envelope{Success: false, Error: err.Error()})
			return
		}

		var totalOutages int32
		municipalitiesAffected := 0
		var extractionDatetime *string

		type outageRecord struct {
			Municipality       string  `json:"municipality"`
			Count              int32   `json:"count"`
			ExtractionDatetime *string `json:"extraction_datetime"`
		}
		outageRecords := make([]outageRecord, 0, len(outages))
		for _, o := range outages {
			totalOutages += o.OutageCount
			if o.OutageCount > 0 {
				municipalitiesAffected++
			}
			var edt *string
			if o.ExtractionDatetime.Valid {
				edt = &o.ExtractionDatetime.String
				if extractionDatetime == nil {
					extractionDatetime = edt
				}
			}
			outageRecords = append(outageRecords, outageRecord{
				Municipality:       o.Municipality,
				Count:              o.OutageCount,
				ExtractionDatetime: edt,
			})
		}

		type scheduledRecord struct {
			PostalCode   *string `json:"postal_code"`
			Locality     *string `json:"locality"`
			District     *string `json:"district"`
			Municipality *string `json:"municipality"`
			StartTime    *string `json:"start_time"`
			EndTime      *string `json:"end_time"`
			Reason       *string `json:"reason"`
		}
		scheduledRecords := make([]scheduledRecord, 0, len(scheduled))
		for _, s := range scheduled {
			sr := scheduledRecord{}
			if s.PostalCode.Valid   { sr.PostalCode = &s.PostalCode.String }
			if s.Locality.Valid     { sr.Locality = &s.Locality.String }
			if s.District.Valid     { sr.District = &s.District.String }
			if s.Municipality.Valid { sr.Municipality = &s.Municipality.String }
			if s.StartTime.Valid    { sr.StartTime = &s.StartTime.String }
			if s.EndTime.Valid      { sr.EndTime = &s.EndTime.String }
			if s.Reason.Valid       { sr.Reason = &s.Reason.String }
			scheduledRecords = append(scheduledRecords, sr)
		}

		respond(w, http.StatusOK, map[string]any{
			"success":    true,
			"timestamp":  now(),
			"source":     "E-Redes Open Data Portal",
			"source_url": "https://e-redes.opendatasoft.com",
			"national": map[string]any{
				"total_active_outages": totalOutages,
			},
			"leiria": map[string]any{
				"active_outages": map[string]any{
					"total_outage_count":      totalOutages,
					"municipalities_affected": municipalitiesAffected,
					"records":                 outageRecords,
					"extraction_datetime":     extractionDatetime,
				},
				"scheduled_interruptions": map[string]any{
					"total_records": len(scheduledRecords),
					"records":       scheduledRecords,
				},
			},
		})
	}
}
