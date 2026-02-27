-- name: ListActiveReports :many
SELECT *
FROM user_reports
WHERE resolved = FALSE
  AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY
    CASE priority WHEN 'urgente' THEN 0 WHEN 'importante' THEN 1 ELSE 2 END,
    created_at DESC;

-- name: InsertReport :one
INSERT INTO user_reports (type, operator, description, street, parish, lat, lng, priority, last_upvoted_at, image_url)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING id, priority;

-- name: UpvoteReport :one
UPDATE user_reports
SET upvotes = upvotes + 1, last_upvoted_at = NOW()
WHERE id = $1
RETURNING upvotes;

-- name: ResolveReport :exec
UPDATE user_reports
SET resolved = TRUE
WHERE id = $1;

-- name: GetReportByID :one
SELECT * FROM user_reports WHERE id = $1;
