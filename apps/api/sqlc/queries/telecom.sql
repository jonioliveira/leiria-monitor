-- name: GetTelecomCacheEntry :one
SELECT id, data, fetched_at FROM telecom_cache ORDER BY fetched_at DESC LIMIT 1;

-- name: DeleteTelecomCache :exec
DELETE FROM telecom_cache;

-- name: InsertTelecomCache :one
INSERT INTO telecom_cache (data) VALUES ($1) RETURNING id, fetched_at;

-- name: GetSubstationCacheEntry :one
SELECT id, data, fetched_at FROM substation_cache ORDER BY fetched_at DESC LIMIT 1;

-- name: GetTransformerCacheEntry :one
SELECT id, data, fetched_at FROM transformer_cache ORDER BY fetched_at DESC LIMIT 1;
