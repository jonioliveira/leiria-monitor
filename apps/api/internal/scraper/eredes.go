// Package scraper — shared E-Redes OpenDataSoft helpers.
package scraper

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

// leiriaList contains the 15 Leiria-district municipalities used as filters.
var leiriaList = []string{
	"Leiria", "Pombal", "Marinha Grande", "Alcobaça", "Batalha",
	"Porto de Mós", "Nazaré", "Ansião", "Alvaiázere", "Castanheira de Pera",
	"Figueiró dos Vinhos", "Pedrógão Grande", "Ourém", "Caldas da Rainha", "Peniche",
}

// eredesPageAll fetches every page from an OpenDataSoft records endpoint.
// rawURL must already include limit=100 and other query params.
func eredesPageAll(ctx context.Context, client *http.Client, rawURL string) ([]map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("E-Redes API returned %s", resp.Status)
	}
	var first struct {
		TotalCount int              `json:"total_count"`
		Results    []map[string]any `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&first); err != nil {
		return nil, err
	}
	all := append([]map[string]any{}, first.Results...)

	base, err := url.Parse(rawURL)
	if err != nil {
		return all, nil
	}
	pageSize := 100
	for offset := pageSize; offset < min(first.TotalCount, 10000); offset += pageSize {
		q := base.Query()
		q.Set("offset", fmt.Sprintf("%d", offset))
		base.RawQuery = q.Encode()
		req2, _ := http.NewRequestWithContext(ctx, http.MethodGet, base.String(), nil)
		resp2, err2 := client.Do(req2)
		if err2 != nil {
			continue
		}
		var page struct {
			Results []map[string]any `json:"results"`
		}
		if resp2.StatusCode < 400 {
			_ = json.NewDecoder(resp2.Body).Decode(&page)
			all = append(all, page.Results...)
		}
		resp2.Body.Close()
	}
	return all, nil
}

// eredesJSON fetches a single URL and returns the parsed JSON object.
func eredesJSON(ctx context.Context, client *http.Client, rawURL string) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}

// mapStr extracts a string from a JSON map; returns fallback if absent.
func mapStr(m map[string]any, key, fallback string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return fallback
}

// mapFloat extracts a float64 from a JSON map.
func mapFloat(m map[string]any, key string) float64 {
	if v, ok := m[key]; ok {
		if f, ok := v.(float64); ok {
			return f
		}
	}
	return 0
}

// mapSlice extracts a []any from a JSON map.
func mapSlice(m map[string]any, key string) []any {
	if v, ok := m[key]; ok {
		if s, ok := v.([]any); ok {
			return s
		}
	}
	return nil
}

// anyFloat coerces an any JSON value to float64.
func anyFloat(v any) float64 {
	if f, ok := v.(float64); ok {
		return f
	}
	return 0
}
