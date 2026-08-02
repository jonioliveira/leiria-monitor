package handlers

import (
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

var rRecoveryTitle = regexp.MustCompile(`(?i)<title[^>]*>([\s\S]*?)</title>`)

type platformDef struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	URL         string `json:"url"`
	Entity      string `json:"entity"`
}

type platformResult struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Description    string  `json:"description"`
	URL            string  `json:"url"`
	Entity         string  `json:"entity"`
	Reachable      bool    `json:"reachable"`
	ResponseTimeMS *int64  `json:"response_time_ms"`
	CheckedAt      string  `json:"checked_at"`
}

type supportItem struct {
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Platform     string   `json:"platform"`
	URL          *string  `json:"url"`
	DocsRequired []string `json:"docs_required"`
}

type supportArea struct {
	ID       string        `json:"id"`
	Title    string        `json:"title"`
	Icon     string        `json:"icon"`
	Supports []supportItem `json:"supports"`
}

var recoveryPlatforms = []platformDef{
	{
		ID:          "estragos",
		Name:        "Estragos.pt",
		Description: "Registo de danos — habitações e empresas",
		URL:         "https://estragos.pt",
		Entity:      "Câmara Municipal de Leiria",
	},
	{
		ID:          "ccdrc",
		Name:        "CCDR Centro — Tempestades 2026",
		Description: "Candidaturas a apoios até 10.000€",
		URL:         "https://www.ccdrc.pt/pt/areas-de-atuacao/administracao-local/apoio-tecnico-e-financeiro/tempestades-2026/",
		Entity:      "CCDR Centro",
	},
	{
		ID:          "bpf",
		Name:        "Banco de Fomento — Linhas de Crédito",
		Description: "Linhas de crédito de emergência para empresas",
		URL:         "https://www.bfrm.pt",
		Entity:      "Banco Português de Fomento",
	},
	{
		ID:          "pepac",
		Name:        "PEPAC — Apoio Agrícola",
		Description: "Apoio ao restabelecimento do potencial produtivo",
		URL:         "https://www.pepac.gov.pt",
		Entity:      "Ministério da Agricultura e Mar",
	},
	{
		ID:          "cm_leiria",
		Name:        "Câmara Municipal de Leiria",
		Description: "Informação municipal sobre a recuperação",
		URL:         "https://www.cm-leiria.pt",
		Entity:      "Município de Leiria",
	},
}

func strPtr(s string) *string { return &s }

var recoverySupportAreas = []supportArea{
	{
		ID:    "habitacao",
		Title: "Habitação — Particulares",
		Icon:  "🏠",
		Supports: []supportItem{
			{
				Name:        "Apoio simplificado até 10.000€",
				Description: "Escalão 1: até 5.000€ | Escalão 2: de 5.000€ a 10.000€. Comparticipação 100%.",
				Platform:    "CCDR Centro",
				URL:         strPtr("https://www.ccdrc.pt/pt/areas-de-atuacao/administracao-local/apoio-tecnico-e-financeiro/tempestades-2026/"),
				DocsRequired: []string{
					"Cartão de Cidadão",
					"IBAN",
					"Fotos dos danos",
					"Orçamentos de reparação",
					"Documentos do imóvel",
				},
			},
			{
				Name:         "Moratória crédito habitação",
				Description:  "Suspensão de prestações bancárias por 90 dias (desde 28 Jan 2026). Regime seletivo de 12 meses para danos mais graves.",
				Platform:     "Banco de Portugal / APB",
				URL:          nil,
				DocsRequired: []string{},
			},
			{
				Name:         "Apoio jurídico (sinistros e seguros)",
				Description:  "Advogados voluntários no Gabinete Reerguer Leiria para participações de sinistros e orientação jurídica.",
				Platform:     "Gabinete Reerguer Leiria",
				URL:          nil,
				DocsRequired: []string{"Apólice de seguro", "Fotos dos danos"},
			},
		},
	},
	{
		ID:    "empresas",
		Title: "Empresas e Comércio",
		Icon:  "🏢",
		Supports: []supportItem{
			{
				Name:         "Linha de crédito tesouraria — 500M€",
				Description:  "Maturidade 5 anos, carência 12 meses. Via Banco de Fomento.",
				Platform:     "Banco Português de Fomento",
				URL:          strPtr("https://www.bfrm.pt"),
				DocsRequired: []string{},
			},
			{
				Name:         "Linha de crédito investimento — 1.000M€",
				Description:  "Para reconstrução de instalações e equipamentos. Via Banco de Fomento.",
				Platform:     "Banco Português de Fomento",
				URL:          strPtr("https://www.bfrm.pt"),
				DocsRequired: []string{},
			},
			{
				Name:         "Moratória créditos empresariais",
				Description:  "Suspensão de prestações por 90 dias desde 28 Jan 2026.",
				Platform:     "Banco de Portugal / APB",
				URL:          nil,
				DocsRequired: []string{},
			},
			{
				Name:         "Registo de prejuízos empresariais",
				Description:  "Levantamento de danos via plataforma Estragos.pt da CM Leiria.",
				Platform:     "Estragos.pt",
				URL:          strPtr("https://estragos.pt"),
				DocsRequired: []string{},
			},
		},
	},
	{
		ID:    "agricultura",
		Title: "Agricultura",
		Icon:  "🌾",
		Supports: []supportItem{
			{
				Name:         "Apoio não reembolsável — 40M€",
				Description:  "Restabelecimento do potencial produtivo. Candidaturas via portal PEPAC. Despesas elegíveis desde 28 Jan 2026.",
				Platform:     "PEPAC / Min. Agricultura",
				URL:          strPtr("https://www.pepac.gov.pt"),
				DocsRequired: []string{"Declaração de prejuízos agrícolas"},
			},
		},
	},
	{
		ID:    "ipss",
		Title: "IPSS e Coletividades",
		Icon:  "🤝",
		Supports: []supportItem{
			{
				Name:         "Apoio à retoma de atividade",
				Description:  "Encaminhamento e apoio no Gabinete Reerguer Leiria. Articulação com Segurança Social.",
				Platform:     "Gabinete Reerguer Leiria",
				URL:          nil,
				DocsRequired: []string{},
			},
		},
	},
}

// Recovery handles GET /api/recovery.
func Recovery() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		results := make([]platformResult, len(recoveryPlatforms))
		var wg sync.WaitGroup

		// Platform HEAD checks (all parallel).
		for i, p := range recoveryPlatforms {
			wg.Add(1)
			go func(i int, p platformDef) {
				defer wg.Done()
				start := time.Now()
				client := &http.Client{Timeout: 8 * time.Second}
				req, err := http.NewRequestWithContext(r.Context(), http.MethodHead, p.URL, nil)
				if err != nil {
					results[i] = platformResult{
						ID: p.ID, Name: p.Name, Description: p.Description,
						URL: p.URL, Entity: p.Entity,
						Reachable: false, CheckedAt: now(),
					}
					return
				}
				resp, err := client.Do(req)
				ms := time.Since(start).Milliseconds()
				if err != nil {
					results[i] = platformResult{
						ID: p.ID, Name: p.Name, Description: p.Description,
						URL: p.URL, Entity: p.Entity,
						Reachable: false, CheckedAt: now(),
					}
					return
				}
				defer resp.Body.Close()
				results[i] = platformResult{
					ID: p.ID, Name: p.Name, Description: p.Description,
					URL: p.URL, Entity: p.Entity,
					Reachable:      resp.StatusCode < 500,
					ResponseTimeMS: &ms,
					CheckedAt:      now(),
				}
			}(i, p)
		}

		// CCDR-C page title scrape (parallel with HEAD checks).
		var ccdrTitle *string
		wg.Add(1)
		go func() {
			defer wg.Done()
			client := &http.Client{Timeout: 8 * time.Second}
			req, err := http.NewRequestWithContext(r.Context(), http.MethodGet,
				"https://www.ccdrc.pt/pt/areas-de-atuacao/administracao-local/apoio-tecnico-e-financeiro/tempestades-2026/", nil)
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
			// Read up to 64KB — enough to capture <title>.
			buf := make([]byte, 65536)
			n, _ := resp.Body.Read(buf)
			m := rRecoveryTitle.FindSubmatch(buf[:n])
			if len(m) >= 2 {
				t := strings.TrimSpace(string(m[1]))
				if t != "" {
					ccdrTitle = &t
				}
			}
		}()

		wg.Wait()

		platformsOnline := 0
		for _, pr := range results {
			if pr.Reachable {
				platformsOnline++
			}
		}

		respond(w, http.StatusOK, map[string]any{
			"success":   true,
			"timestamp": now(),
			"summary": map[string]any{
				"platforms_online":     platformsOnline,
				"platforms_total":      len(results),
				"calamity_status":      "Situação de calamidade",
				"calamity_until":       "2026-02-15",
				"municipalities_affected": 68,
				"total_support_package": "2.500.000.000€",
			},
			"gabinete": map[string]any{
				"name":             "Gabinete Reerguer Leiria",
				"location":         "Mercado de Sant'Ana, Leiria",
				"coordinates":      map[string]any{"lat": 39.7437, "lng": -8.807},
				"schedule":         "09:00 — 18:00 (dias úteis)",
				"opened":           "2026-02-10",
				"num_counters":     15,
				"areas": []string{
					"Apoio habitação (particulares)",
					"Apoio empresas e comércio",
					"IPSS e coletividades",
					"Segurança Social",
					"Autoridade Tributária",
					"Balcão Único — Câmara Municipal",
				},
				"email":               "reerguerleiria@cm-leiria.pt",
				"note":                "Sistema de senhas para atendimento. Advogados disponíveis para participações de sinistros.",
				"first_day_visitors":  250,
			},
			"platforms":    results,
			"support_areas": recoverySupportAreas,
			"calamity": map[string]any{
				"status":               "Situação de calamidade",
				"extended_until":       "2026-02-15",
				"municipalities_count": 68,
				"total_package":        "2.500.000.000€",
				"deaths_total":         15,
				"storms":               []string{"Kristin", "Leonardo", "Marta"},
				"structure_mission": map[string]any{
					"name":        "Estrutura de Missão para Reconstrução da Região Centro",
					"coordinator": "Eng.º Paulo Fernandes",
					"hq":          "Leiria",
					"started":     "2026-02-02",
				},
			},
			"ccdrc_page_title": ccdrTitle,
			"links": map[string]any{
				"estragos":    "https://estragos.pt",
				"ccdrc_apoios": "https://www.ccdrc.pt/pt/areas-de-atuacao/administracao-local/apoio-tecnico-e-financeiro/tempestades-2026/",
				"banco_fomento": "https://www.bfrm.pt",
				"pepac":        "https://www.pepac.gov.pt",
				"cm_leiria":    "https://www.cm-leiria.pt",
				"email_doacoes": "reerguerleiria@cm-leiria.pt",
				"ccdr_lvt":     "https://www.ccdr-lvt.pt/2026/02/ccdr-lvt-disponibiliza-plataformas-de-apoio-as-pessoas-afetadas-pelas-calamidades-de-2026/",
			},
		})
	}
}
