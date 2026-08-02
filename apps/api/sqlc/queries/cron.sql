-- name: UpsertEredesOutage :one
INSERT INTO eredes_outages (municipality, outage_count, extraction_datetime)
VALUES ($1, $2, $3)
RETURNING id;

-- name: DeleteEredesOutages :exec
DELETE FROM eredes_outages;

-- name: DeleteScheduledWork :exec
DELETE FROM eredes_scheduled_work;

-- name: InsertScheduledWork :one
INSERT INTO eredes_scheduled_work (postal_code, locality, district, municipality, start_time, end_time, reason)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id;

-- name: DeleteIpmaWarnings :exec
DELETE FROM ipma_warnings;

-- name: InsertIpmaWarning :one
INSERT INTO ipma_warnings (area, type, level, level_color, text, start_time, end_time)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id;

-- name: DeleteIpmaForecasts :exec
DELETE FROM ipma_forecasts;

-- name: InsertIpmaForecast :one
INSERT INTO ipma_forecasts (forecast_date, temp_min, temp_max, precip_prob, wind_dir, wind_class, weather_type)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id;

-- name: DeleteProcivOccurrences :exec
DELETE FROM prociv_occurrences;

-- name: UpsertProcivOccurrence :one
INSERT INTO prociv_occurrences (external_id, nature, state, municipality, lat, lng, start_time, num_means, num_operatives, num_aerial_means)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (external_id) DO UPDATE
    SET state            = EXCLUDED.state,
        num_means        = EXCLUDED.num_means,
        num_operatives   = EXCLUDED.num_operatives,
        num_aerial_means = EXCLUDED.num_aerial_means,
        fetched_at       = NOW()
RETURNING id;

-- name: DeleteProcivWarnings :exec
DELETE FROM prociv_warnings;

-- name: InsertProcivWarning :one
INSERT INTO prociv_warnings (title, summary, detail_url)
VALUES ($1, $2, $3)
RETURNING id;

-- name: DeleteSubstationCache :exec
DELETE FROM substation_cache;

-- name: InsertSubstationCache :one
INSERT INTO substation_cache (data) VALUES ($1) RETURNING id, fetched_at;

-- name: DeleteTransformerCache :exec
DELETE FROM transformer_cache;

-- name: InsertTransformerCache :one
INSERT INTO transformer_cache (data) VALUES ($1) RETURNING id, fetched_at;

-- name: DeleteBtPoles :exec
DELETE FROM bt_poles;

-- name: InsertBtPole :one
INSERT INTO bt_poles (lat, lng) VALUES ($1, $2) RETURNING id;
