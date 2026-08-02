-- name: ListAntennas :many
SELECT id, lat, lng, operators, owner, type, technologies, fetched_at
FROM antennas
ORDER BY id;

-- name: DeleteAntennas :exec
DELETE FROM antennas;

-- name: InsertAntenna :one
INSERT INTO antennas (lat, lng, operators, owner, type, technologies)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id;
