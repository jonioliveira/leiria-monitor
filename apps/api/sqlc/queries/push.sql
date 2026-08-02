-- name: InsertPushSubscription :one
INSERT INTO push_subscriptions (endpoint, p256dh, auth, lat, lng)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (endpoint) DO UPDATE
    SET p256dh = EXCLUDED.p256dh,
        auth   = EXCLUDED.auth,
        lat    = EXCLUDED.lat,
        lng    = EXCLUDED.lng
RETURNING id;

-- name: DeletePushSubscription :exec
DELETE FROM push_subscriptions WHERE endpoint = $1;

-- name: ListPushSubscriptions :many
SELECT id, endpoint, p256dh, auth, lat, lng, created_at
FROM push_subscriptions;
