// Package push sends VAPID web-push notifications to nearby subscribers.
package push

import (
	"context"
	"encoding/json"
	"log/slog"
	"math"

	"github.com/SherClockHolmes/webpush-go"
	"github.com/jackc/pgx/v5/pgxpool"
)

const radiusKm = 15

var typeLabels = map[string]string{
	"electricity":   "Sem electricidade",
	"telecom_mobile": "Rede móvel em baixo",
	"telecom_fixed":  "Rede fixa em baixo",
	"water":          "Sem água",
	"water_leak":     "Rotura de água",
	"roads":          "Estrada cortada",
	"roads_tree":     "Árvore na estrada",
	"roads_damage":   "Dano na estrada",
	"other_garbage":  "Lixo / entulho",
	"other":          "Outro problema",
}

type Report struct {
	Lat         float64
	Lng         float64
	Type        string
	Description string
	Parish      string
	Priority    string
}

type VAPIDConfig struct {
	Public  string
	Private string
	Subject string
}

type subscription struct {
	ID       int
	Endpoint string
	P256dh   string
	Auth     string
	Lat      *float64
	Lng      *float64
}

func haversineKm(lat1, lng1, lat2, lng2 float64) float64 {
	const R = 6371
	dLat := (lat2 - lat1) * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// SendToNearby sends a push notification for the given report to all
// subscribers within radiusKm, plus all subscribers with no coordinates
// (global opt-in). Only sends for "urgente" priority.
func SendToNearby(ctx context.Context, pool *pgxpool.Pool, vapid VAPIDConfig, report Report) {
	if report.Priority != "urgente" {
		return
	}

	subs, err := loadSubscriptions(ctx, pool)
	if err != nil {
		slog.Error("push: failed to load subscriptions", "err", err)
		return
	}

	label, ok := typeLabels[report.Type]
	if !ok {
		label = "Problema reportado"
	}
	location := report.Parish
	if location == "" {
		location = "Leiria"
	}
	body := label
	if report.Description != "" {
		desc := report.Description
		if len(desc) > 100 {
			desc = desc[:100]
		}
		body = label + ": " + desc
	}

	payload, _ := json.Marshal(map[string]string{
		"title": "Alerta urgente — " + location,
		"body":  body,
		"url":   "/map",
		"icon":  "/icon-192.png",
		"badge": "/icon-96.png",
	})

	var dead []int
	for _, sub := range subs {
		// Skip nearby-only subs that are out of range
		if sub.Lat != nil && sub.Lng != nil {
			if haversineKm(report.Lat, report.Lng, *sub.Lat, *sub.Lng) > radiusKm {
				continue
			}
		}

		_, err := webpush.SendNotification(payload, &webpush.Subscription{
			Endpoint: sub.Endpoint,
			Keys: webpush.Keys{
				P256dh: sub.P256dh,
				Auth:   sub.Auth,
			},
		}, &webpush.Options{
			VAPIDPublicKey:  vapid.Public,
			VAPIDPrivateKey: vapid.Private,
			Subscriber:      vapid.Subject,
		})
		if err != nil {
			if isExpired(err) {
				dead = append(dead, sub.ID)
			} else {
				slog.Warn("push: send failed", "endpoint", sub.Endpoint[:20], "err", err)
			}
		}
	}

	if len(dead) > 0 {
		deleteDeadSubscriptions(ctx, pool, dead)
	}
}

func loadSubscriptions(ctx context.Context, pool *pgxpool.Pool) ([]subscription, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, endpoint, p256dh, auth, lat, lng
		FROM push_subscriptions
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subs []subscription
	for rows.Next() {
		var s subscription
		if err := rows.Scan(&s.ID, &s.Endpoint, &s.P256dh, &s.Auth, &s.Lat, &s.Lng); err != nil {
			return nil, err
		}
		subs = append(subs, s)
	}
	return subs, rows.Err()
}

func deleteDeadSubscriptions(ctx context.Context, pool *pgxpool.Pool, ids []int) {
	_, err := pool.Exec(ctx, `DELETE FROM push_subscriptions WHERE id = ANY($1)`, ids)
	if err != nil {
		slog.Error("push: failed to delete dead subscriptions", "err", err)
	}
}

// isExpired checks if a webpush error indicates the subscription is gone.
func isExpired(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return contains(msg, "410") || contains(msg, "404")
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsStr(s, sub))
}

func containsStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
