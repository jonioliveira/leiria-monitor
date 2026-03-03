-- name: ListOccurrences :many
SELECT id, external_id, nature, state, municipality, lat, lng, start_time, num_means, num_operatives, num_aerial_means, fetched_at
FROM prociv_occurrences
WHERE fetched_at >= NOW() - INTERVAL '12 hours'
ORDER BY start_time DESC;

-- name: ListProcivWarnings :many
SELECT id, title, summary, detail_url, fetched_at
FROM prociv_warnings
ORDER BY fetched_at DESC
LIMIT 20;
