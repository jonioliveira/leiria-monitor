-- name: ListEredesOutages :many
SELECT id, municipality, outage_count, extraction_datetime, fetched_at
FROM eredes_outages
ORDER BY municipality;

-- name: ListScheduledWork :many
SELECT id, postal_code, locality, district, municipality, start_time, end_time, reason, fetched_at
FROM eredes_scheduled_work
ORDER BY start_time;

-- name: ListPolesInBbox :many
SELECT id, lat, lng FROM bt_poles
WHERE lat BETWEEN $1 AND $2
  AND lng BETWEEN $3 AND $4
LIMIT 10000;
