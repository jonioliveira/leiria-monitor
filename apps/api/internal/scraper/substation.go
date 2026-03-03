package scraper

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

const (
	substationBase    = "https://e-redes.opendatasoft.com/api/explore/v2.1"
	substationDataset = "diagrama_carga_subestacao_08_a_10"
)

// FetchSubstationData fetches E-Redes substation load data and returns JSON bytes
// matching the shape expected by the frontend substation chart.
func FetchSubstationData(ctx context.Context) ([]byte, error) {
	today := time.Now().UTC().Format("2006-01-02")
	client := &http.Client{Timeout: 55 * time.Second}
	base := substationBase + "/catalog/datasets/" + substationDataset + "/records"

	// ── 1. Hourly aggregates Jan 20 – today ─────────────────────────────────
	hourlyU, _ := url.Parse(base)
	hq := hourlyU.Query()
	hq.Set("limit", "100")
	hq.Set("where", "distrito='Leiria' AND datahora>='2026-01-20' AND datahora<='"+today+"'")
	hq.Set("select", "date_format(datahora,'yyyy-MM-dd HH') as hour,sum(energia) as total_energia")
	hq.Set("group_by", "date_format(datahora,'yyyy-MM-dd HH')")
	hq.Set("order_by", "hour")
	hourlyU.RawQuery = hq.Encode()

	// ── 2. Latest per-substation (raw URL avoids '+' encoding in 'where') ───
	latestRaw := base +
		"?limit=100" +
		"&where=" + url.QueryEscape("distrito='Leiria' AND datahora>='2026-01-20'") +
		"&order_by=datahora%20DESC"

	// ── 3. Per-substation daily totals Jan 20 – today ───────────────────────
	perSubU, _ := url.Parse(base)
	pq := perSubU.Query()
	pq.Set("limit", "100")
	pq.Set("where", "distrito='Leiria' AND datahora>='2026-01-20' AND datahora<='"+today+"'")
	pq.Set("select", "subestacao,date_format(datahora,'yyyy-MM-dd') as day,sum(energia) as total_energia")
	pq.Set("group_by", "subestacao,date_format(datahora,'yyyy-MM-dd')")
	pq.Set("order_by", "subestacao,day")
	perSubU.RawQuery = pq.Encode()

	hourlyRows, _ := eredesPageAll(ctx, client, hourlyU.String())
	latestData, _ := eredesJSON(ctx, client, latestRaw)
	perSubRows, _ := eredesPageAll(ctx, client, perSubU.String())

	// ── Process hourly rows ───────────────────────────────────────────────────
	type hourEntry struct {
		hour    string
		energia float64
	}
	var entries []hourEntry
	for _, r := range hourlyRows {
		hour := mapStr(r, "hour", mapStr(r, "date_format(datahora,'yyyy-MM-dd HH')", ""))
		if hour == "" {
			continue
		}
		entries = append(entries, hourEntry{hour, mapFloat(r, "total_energia")})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].hour < entries[j].hour })

	// Baseline: Jan 20-25 avg per hour-of-day
	byHOD := make(map[int][]float64)
	for _, e := range entries {
		if e.hour >= "2026-01-20" && e.hour < "2026-01-26" {
			parts := strings.Fields(e.hour)
			if len(parts) == 2 {
				h := 0
				fmt.Sscanf(parts[1], "%d", &h)
				byHOD[h] = append(byHOD[h], e.energia/1000)
			}
		}
	}
	baselineAvg := make(map[int]float64)
	for h, vals := range byHOD {
		sum := 0.0
		for _, v := range vals {
			sum += v
		}
		baselineAvg[h] = math.Round(sum/float64(len(vals))*100) / 100
	}
	overallBaseline := 0.0
	if len(baselineAvg) > 0 {
		sum := 0.0
		for _, v := range baselineAvg {
			sum += v
		}
		overallBaseline = math.Round(sum/float64(len(baselineAvg))*100) / 100
	}

	// Actual series
	type timeLoad struct {
		Time      string  `json:"time"`
		TotalLoad float64 `json:"totalLoad"`
	}
	actual := make([]timeLoad, 0, len(entries))
	for _, e := range entries {
		actual = append(actual, timeLoad{e.hour, math.Round(e.energia/1000*100) / 100})
	}

	// Projection: linear ease-out over 7 days from last known point
	type projEntry struct {
		Time          string  `json:"time"`
		ProjectedLoad float64 `json:"projectedLoad"`
	}
	var projection []projEntry
	if len(actual) > 0 && overallBaseline > 0 {
		last := actual[len(actual)-1]
		gap := overallBaseline - last.TotalLoad
		lastDate, err := time.Parse("2006-01-02 15", last.Time)
		if err == nil {
			for i := 1; i <= 7*24; i += 3 {
				p := math.Min(float64(i)/float64(7*24), 1)
				eased := 1 - math.Pow(1-p, 2)
				pl := math.Round((last.TotalLoad+gap*eased)*100) / 100
				pd := lastDate.Add(time.Duration(i) * time.Hour)
				projection = append(projection, projEntry{pd.UTC().Format("2006-01-02 15"), pl})
			}
		}
	}
	if projection == nil {
		projection = []projEntry{}
	}

	// Per-substation latest load
	type substationRow struct {
		Name       string   `json:"name"`
		LatestLoad *float64 `json:"latestLoad"`
	}
	var substations []substationRow
	if latestData != nil {
		seen := make(map[string]bool)
		for _, item := range mapSlice(latestData, "results") {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			name := mapStr(m, "subestacao", "")
			if name == "" || seen[name] {
				continue
			}
			seen[name] = true
			if v, ok := m["energia"]; ok && v != nil {
				load := math.Round(anyFloat(v)/1000*100) / 100
				substations = append(substations, substationRow{Name: name, LatestLoad: &load})
			} else {
				substations = append(substations, substationRow{Name: name})
			}
		}
	}
	if substations == nil {
		substations = []substationRow{}
	}

	// Per-substation daily
	type perSubRow struct {
		Actual   []timeLoad `json:"actual"`
		Baseline float64    `json:"baseline"`
	}
	stationData := make(map[string][]struct {
		day     string
		energia float64
	})
	for _, r := range perSubRows {
		name := mapStr(r, "subestacao", "")
		day := mapStr(r, "day", mapStr(r, "date_format(datahora,'yyyy-MM-dd')", ""))
		if name == "" || day == "" {
			continue
		}
		stationData[name] = append(stationData[name], struct {
			day     string
			energia float64
		}{day, mapFloat(r, "total_energia")})
	}
	perSubstation := make(map[string]perSubRow)
	for name, rows := range stationData {
		sort.Slice(rows, func(i, j int) bool { return rows[i].day < rows[j].day })
		blSum, blCnt := 0.0, 0
		for _, row := range rows {
			if row.day >= "2026-01-20" && row.day < "2026-01-26" {
				blSum += row.energia / 1000
				blCnt++
			}
		}
		bl := 0.0
		if blCnt > 0 {
			bl = math.Round(blSum/float64(blCnt)*100) / 100
		}
		actRows := make([]timeLoad, 0, len(rows))
		for _, row := range rows {
			actRows = append(actRows, timeLoad{row.day, math.Round(row.energia/1000*100) / 100})
		}
		perSubstation[name] = perSubRow{Actual: actRows, Baseline: bl}
	}

	payload := map[string]any{
		"success":       true,
		"timestamp":     time.Now().UTC().Format(time.RFC3339),
		"source":        "E-REDES — Diagrama de Carga de Subestações",
		"substations":   substations,
		"baseline":      overallBaseline,
		"actual":        actual,
		"projection":    projection,
		"perSubstation": perSubstation,
	}
	return json.Marshal(payload)
}
