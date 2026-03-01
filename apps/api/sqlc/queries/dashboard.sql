-- name: GetDashboardElectricity :one
SELECT
    COALESCE(SUM(outage_count), 0)::int AS total_outages,
    MAX(fetched_at) AS fetched_at
FROM eredes_outages;

-- name: GetDashboardWeather :many
SELECT id, area, type, level, level_color, text, start_time, end_time, fetched_at
FROM ipma_warnings
WHERE fetched_at >= NOW() - INTERVAL '12 hours'
ORDER BY
    CASE level WHEN 'red' THEN 0 WHEN 'orange' THEN 1 WHEN 'yellow' THEN 2 ELSE 3 END,
    start_time;

-- name: GetDashboardScheduledWork :many
SELECT *
FROM eredes_scheduled_work
WHERE fetched_at >= NOW() - INTERVAL '12 hours'
ORDER BY start_time;

-- name: GetDashboardProcivWarnings :many
SELECT * FROM prociv_warnings
ORDER BY fetched_at DESC
LIMIT 10;

-- name: GetTelecomCache :one
SELECT data, fetched_at FROM telecom_cache ORDER BY fetched_at DESC LIMIT 1;

-- name: GetSubstationCache :one
SELECT data, fetched_at FROM substation_cache ORDER BY fetched_at DESC LIMIT 1;

-- name: GetActiveReportCountByType :many
SELECT type, COUNT(*)::int AS count
FROM user_reports
WHERE resolved = FALSE
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY type;
