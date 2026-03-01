// Package parish resolves (lat, lng) coordinates to a Portuguese parish name
// using point-in-polygon lookups against the Leiria district GeoJSON.
package parish

import (
	_ "embed"
	"encoding/json"
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
