-- name: ListEredesOutages :many
SELECT id, municipality, outage_count, extraction_datetime, fetched_at
FROM eredes_outages
ORDER BY municipality;

-- name: ListScheduledWork :many
SELECT id, postal_code, locality, district, municipality, start_time, end_time, reason, fetched_at
FROM eredes_scheduled_work
ORDER BY start_time;
