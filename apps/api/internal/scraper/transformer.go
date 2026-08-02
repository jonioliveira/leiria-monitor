package scraper

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	transformerBase    = "https://e-redes.opendatasoft.com/api/explore/v2.1"
	transformerDataset = "postos-transformacao-distribuicao"
)

// FetchTransformerData fetches PTD (distribution transformer) records for the
// 15 Leiria municipalities and returns JSON bytes matching the frontend shape.
func FetchTransformerData(ctx context.Context) ([]byte, error) {
	client := &http.Client{Timeout: 30 * time.Second}

	// Build IN clause: con_name IN ('Leiria','Pombal',...)
	parts := make([]string, len(leiriaList))
	for i, m := range leiriaList {
		parts[i] = "'" + m + "'"
	}
	where := "con_name IN (" + strings.Join(parts, ",") + ")"

	baseU, _ := url.Parse(transformerBase + "/catalog/datasets/" + transformerDataset + "/records")
	q := baseU.Query()
	q.Set("limit", "100")
	q.Set("where", where)
	q.Set("select", "cod_instalacao,coordenadas_geo,potencia_transformacao_kva,nivel_utilizacao,num_clientes,con_name")
	baseU.RawQuery = q.Encode()

	rows, err := eredesPageAll(ctx, client, baseU.String())
	if err != nil {
		return nil, fmt.Errorf("transformer fetch: %w", err)
	}

	type transformer struct {
		ID           string  `json:"id"`
		Lat          float64 `json:"lat"`
		Lng          float64 `json:"lng"`
		KVA          float64 `json:"kva"`
		Usage        string  `json:"usage"`
		Clients      int     `json:"clients"`
		Municipality string  `json:"municipality"`
	}

	transformers := make([]transformer, 0, len(rows))
	for _, r := range rows {
		geo, ok := r["coordenadas_geo"].(map[string]any)
		if !ok {
			continue
		}
		lat, _ := geo["lat"].(float64)
		lng, _ := geo["lon"].(float64)

		var clients int
		switch v := r["num_clientes"].(type) {
		case string:
			clients, _ = strconv.Atoi(v)
		case float64:
			clients = int(v)
		}

		usage := mapStr(r, "nivel_utilizacao", "N/D")
		if usage == "" {
			usage = "N/D"
		}

		transformers = append(transformers, transformer{
			ID:           mapStr(r, "cod_instalacao", ""),
			Lat:          lat,
			Lng:          lng,
			KVA:          mapFloat(r, "potencia_transformacao_kva"),
			Usage:        usage,
			Clients:      clients,
			Municipality: mapStr(r, "con_name", ""),
		})
	}

	payload := map[string]any{
		"success":      true,
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
		"total":        len(transformers),
		"transformers": transformers,
	}
	return json.Marshal(payload)
}
