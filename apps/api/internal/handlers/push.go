package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

func PushSubscribe(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			pushSubscribePost(w, r, pool)
		case http.MethodDelete:
			pushSubscribeDelete(w, r, pool)
		default:
			respond(w, http.StatusMethodNotAllowed, envelope{Success: false, Error: "method not allowed"})
		}
	}
}

type pushSubscribeBody struct {
	Subscription struct {
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
	} `json:"subscription"`
	Lat *float64 `json:"lat"`
	Lng *float64 `json:"lng"`
}

func pushSubscribePost(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool) {
	var body pushSubscribeBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respond(w, http.StatusBadRequest, envelope{Success: false, Error: "invalid JSON"})
		return
	}

	if body.Subscription.Endpoint == "" ||
		body.Subscription.Keys.P256dh == "" ||
		body.Subscription.Keys.Auth == "" {
		respond(w, http.StatusBadRequest, envelope{Success: false, Error: "Subscrição inválida"})
		return
	}

	q := sqlcdb.New(pool)
	var lat, lng *float64
	if body.Lat != nil && body.Lng != nil {
		lat = body.Lat
		lng = body.Lng
	}

	_, err := q.InsertPushSubscription(r.Context(), sqlcdb.InsertPushSubscriptionParams{
		Endpoint: body.Subscription.Endpoint,
		P256dh:   body.Subscription.Keys.P256dh,
		Auth:     body.Subscription.Keys.Auth,
		Lat:      nullFloat64(lat),
		Lng:      nullFloat64(lng),
	})
	if err != nil {
		respond(w, http.StatusInternalServerError, envelope{Success: false, Error: err.Error()})
		return
	}

	respond(w, http.StatusOK, map[string]any{"success": true})
}

type pushDeleteBody struct {
	Endpoint string `json:"endpoint"`
}

func pushSubscribeDelete(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool) {
	var body pushDeleteBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respond(w, http.StatusBadRequest, envelope{Success: false, Error: "invalid JSON"})
		return
	}
	if body.Endpoint == "" {
		respond(w, http.StatusBadRequest, envelope{Success: false, Error: "endpoint obrigatório"})
		return
	}

	q := sqlcdb.New(pool)
	if err := q.DeletePushSubscription(r.Context(), body.Endpoint); err != nil {
		respond(w, http.StatusInternalServerError, envelope{Success: false, Error: err.Error()})
		return
	}

	respond(w, http.StatusOK, map[string]any{"success": true})
}
