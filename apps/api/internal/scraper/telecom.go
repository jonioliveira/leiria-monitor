// Package scraper contains external data fetchers used by cron and handler code.
package scraper

import (
	"bytes"
	"context"
	"encoding/json"
	"html"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ── compiled regexps (initialised once at package load) ─────────────────────

var (
	reHTMLTag    = regexp.MustCompile(`<[^>]*>`)
	reWhitespace = regexp.MustCompile(`\s+`)
	rePercent    = regexp.MustCompile(`(\d+)%`)
	reMEODate    = regexp.MustCompile(`(?i)Atualizado\s+a\s+(\d{2})/(\d{2})/(\d{4})`)
	reTRRow      = regexp.MustCompile(`(?s)<tr[^>]*>(.*?)</tr>`)
	reTDCell     = regexp.MustCompile(`(?s)<td[^>]*>(.*?)</td>`)
	reTHCell     = regexp.MustCompile(`(?i)<th`)
)

// ── shared helpers ────────────────────────────────────────────────────────────

func stripHTML(s string) string {
	s = reHTMLTag.ReplaceAllString(s, "")
	s = html.UnescapeString(s)
	s = reWhitespace.ReplaceAllString(strings.TrimSpace(s), " ")
	return s
}

func parsePercentage(text string) *int {
	if m := rePercent.FindStringSubmatch(text); m != nil {
		n, err := strconv.Atoi(m[1])
		if err == nil {
			return &n
		}
	}
	return nil
}

func parseIntStr(s string) *int {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return nil
	}
	return &n
}

func doGet(ctx context.Context, url string) (string, bool) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", false
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; LeiriaMonitor/1.0; community dashboard)")
	req.Header.Set("Accept", "text/html")
	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode >= 400 {
		if resp != nil {
			resp.Body.Close()
		}
		return "", false
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20)) // 2 MB cap
	if err != nil {
		return "", false
	}
	return string(b), true
}

// ── operator HEAD checks ──────────────────────────────────────────────────────

type operatorEndpoint struct {
	Name  string
	URL   string
	Color string
}

var operatorEndpoints = []operatorEndpoint{
	{"MEO", "https://www.meo.pt", "#00a3e0"},
	{"NOS", "https://www.nos.pt", "#ff6600"},
	{"Vodafone", "https://www.vodafone.pt", "#e60000"},
	{"DIGI", "https://www.dfrportuguese.com", "#003087"},
}

type OperatorStatus struct {
	Name           string `json:"name"`
	Reachable      bool   `json:"reachable"`
	ResponseTimeMs *int64 `json:"response_time_ms"`
	Color          string `json:"color"`
}

func checkEndpoint(ctx context.Context, ep operatorEndpoint) OperatorStatus {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, ep.URL, nil)
	if err != nil {
		return OperatorStatus{Name: ep.Name, Reachable: false, Color: ep.Color}
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return OperatorStatus{Name: ep.Name, Reachable: false, Color: ep.Color}
	}
	resp.Body.Close()
	ms := time.Since(start).Milliseconds()
	reachable := resp.StatusCode < 500
	return OperatorStatus{Name: ep.Name, Reachable: reachable, ResponseTimeMs: &ms, Color: ep.Color}
}

// ── MEO availability ──────────────────────────────────────────────────────────

type MeoGlobal struct {
	RedFixaPct          *int   `json:"rede_fixa_pct"`
	RedFixaPrevisao95   string `json:"rede_fixa_previsao_95"`
	RedeMovelPct        *int   `json:"rede_movel_pct"`
	RedeMovelPrevisao95 string `json:"rede_movel_previsao_95"`
}

type MeoConcelhoEntry struct {
	Concelho          string `json:"concelho"`
	Distrito          string `json:"distrito"`
	RedFixaPct        *int   `json:"rede_fixa_pct"`
	RedFixaPrevisao   string `json:"rede_fixa_previsao"`
	RedeMovelPct      *int   `json:"rede_movel_pct"`
	RedeMovelPrevisao string `json:"rede_movel_previsao"`
	IsLeiriaDistrict  bool   `json:"is_leiria_district"`
}

type MeoAvailabilityResult struct {
	Success        bool               `json:"success"`
	LastUpdated    *string            `json:"last_updated"`
	Global         *MeoGlobal         `json:"global"`
	Concelhos      []MeoConcelhoEntry `json:"concelhos"`
	LeiriaDistrict []MeoConcelhoEntry `json:"leiria_district"`
	LeiríaConcelho *MeoConcelhoEntry  `json:"leiria_concelho"`
	SourceURL      string             `json:"source_url"`
	FetchedAt      string             `json:"fetched_at"`
}

const (
	meoAppURL    = "https://app-ef66ba3b-3a54-42d4-9559-560dd50c913d.apps.meo.pt/Pages/Default.aspx?SenderId=346DB3AC0"
	meoSearchAPI = "https://app-ef66ba3b-3a54-42d4-9559-560dd50c913d.apps.meo.pt/Services/Rest.svc/SearchStores"
	meoAvailURL  = "https://www.meo.pt/disponibilidade-servicos-meo"
)

func meoCapitalize(word string) string {
	lower := strings.ToLower(word)
	for _, small := range []string{"de", "do", "da", "dos", "das", "a", "e", "o", "em"} {
		if lower == small {
			return lower
		}
	}
	if len(word) == 0 {
		return word
	}
	runes := []rune(word)
	return strings.ToUpper(string(runes[:1])) + strings.ToLower(string(runes[1:]))
}

func capitalizeMeoName(name string) string {
	words := strings.Fields(name)
	for i, w := range words {
		words[i] = meoCapitalize(w)
	}
	return strings.Join(words, " ")
}

type meoBbox struct {
	Latitude1  float64 `json:"latitude1"`
	Longitude1 float64 `json:"longitude1"`
	Latitude2  float64 `json:"latitude2"`
	Longitude2 float64 `json:"longitude2"`
}

type meoAPIResponse struct {
	StatusCode int `json:"StatusCode"`
	Result     []struct {
		Name            string `json:"Name"`
		Address         string `json:"Address"`
		IsMunicipality  bool   `json:"IsMunicipality"`
		PercentLandline string `json:"PercentLandline"`
		DateLandline    string `json:"DateLandline"`
		PercentMobile   string `json:"PercentMobile"`
		DateMobile      string `json:"DateMobile"`
	} `json:"Result"`
}

func scrapeMeoAvailability(ctx context.Context, meoAPIKey string) MeoAvailabilityResult {
	result := MeoAvailabilityResult{
		Concelhos:      []MeoConcelhoEntry{},
		LeiriaDistrict: []MeoConcelhoEntry{},
		SourceURL:      meoAvailURL,
		FetchedAt:      time.Now().UTC().Format(time.RFC3339),
	}

	// 1. HTML page for last_updated date
	func() {
		hCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(hCtx, http.MethodGet, meoAppURL, nil)
		if err != nil {
			return
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; LeiriaMonitor/1.0)")
		req.Header.Set("Accept", "text/html")
		resp, err := http.DefaultClient.Do(req)
		if err != nil || resp.StatusCode >= 400 {
			if resp != nil {
				resp.Body.Close()
			}
			return
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
		htmlStr := string(b)
		if m := reMEODate.FindStringSubmatch(htmlStr); m != nil {
			s := m[3] + "-" + m[2] + "-" + m[1]
			result.LastUpdated = &s
		}
	}()

	// 2. SearchStores REST API for per-concelho data
	func() {
		payload, _ := json.Marshal(meoBbox{Latitude1: 39.2, Longitude1: -9.5, Latitude2: 40.2, Longitude2: -8.1})
		aCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(aCtx, http.MethodPost, meoSearchAPI, bytes.NewReader(payload))
		if err != nil {
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("APIKey", meoAPIKey)
		req.Header.Set("Referer", meoAppURL)
		req.Header.Set("Origin", "https://app-ef66ba3b-3a54-42d4-9559-560dd50c913d.apps.meo.pt")
		req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; LeiriaMonitor/1.0)")
		req.Header.Set("Accept", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil || resp.StatusCode >= 400 {
			if resp != nil {
				resp.Body.Close()
			}
			return
		}
		defer resp.Body.Close()
		var apiResp meoAPIResponse
		if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil || apiResp.StatusCode != 200 {
			return
		}
		for _, poi := range apiResp.Result {
			if !poi.IsMunicipality || strings.ToUpper(poi.Address) != "LEIRIA" {
				continue
			}
			rawName := regexp.MustCompile(`(?i)\s*\(Concelho\)\s*`).ReplaceAllString(poi.Name, "")
			rawName = strings.TrimSpace(rawName)
			concelho := capitalizeMeoName(rawName)
			fixaPrev := poi.DateLandline
			if strings.Contains(poi.DateLandline, "95%") {
				fixaPrev = "Disponibilidade >= 95%"
			}
			movelPrev := poi.DateMobile
			if strings.Contains(poi.DateMobile, "95%") {
				movelPrev = "Disponibilidade >= 95%"
			}
			entry := MeoConcelhoEntry{
				Concelho:          concelho,
				Distrito:          "Leiria",
				RedFixaPct:        parseIntStr(poi.PercentLandline),
				RedFixaPrevisao:   fixaPrev,
				RedeMovelPct:      parseIntStr(poi.PercentMobile),
				RedeMovelPrevisao: movelPrev,
				IsLeiriaDistrict:  true,
			}
			result.Concelhos = append(result.Concelhos, entry)
			result.LeiriaDistrict = append(result.LeiriaDistrict, entry)
			if strings.ToUpper(rawName) == "LEIRIA" {
				c := entry
				result.LeiríaConcelho = &c
			}
		}
		result.Success = len(result.Concelhos) > 0
	}()

	return result
}

// ── NOS availability ──────────────────────────────────────────────────────────

type NosConcelhoEntry struct {
	Concelho         string `json:"concelho"`
	Distrito         string `json:"distrito"`
	RedFixaPct       *int   `json:"rede_fixa_pct"`
	RedeMovelPct     *int   `json:"rede_movel_pct"`
	IsLeiriaDistrict bool   `json:"is_leiria_district"`
}

type NosAvailabilityResult struct {
	Success        bool               `json:"success"`
	Concelhos      []NosConcelhoEntry `json:"concelhos"`
	LeiriaDistrict []NosConcelhoEntry `json:"leiria_district"`
	LeiríaConcelho *NosConcelhoEntry  `json:"leiria_concelho"`
	SourceURL      string             `json:"source_url"`
	FetchedAt      string             `json:"fetched_at"`
}

const nosForumURL = "https://forum.nos.pt/novidades-16/depressao-kristin-o-que-precisa-saber-51910"

func scrapeNosAvailability(ctx context.Context) NosAvailabilityResult {
	result := NosAvailabilityResult{
		Concelhos:      []NosConcelhoEntry{},
		LeiriaDistrict: []NosConcelhoEntry{},
		SourceURL:      nosForumURL,
		FetchedAt:      time.Now().UTC().Format(time.RFC3339),
	}

	hCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	htmlStr, ok := doGet(hCtx, nosForumURL)
	if !ok {
		return result
	}

	// Find the content-spoiler section then the table inside it.
	idx := strings.Index(htmlStr, "content-spoiler")
	if idx == -1 {
		return result
	}
	tableStart := strings.Index(htmlStr[idx:], "<table")
	if tableStart == -1 {
		return result
	}
	tableStart += idx
	tableEnd := strings.Index(htmlStr[tableStart:], "</table>")
	if tableEnd == -1 {
		return result
	}
	tableHTML := htmlStr[tableStart : tableStart+tableEnd+len("</table>")]

	var currentDistrito string
	for _, rowMatch := range reTRRow.FindAllStringSubmatch(tableHTML, -1) {
		rowContent := rowMatch[1]
		if reTHCell.MatchString(rowContent) {
			continue
		}
		cells := reTDCell.FindAllStringSubmatch(rowContent, -1)
		if len(cells) == 0 {
			continue
		}
		stripped := make([]string, len(cells))
		for i, c := range cells {
			stripped[i] = stripHTML(c[1])
		}

		var entry NosConcelhoEntry
		switch len(stripped) {
		case 4:
			currentDistrito = stripped[0]
			entry = NosConcelhoEntry{
				Distrito:  currentDistrito,
				Concelho:  stripped[1],
				RedFixaPct:   parsePercentage(stripped[2]),
				RedeMovelPct: parsePercentage(stripped[3]),
				IsLeiriaDistrict: strings.ToLower(currentDistrito) == "leiria",
			}
		case 3:
			if currentDistrito == "" {
				continue
			}
			entry = NosConcelhoEntry{
				Distrito:  currentDistrito,
				Concelho:  stripped[0],
				RedFixaPct:   parsePercentage(stripped[1]),
				RedeMovelPct: parsePercentage(stripped[2]),
				IsLeiriaDistrict: strings.ToLower(currentDistrito) == "leiria",
			}
		default:
			continue
		}
		if entry.Concelho == "" {
			continue
		}
		result.Concelhos = append(result.Concelhos, entry)
		if entry.IsLeiriaDistrict {
			result.LeiriaDistrict = append(result.LeiriaDistrict, entry)
			if strings.ToLower(entry.Concelho) == "leiria" {
				c := entry
				result.LeiríaConcelho = &c
			}
		}
	}
	result.Success = len(result.Concelhos) > 0
	return result
}

// ── Vodafone availability ─────────────────────────────────────────────────────

type VodafoneConcelhoEntry struct {
	Concelho          string `json:"concelho"`
	Distrito          string `json:"distrito"`
	RedFixaPct        *int   `json:"rede_fixa_pct"`
	RedFixaPrevisao   string `json:"rede_fixa_previsao"`
	RedeMovelPct      *int   `json:"rede_movel_pct"`
	RedeMovelPrevisao string `json:"rede_movel_previsao"`
	IsLeiriaDistrict  bool   `json:"is_leiria_district"`
}

type VodafoneAvailabilityResult struct {
	Success        bool                    `json:"success"`
	Concelhos      []VodafoneConcelhoEntry `json:"concelhos"`
	LeiriaDistrict []VodafoneConcelhoEntry `json:"leiria_district"`
	LeiríaConcelho *VodafoneConcelhoEntry  `json:"leiria_concelho"`
	SourceURL      string                  `json:"source_url"`
	FetchedAt      string                  `json:"fetched_at"`
}

const vodafoneKristinURL = "https://ajuda.vodafone.pt/perguntas-frequentes/calamidade-kristin-estado-de-recuperacao-de-servicos-por-concelho"

func scrapeVodafoneAvailability(ctx context.Context) VodafoneAvailabilityResult {
	result := VodafoneAvailabilityResult{
		Concelhos:      []VodafoneConcelhoEntry{},
		LeiriaDistrict: []VodafoneConcelhoEntry{},
		SourceURL:      vodafoneKristinURL,
		FetchedAt:      time.Now().UTC().Format(time.RFC3339),
	}

	hCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	htmlStr, ok := doGet(hCtx, vodafoneKristinURL)
	if !ok {
		return result
	}

	tableStart := strings.Index(htmlStr, "<table")
	if tableStart == -1 {
		return result
	}
	tableEnd := strings.Index(htmlStr[tableStart:], "</table>")
	if tableEnd == -1 {
		return result
	}
	tableHTML := htmlStr[tableStart : tableStart+tableEnd+len("</table>")]

	var currentDistrito string
	for _, rowMatch := range reTRRow.FindAllStringSubmatch(tableHTML, -1) {
		rowContent := rowMatch[1]
		if reTHCell.MatchString(rowContent) {
			continue
		}
		cells := reTDCell.FindAllStringSubmatch(rowContent, -1)
		if len(cells) == 0 {
			continue
		}
		stripped := make([]string, len(cells))
		for i, c := range cells {
			stripped[i] = stripHTML(c[1])
		}

		var entry VodafoneConcelhoEntry
		switch len(stripped) {
		case 6:
			currentDistrito = stripped[0]
			entry = VodafoneConcelhoEntry{
				Distrito:          currentDistrito,
				Concelho:          stripped[1],
				RedFixaPct:        parsePercentage(stripped[2]),
				RedFixaPrevisao:   stripped[3],
				RedeMovelPct:      parsePercentage(stripped[4]),
				RedeMovelPrevisao: stripped[5],
				IsLeiriaDistrict:  strings.ToLower(currentDistrito) == "leiria",
			}
		case 5:
			if currentDistrito == "" {
				continue
			}
			entry = VodafoneConcelhoEntry{
				Distrito:          currentDistrito,
				Concelho:          stripped[0],
				RedFixaPct:        parsePercentage(stripped[1]),
				RedFixaPrevisao:   stripped[2],
				RedeMovelPct:      parsePercentage(stripped[3]),
				RedeMovelPrevisao: stripped[4],
				IsLeiriaDistrict:  strings.ToLower(currentDistrito) == "leiria",
			}
		default:
			continue
		}
		if entry.Concelho == "" {
			continue
		}
		result.Concelhos = append(result.Concelhos, entry)
		if entry.IsLeiriaDistrict {
			result.LeiriaDistrict = append(result.LeiriaDistrict, entry)
			if strings.ToLower(entry.Concelho) == "leiria" {
				c := entry
				result.LeiríaConcelho = &c
			}
		}
	}
	result.Success = len(result.Concelhos) > 0
	return result
}

// ── FetchTelecomData ──────────────────────────────────────────────────────────

// FetchTelecomData runs all scrapers in parallel and returns the result as
// JSON bytes ready for storage in the telecom_cache JSONB column.
func FetchTelecomData(ctx context.Context, meoAPIKey string) ([]byte, error) {
	var (
		wg       sync.WaitGroup
		statuses []OperatorStatus
		meo      MeoAvailabilityResult
		nos      NosAvailabilityResult
		voda     VodafoneAvailabilityResult
	)

	wg.Add(4)
	go func() {
		defer wg.Done()
		results := make([]OperatorStatus, len(operatorEndpoints))
		var inner sync.WaitGroup
		inner.Add(len(operatorEndpoints))
		for i, ep := range operatorEndpoints {
			i, ep := i, ep
			go func() {
				defer inner.Done()
				results[i] = checkEndpoint(ctx, ep)
			}()
		}
		inner.Wait()
		statuses = results
	}()
	go func() { defer wg.Done(); meo = scrapeMeoAvailability(ctx, meoAPIKey) }()
	go func() { defer wg.Done(); nos = scrapeNosAvailability(ctx) }()
	go func() { defer wg.Done(); voda = scrapeVodafoneAvailability(ctx) }()
	wg.Wait()

	payload := map[string]any{
		"success":    true,
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
		"source":     "Connectivity checks + MEO Disponibilidade + NOS Forum Kristin + Vodafone Ajuda Kristin + ANACOM data",
		"operators":  statuses,
		"operator_incidents": []any{},
		"meo_availability":       meo,
		"nos_availability":       nos,
		"vodafone_availability":  voda,
		"kristin_impact": map[string]any{
			"last_known_affected_clients": 147000,
			"last_known_date":             "2026-02-03",
			"most_affected_operators":     []string{"MEO", "Vodafone", "NOS"},
			"most_affected_areas":         []string{"Leiria", "Pombal", "Marinha Grande", "Porto de Mós", "Alcobaça"},
			"note":                        "Dados da ANACOM a 03/02/2026. Para dados atualizados em tempo real, consultar https://www.anacom.pt",
			"anacom_recommendations_url":  "https://www.anacom.pt/render.jsp?contentId=1826541",
		},
		"tips": map[string]string{
			"roaming_nacional": "A ANACOM recomendou roaming nacional temporário entre operadores",
			"compensacao":      "Interrupção > 24h = direito a compensação. > 15 dias = cancelamento sem custos",
			"report":           "Reportar falhas à operadora e usar o Livro de Reclamações",
		},
	}
	return json.Marshal(payload)
}
