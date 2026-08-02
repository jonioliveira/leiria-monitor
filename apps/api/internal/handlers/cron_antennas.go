package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

const antennaGeoJSONBase = "https://raw.githubusercontent.com/avataranedotas/antenas_mobile/main"

var antennaFiles = []struct {
	file     string
	operator string
}{
	{"meo.geojson", "MEO"},
	{"nos.geojson", "NOS"},
	{"vdf.geojson", "Vodafone"},
	{"digi.geojson", "DIGI"},
}

var (
	antennaBBox = struct{ latMin, latMax, lngMin, lngMax float64 }{39.15, 40.05, -9.45, -8.1}
	reOpSplit   = regexp.MustCompile(`[;,/]`)
)

func normalizeOp(s string) string {
	s = strings.TrimSpace(s)
	// Remove trailing " P" suffix (e.g. "MEO P" → "MEO")
	if len(s) >= 2 && strings.ToUpper(s[len(s)-2:]) == " P" {
		s = s[:len(s)-2]
	}
	switch strings.ToLower(s) {
	case "vodafone":
		return "Vodafone"
	case "meo":
		return "MEO"
	case "nos":
		return "NOS"
	case "digi":
		return "DIGI"
	}
	return s
}

func detectAntennaTeches(props map[string]any) []string {
	freq, _ := props["frequency"].(string)
	var techs []string
	if props["communication:gsm"] == "yes" || strings.Contains(freq, "900") || strings.Contains(freq, "1800") {
		techs = append(techs, "2G")
	}
	if props["communication:umts"] == "yes" || strings.Contains(freq, "2100") {
		techs = append(techs, "3G")
	}
	if props["communication:lte"] == "yes" || strings.Contains(freq, "800") || strings.Contains(freq, "2600") {
		techs = append(techs, "4G")
	}
	if props["communication:nr"] == "yes" || strings.Contains(freq, "3500") || strings.Contains(freq, "700") {
		techs = append(techs, "5G")
	}
	if len(techs) == 0 && props["communication:mobile_phone"] == "yes" {
		techs = append(techs, "Móvel")
	}
	return techs
}

type antennaGroup struct {
	lat         float64
	lng         float64
	operators   map[string]bool
	owner       string
	antennaType string
	techs       map[string]bool
}

// ingestAntennas fetches 4 GeoJSON files from GitHub and inserts grouped antenna records.
func ingestAntennas(ctx context.Context, pool *pgxpool.Pool) (int, error) {
	type fileResult struct {
		features []map[string]any
		operator string
	}

	results := make([]fileResult, len(antennaFiles))
	var wg sync.WaitGroup
	wg.Add(len(antennaFiles))
	for i, af := range antennaFiles {
		i, af := i, af
		go func() {
			defer wg.Done()
			fetchCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()
			client := &http.Client{Timeout: 30 * time.Second}
			req, err := http.NewRequestWithContext(fetchCtx, http.MethodGet,
				antennaGeoJSONBase+"/"+af.file, nil)
			if err != nil {
				return
			}
			resp, err := client.Do(req)
			if err != nil || resp.StatusCode >= 400 {
				if resp != nil {
					resp.Body.Close()
				}
				return
			}
			defer resp.Body.Close()
			var gc struct {
				Features []map[string]any `json:"features"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&gc); err != nil {
				return
			}
			results[i] = fileResult{gc.Features, af.operator}
		}()
	}
	wg.Wait()

	grouped := make(map[string]*antennaGroup)
	for _, res := range results {
		for _, f := range res.features {
			geo, ok := f["geometry"].(map[string]any)
			if !ok {
				continue
			}
			gtype, _ := geo["type"].(string)
			if gtype != "Point" {
				continue
			}
			coords, ok := geo["coordinates"].([]any)
			if !ok || len(coords) < 2 {
				continue
			}
			lng := anyF64(coords[0])
			lat := anyF64(coords[1])
			bb := antennaBBox
			if lat < bb.latMin || lat > bb.latMax || lng < bb.lngMin || lng > bb.lngMax {
				continue
			}

			key := fmt.Sprintf("%.6f,%.6f", lat, lng)
			props, _ := f["properties"].(map[string]any)
			if props == nil {
				props = map[string]any{}
			}

			var ops []string
			if opStr, ok := props["operator"].(string); ok && opStr != "" {
				for _, p := range reOpSplit.Split(opStr, -1) {
					if o := normalizeOp(p); o != "" {
						ops = append(ops, o)
					}
				}
			}
			if len(ops) == 0 {
				ops = []string{res.operator}
			}

			techs := detectAntennaTeches(props)
			owner, _ := props["owner"].(string)
			manMade, _ := props["man_made"].(string)
			atype := "other"
			switch manMade {
			case "mast":
				atype = "mast"
			case "tower":
				atype = "tower"
			}

			if g, exists := grouped[key]; exists {
				for _, o := range ops {
					g.operators[o] = true
				}
				for _, t := range techs {
					g.techs[t] = true
				}
				if owner != "" && g.owner == "" {
					g.owner = owner
				}
			} else {
				g := &antennaGroup{
					lat: lat, lng: lng,
					operators:   make(map[string]bool),
					owner:       owner,
					antennaType: atype,
					techs:       make(map[string]bool),
				}
				for _, o := range ops {
					g.operators[o] = true
				}
				for _, t := range techs {
					g.techs[t] = true
				}
				grouped[key] = g
			}
		}
	}

	q := sqlcdb.New(pool)
	_ = q.DeleteAntennas(ctx)

	ingested := 0
	for _, g := range grouped {
		ops := make([]string, 0, len(g.operators))
		for o := range g.operators {
			ops = append(ops, o)
		}
		ts := make([]string, 0, len(g.techs))
		for t := range g.techs {
			ts = append(ts, t)
		}
		params := sqlcdb.InsertAntennaParams{
			Lat:          float32(g.lat),
			Lng:          float32(g.lng),
			Operators:    ops,
			Owner:        pgtype.Text{String: g.owner, Valid: g.owner != ""},
			Type:         g.antennaType,
			Technologies: ts,
		}
		if _, err := q.InsertAntenna(ctx, params); err == nil {
			ingested++
		}
	}
	return ingested, nil
}

// CronAntennas handles POST /api/cron/antennas.
func CronAntennas(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ingested, err := ingestAntennas(r.Context(), pool)
		if err != nil {
			respond(w, http.StatusServiceUnavailable,
				envelope{Success: false, Error: "antenna ingest failed: " + err.Error()})
			return
		}
		respond(w, http.StatusOK, map[string]any{
			"success":   true,
			"ingested":  ingested,
			"timestamp": now(),
		})
	}
}
