// Package parish resolves (lat, lng) coordinates to a Portuguese parish name
// using point-in-polygon lookups against the Leiria district GeoJSON.
package parish

import (
	_ "embed"
	"encoding/json"
	"sort"
	"strings"

	"github.com/paulmach/orb"
	"github.com/paulmach/orb/geojson"
	"github.com/paulmach/orb/planar"
)

//go:embed leiria-freguesias.json
var rawGeoJSON []byte

// featureCollection is loaded once at startup.
var fc *geojson.FeatureCollection

func init() {
	fc = &geojson.FeatureCollection{}
	if err := json.Unmarshal(rawGeoJSON, fc); err != nil {
		panic("parish: failed to parse leiria-freguesias.json: " + err.Error())
	}
}

// Resolve returns the parish name for a given coordinate, or an empty string
// if no polygon matches (e.g. the point is outside the Leiria district).
func Resolve(lat, lng float64) string {
	pt := orb.Point{lng, lat} // orb uses [lng, lat] order
	for _, f := range fc.Features {
		if containsPoint(f.Geometry, pt) {
			return extractName(f)
		}
	}
	return ""
}

func containsPoint(g orb.Geometry, pt orb.Point) bool {
	switch geo := g.(type) {
	case orb.Polygon:
		return planar.PolygonContains(geo, pt)
	case orb.MultiPolygon:
		for _, poly := range geo {
			if planar.PolygonContains(poly, pt) {
				return true
			}
		}
	}
	return false
}

// GetAllConcelhos returns a deduplicated, sorted list of all concelhos in the district.
func GetAllConcelhos() []string {
	seen := make(map[string]bool)
	var out []string
	for _, f := range fc.Features {
		if v, ok := f.Properties["Concelho"]; ok {
			if s, ok := v.(string); ok && s != "" && !seen[s] {
				s = strings.TrimSpace(s)
				seen[s] = true
				out = append(out, s)
			}
		}
	}
	sort.Strings(out)
	return out
}

// GetParishesByConcelho returns all parish names for a given concelho.
func GetParishesByConcelho(concelho string) []string {
	upper := strings.ToUpper(strings.TrimSpace(concelho))
	var out []string
	for _, f := range fc.Features {
		if v, ok := f.Properties["Concelho"]; ok {
			if s, ok := v.(string); ok && strings.ToUpper(strings.TrimSpace(s)) == upper {
				if name := extractName(f); name != "" {
					out = append(out, name)
				}
			}
		}
	}
	sort.Strings(out)
	return out
}

// ParishConcelhoMap builds a map of uppercase parish name → concelho name.
// Used by the dashboard handler to map user reports → concelhos.
func ParishConcelhoMap() map[string]string {
	m := make(map[string]string)
	for _, f := range fc.Features {
		concelho, ok1 := f.Properties["Concelho"].(string)
		if !ok1 || concelho == "" {
			continue
		}
		name := extractName(f)
		if name != "" {
			m[strings.ToUpper(strings.TrimSpace(name))] = strings.TrimSpace(concelho)
		}
	}
	return m
}

func extractName(f *geojson.Feature) string {
	// GeoJSON properties may use "Freguesia", "NAME_4", "name", etc.
	for _, key := range []string{"Freguesia", "NAME_4", "name", "NOME"} {
		if v, ok := f.Properties[key]; ok {
			if s, ok := v.(string); ok && s != "" {
				return strings.TrimSpace(s)
			}
		}
	}
	return ""
}
