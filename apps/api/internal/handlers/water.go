package handlers

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

const smasWPAPIURL = "https://smas-leiria.pt/wp-json/wp/v2/posts?categories=13,1&per_page=5&orderby=date&order=desc"

var (
	rWaterTag    = regexp.MustCompile(`<[^>]*>`)
	rWaterSpaces = regexp.MustCompile(`\s+`)
	waterEntities = strings.NewReplacer(
		"&amp;", "&", "&lt;", "<", "&gt;", ">",
		"&quot;", `"`, "&#039;", "'", "&nbsp;", " ",
	)
)

func waterStripHTML(s string) string {
	s = rWaterTag.ReplaceAllString(s, "")
	s = waterEntities.Replace(s)
	return strings.TrimSpace(rWaterSpaces.ReplaceAllString(s, " "))
}

// Water handles GET /api/water.
func Water() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type announcement struct {
			ID      int    `json:"id"`
			Title   string `json:"title"`
			Excerpt string `json:"excerpt"`
			Date    string `json:"date"`
			Link    string `json:"link"`
		}

		var (
			smasReachable    bool
			smasResponseTime *int64
			announcements    = []announcement{}
			wg               sync.WaitGroup
		)

		// SMAS HEAD check (12s timeout).
		wg.Add(1)
		go func() {
			defer wg.Done()
			start := time.Now()
			client := &http.Client{Timeout: 12 * time.Second}
			req, err := http.NewRequestWithContext(r.Context(), http.MethodHead, "https://smas-leiria.pt", nil)
			if err != nil {
				return
			}
			resp, err := client.Do(req)
			if err != nil {
				return
			}
			defer resp.Body.Close()
			ms := time.Since(start).Milliseconds()
			smasReachable = resp.StatusCode < 500
			smasResponseTime = &ms
		}()

		// WordPress posts (8s timeout).
		wg.Add(1)
		go func() {
			defer wg.Done()
			client := &http.Client{Timeout: 8 * time.Second}
			req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, smasWPAPIURL, nil)
			if err != nil {
				return
			}
			resp, err := client.Do(req)
			if err != nil {
				return
			}
			defer resp.Body.Close()
			if resp.StatusCode >= 400 {
				return
			}
			var raw []struct {
				ID      int `json:"id"`
				Title   struct{ Rendered string `json:"rendered"` } `json:"title"`
				Excerpt struct{ Rendered string `json:"rendered"` } `json:"excerpt"`
				Date    string `json:"date"`
				Link    string `json:"link"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
				return
			}
			posts := make([]announcement, 0, len(raw))
			for _, p := range raw {
				posts = append(posts, announcement{
					ID:      p.ID,
					Title:   waterStripHTML(p.Title.Rendered),
					Excerpt: waterStripHTML(p.Excerpt.Rendered),
					Date:    p.Date,
					Link:    p.Link,
				})
			}
			announcements = posts
		}()

		wg.Wait()

		respond(w, http.StatusOK, map[string]any{
			"success":   true,
			"timestamp": now(),
			"source":    "SMAS de Leiria / ERSAR",
			"note":      "Dados de água não disponíveis via API pública. Este endpoint fornece contexto estruturado e verifica a disponibilidade do site do SMAS.",
			"smas_website": map[string]any{
				"reachable":        smasReachable,
				"response_time_ms": smasResponseTime,
				"url":              "https://www.smas-leiria.pt",
			},
			"announcements": announcements,
			"kristin_impact": map[string]any{
				"note": "Após a tempestade Kristin, várias zonas de Leiria tiveram interrupções no abastecimento de água. A ERSAR emitiu recomendações sobre faturação para os concelhos em calamidade.",
				"affected_areas": []string{
					"Zonas altas do concelho de Leiria",
					"Maceira",
					"Arrabal",
					"Parceiros",
					"Marrazes (parcialmente)",
				},
				"dgs_advisory":   "A DGS recomenda não beber água de fontes não ligadas à rede pública e não lavar alimentos com essa água",
				"ersar_advisory": "A ERSAR recomendou medidas excecionais na faturação de água nos concelhos em calamidade",
				"last_updated":   "2026-02-10",
			},
			"contacts": map[string]any{
				"smas_leiria": map[string]any{
					"phone":     "244 839 400",
					"emergency": "800 200 406",
					"address":   "Rua de São Domingos, 2410-156 Leiria",
				},
				"ersar": map[string]any{
					"url": "https://www.ersar.pt",
				},
			},
		})
	}
}
