package handlers

import (
	"encoding/json"
	"net/http"
	"time"
)

const copernicusURL = "https://mapping.emergency.copernicus.eu/activations/api/activations/EMSR861/"

// Copernicus handles GET /api/copernicus.
func Copernicus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		client := &http.Client{Timeout: 10 * time.Second}
		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, copernicusURL, nil)
		if err != nil {
			respond(w, http.StatusInternalServerError, envelope{Success: false, Error: err.Error()})
			return
		}
		resp, err := client.Do(req)
		if err != nil {
			respond(w, http.StatusServiceUnavailable,
				envelope{Success: false, Error: "Copernicus EMS unavailable"})
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			respond(w, http.StatusBadGateway,
				envelope{Success: false, Error: "Copernicus EMS returned " + resp.Status})
			return
		}

		var raw map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
			respond(w, http.StatusBadGateway, envelope{Success: false, Error: "invalid response from Copernicus EMS"})
			return
		}

		// Extract code (fallback to known activation code).
		code := "EMSR861"
		if v, ok := raw["code"].(string); ok && v != "" {
			code = v
		}

		// Extract nullable string fields, trying alternate key names.
		strField := func(keys ...string) *string {
			for _, k := range keys {
				if v, ok := raw[k].(string); ok {
					return &v
				}
			}
			return nil
		}

		// countries: array of objects with short_name/name, or plain strings.
		countries := []string{}
		if arr, ok := raw["countries"].([]any); ok {
			for _, c := range arr {
				switch cv := c.(type) {
				case map[string]any:
					if v, ok := cv["short_name"].(string); ok && v != "" {
						countries = append(countries, v)
					} else if v, ok := cv["name"].(string); ok && v != "" {
						countries = append(countries, v)
					}
				case string:
					if cv != "" {
						countries = append(countries, cv)
					}
				}
			}
		}

		intField := func(key string) int {
			if v, ok := raw[key].(float64); ok {
				return int(v)
			}
			return 0
		}

		activation := map[string]any{
			"code":           code,
			"name":           strField("name"),
			"countries":      countries,
			"activationTime": strField("activationTime", "activation_time"),
			"closed":         raw["closed"],
			"n_aois":         intField("n_aois"),
			"n_products":     intField("n_products"),
			"drmPhase":       strField("drmPhase", "drm_phase"),
			"centroid":       raw["centroid"],
		}

		isActive := raw["closed"] == nil
		status := "unknown"
		if code != "" {
			if isActive {
				status = "warning"
			} else {
				status = "ok"
			}
		}

		respond(w, http.StatusOK, map[string]any{
			"success":    true,
			"timestamp":  now(),
			"source":     "Copernicus Emergency Management Service",
			"source_url": "https://mapping.emergency.copernicus.eu/activations/EMSR861",
			"status":     status,
			"activation": activation,
		})
	}
}
