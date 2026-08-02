package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jonioliveira/leiria-monitor-api/internal/classify"
	"github.com/jonioliveira/leiria-monitor-api/internal/config"
	"github.com/jonioliveira/leiria-monitor-api/internal/parish"
	"github.com/jonioliveira/leiria-monitor-api/internal/push"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

var validReportTypes = map[string]bool{
	"electricity": true, "telecom_mobile": true, "telecom_fixed": true,
	"water": true, "water_leak": true,
	"roads": true, "roads_tree": true, "roads_damage": true,
	"other_garbage": true, "other": true,
}

type reportOut struct {
	ID            int32   `json:"id"`
	Type          string  `json:"type"`
	Operator      *string `json:"operator"`
	Description   *string `json:"description"`
	Street        *string `json:"street"`
	Parish        *string `json:"parish"`
	Lat           float32 `json:"lat"`
	Lng           float32 `json:"lng"`
	Upvotes       int32   `json:"upvotes"`
	Priority      string  `json:"priority"`
	LastUpvotedAt *string `json:"lastUpvotedAt"`
	ImageUrl      *string `json:"imageUrl"`
	CreatedAt     string  `json:"createdAt"`
}

type hotspot struct {
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
	ReportIDs []int32 `json:"reportIds"`
	Count     int     `json:"count"`
}

// Reports handles GET, POST, PATCH /api/reports.
func Reports(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			reportsGet(w, r, pool)
		case http.MethodPost:
			reportsPost(w, r, pool, cfg)
		case http.MethodPatch:
			reportsPatch(w, r, pool)
		default:
			respond(w, http.StatusMethodNotAllowed, envelope{Success: false, Error: "method not allowed"})
		}
	}
}

func mapReport(r sqlcdb.UserReport) reportOut {
	o := reportOut{
		ID:        r.ID,
		Type:      r.Type,
		Lat:       r.Lat,
		Lng:       r.Lng,
		Upvotes:   r.Upvotes,
		Priority:  r.Priority,
		CreatedAt: r.CreatedAt.Time.UTC().Format(time.RFC3339),
	}
	if r.Operator.Valid    { o.Operator = &r.Operator.String }
	if r.Description.Valid { o.Description = &r.Description.String }
	if r.Street.Valid      { o.Street = &r.Street.String }
	if r.Parish.Valid      { o.Parish = &r.Parish.String }
	if r.ImageUrl.Valid    { o.ImageUrl = &r.ImageUrl.String }
	if r.LastUpvotedAt.Valid {
		s := r.LastUpvotedAt.Time.UTC().Format(time.RFC3339)
		o.LastUpvotedAt = &s
	}
	return o
}

func haversineM(lat1, lng1, lat2, lng2 float64) float64 {
	const R = 6371000
	dLat := (lat2 - lat1) * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func detectHotspots(reports []reportOut) []hotspot {
	cutoff := time.Now().Add(-24 * time.Hour)
	type entry struct {
		id       int32
		lat, lng float64
		t        time.Time
	}
	var recent []entry
	for _, r := range reports {
		t, err := time.Parse(time.RFC3339, r.CreatedAt)
		if err != nil || t.Before(cutoff) {
			continue
		}
		recent = append(recent, entry{id: r.ID, lat: float64(r.Lat), lng: float64(r.Lng), t: t})
	}

	used := make(map[int32]bool)
	var hotspots []hotspot
	for _, seed := range recent {
		if used[seed.id] {
			continue
		}
		var cluster []entry
		for _, r := range recent {
			if !used[r.id] && haversineM(seed.lat, seed.lng, r.lat, r.lng) <= 500 {
				cluster = append(cluster, r)
			}
		}
		if len(cluster) >= 3 {
			var ids []int32
			var sumLat, sumLng float64
			for _, r := range cluster {
				ids = append(ids, r.id)
				used[r.id] = true
				sumLat += r.lat
				sumLng += r.lng
			}
			n := float64(len(cluster))
			hotspots = append(hotspots, hotspot{
				Lat: sumLat / n, Lng: sumLng / n,
				ReportIDs: ids, Count: len(ids),
			})
		}
	}
	if hotspots == nil {
		hotspots = []hotspot{}
	}
	return hotspots
}

// ── GET ───────────────────────────────────────────────────────────────────────

func reportsGet(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool) {
	q := sqlcdb.New(pool)
	rows, err := q.ListActiveReports(r.Context())
	if err != nil {
		respond(w, http.StatusInternalServerError, envelope{Success: false, Error: err.Error()})
		return
	}
	out := make([]reportOut, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapReport(row))
	}
	respond(w, http.StatusOK, map[string]any{
		"success":  true,
		"total":    len(out),
		"reports":  out,
		"hotspots": detectHotspots(out),
	})
}

// ── POST ──────────────────────────────────────────────────────────────────────

type postReportBody struct {
	Type        string   `json:"type"`
	Operator    *string  `json:"operator"`
	Description *string  `json:"description"`
	Street      *string  `json:"street"`
	Lat         *float64 `json:"lat"`
	Lng         *float64 `json:"lng"`
	ImageUrl    *string  `json:"imageUrl"`
}

func reportsPost(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool, cfg *config.Config) {
	if r.ContentLength > 1048576 {
		respond(w, http.StatusRequestEntityTooLarge,
			envelope{Success: false, Error: "Payload demasiado grande (máx. 1 MB)"})
		return
	}

	var body postReportBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respond(w, http.StatusBadRequest, envelope{Success: false, Error: "invalid JSON"})
		return
	}
	if body.Type == "" || body.Lat == nil || body.Lng == nil {
		respond(w, http.StatusBadRequest,
			envelope{Success: false, Error: "Campos obrigatórios: type, lat, lng"})
		return
	}
	if !validReportTypes[body.Type] {
		respond(w, http.StatusBadRequest,
			envelope{Success: false, Error: fmt.Sprintf("Tipo inválido: %s", body.Type)})
		return
	}

	lat, lng := *body.Lat, *body.Lng
	if lat < 39.0 || lat > 40.2 || lng < -9.5 || lng > -8.0 {
		respond(w, http.StatusBadRequest,
			envelope{Success: false, Error: "Coordenadas fora do distrito de Leiria"})
		return
	}

	desc := ""
	if body.Description != nil {
		desc = *body.Description
	}
	street := ""
	if body.Street != nil {
		street = *body.Street
	}

	priority := classify.ClassifyPriority(r.Context(), cfg.AnthropicAPIKey, cfg.FeatureAIPriority, desc, body.Type, street)
	parishName := parish.Resolve(lat, lng)

	// Truncate text to DB column limits
	if len(desc) > 500 {
		desc = desc[:500]
	}
	if len(street) > 200 {
		street = street[:200]
	}

	// Operator only populated for telecom types
	var operatorPtr *string
	if strings.HasPrefix(body.Type, "telecom") {
		operatorPtr = body.Operator
	}

	q := sqlcdb.New(pool)
	inserted, err := q.InsertReport(r.Context(), sqlcdb.InsertReportParams{
		Type:        body.Type,
		Operator:    nullText(operatorPtr),
		Description: nullText(stringPtr(desc)),
		Street:      nullText(stringPtr(street)),
		Parish:      nullText(stringPtr(parishName)),
		Lat:         float32(lat),
		Lng:         float32(lng),
		Priority:    string(priority),
		ImageUrl:    nullText(body.ImageUrl),
	})
	if err != nil {
		respond(w, http.StatusInternalServerError, envelope{Success: false, Error: err.Error()})
		return
	}

	// Send push notifications in background — must not block the response.
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		push.SendToNearby(ctx, pool, push.VAPIDConfig{
			Public:  cfg.VAPIDPublic,
			Private: cfg.VAPIDPrivate,
			Subject: cfg.VAPIDSubject,
		}, push.Report{
			Lat:         lat,
			Lng:         lng,
			Type:        body.Type,
			Description: desc,
			Parish:      parishName,
			Priority:    string(inserted.Priority),
		})
	}()

	respond(w, http.StatusOK, map[string]any{
		"success":  true,
		"id":       inserted.ID,
		"priority": inserted.Priority,
		"parish":   stringPtr(parishName),
	})
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

type patchReportBody struct {
	ID     *int32 `json:"id"`
	Action string `json:"action"`
}

func reportsPatch(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool) {
	var body patchReportBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respond(w, http.StatusBadRequest, envelope{Success: false, Error: "invalid JSON"})
		return
	}
	if body.ID == nil || body.Action == "" {
		respond(w, http.StatusBadRequest,
			envelope{Success: false, Error: "Campos obrigatórios: id, action"})
		return
	}

	q := sqlcdb.New(pool)
	switch body.Action {
	case "upvote":
		newUpvotes, err := q.UpvoteReport(r.Context(), *body.ID)
		if errors.Is(err, pgx.ErrNoRows) {
			respond(w, http.StatusNotFound, envelope{Success: false, Error: "Reporte não encontrado"})
			return
		}
		if err != nil {
			respond(w, http.StatusInternalServerError, envelope{Success: false, Error: err.Error()})
			return
		}
		respond(w, http.StatusOK, map[string]any{"success": true, "upvotes": newUpvotes})
	case "resolve":
		if err := q.ResolveReport(r.Context(), *body.ID); err != nil {
			respond(w, http.StatusInternalServerError, envelope{Success: false, Error: err.Error()})
			return
		}
		respond(w, http.StatusOK, map[string]any{"success": true})
	default:
		respond(w, http.StatusBadRequest,
			envelope{Success: false, Error: "action deve ser 'upvote' ou 'resolve'"})
	}
}
