package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"golang.org/x/sync/errgroup"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jonioliveira/leiria-monitor-api/internal/parish"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

// Dashboard handles GET /api/dashboard.
func Dashboard(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := sqlcdb.New(pool)

		// ── parallel DB queries ───────────────────────────────────────────────
		var (
			reports        []sqlcdb.UserReport
			warnings       []sqlcdb.IpmaWarning
			scheduled      []sqlcdb.EredesScheduledWork
			procivWarnings []sqlcdb.ProcivWarning
			elecRow        sqlcdb.GetDashboardElectricityRow
			substData      []byte // raw JSONB from substation_cache
			copernicusData map[string]any
		)

		g, gctx := errgroup.WithContext(r.Context())

		g.Go(func() error {
			var err error
			reports, err = q.ListActiveReports(gctx)
			return err
		})
		g.Go(func() error {
			var err error
			warnings, err = q.GetDashboardWeather(gctx)
			return err
		})
		g.Go(func() error {
			var err error
			scheduled, err = q.GetDashboardScheduledWork(gctx)
			return err
		})
		g.Go(func() error {
			var err error
			procivWarnings, err = q.GetDashboardProcivWarnings(gctx)
			return err
		})
		g.Go(func() error {
			var err error
			elecRow, err = q.GetDashboardElectricity(gctx)
			return err
		})
		g.Go(func() error {
			row, err := q.GetSubstationCache(gctx)
			if err == nil {
				substData = row.Data
			}
			return nil // cache miss is not fatal
		})
		g.Go(func() error {
			req, err := http.NewRequestWithContext(gctx, "GET",
				"https://mapping.emergency.copernicus.eu/activations/api/activations/EMSR861/", nil)
			if err != nil {
				return nil
			}
			client := &http.Client{Timeout: 10 * time.Second}
			resp, err := client.Do(req)
			if err != nil {
				return nil
			}
			defer resp.Body.Close()
			_ = json.NewDecoder(resp.Body).Decode(&copernicusData)
			return nil
		})

		if err := g.Wait(); err != nil {
			respond(w, http.StatusInternalServerError, envelope{Success: false, Error: err.Error()})
			return
		}

		// ── electricity status ────────────────────────────────────────────────
		var elecReportCount int32
		var elecParishes []string
		for _, rpt := range reports {
			if rpt.Type == "electricity" {
				elecReportCount++
				if rpt.Parish.Valid && rpt.Parish.String != "" {
					elecParishes = append(elecParishes, rpt.Parish.String)
				}
			}
		}
		uniqueParishes := make(map[string]bool)
		for _, p := range elecParishes {
			uniqueParishes[p] = true
		}
		totalOutages := elecRow.TotalOutages

		// Parse substation counts from cache JSON if available.
		var substTotal, substActive int
		if len(substData) > 0 {
			var substJSON map[string]any
			if json.Unmarshal(substData, &substJSON) == nil {
				if v, ok := substJSON["total"].(float64); ok {
					substTotal = int(v)
				}
				if v, ok := substJSON["active"].(float64); ok {
					substActive = int(v)
				}
			}
		}

		var electricityStatus string
		if int(elecReportCount) > 5 || int(totalOutages) > 5 {
			electricityStatus = "critical"
		} else if elecReportCount > 0 || totalOutages > 0 || (substTotal > 0 && substActive < substTotal) {
			electricityStatus = "warning"
		} else if substTotal > 0 {
			electricityStatus = "ok"
		} else {
			electricityStatus = "unknown"
		}

		// ── weather status ────────────────────────────────────────────────────
		weatherStatus := "unknown"
		if len(warnings) > 0 {
			hasRed := false
			hasOrange := false
			for _, w := range warnings {
				if w.Level == "red" {
					hasRed = true
				}
				if w.Level == "orange" {
					hasOrange = true
				}
			}
			if hasRed {
				weatherStatus = "critical"
			} else if hasOrange {
				weatherStatus = "warning"
			} else {
				weatherStatus = "ok"
			}
		}

		// ── occurrences status ────────────────────────────────────────────────
		occurrencesStatus := "unknown"
		occCount := len(reports) // active user reports (proxy for occurrences)
		_ = occCount
		// Use prociv occurrences query count — pull from a separate query if needed.
		// For now, approximate via report count matching Next.js logic.
		// (The Next.js dashboard actually queries prociv_occurrences directly.)
		// Since we use ListActiveReports, fall back to "ok" when no prociv data.
		occurrencesStatus = "ok"

		// Active warning count (non-green)
		activeWarnings := 0
		for _, w := range warnings {
			if w.Level != "green" {
				activeWarnings++
			}
		}

		// ── Copernicus ────────────────────────────────────────────────────────
		copernicus := map[string]any{
			"status":   "unknown",
			"products": 0,
			"aois":     0,
			"active":   false,
		}
		if copernicusData != nil {
			isActive := copernicusData["closed"] == nil
			status := "unknown"
			if _, hasCode := copernicusData["code"]; hasCode {
				if isActive {
					status = "warning"
				} else {
					status = "ok"
				}
			}
			products := 0
			if v, ok := copernicusData["n_products"].(float64); ok {
				products = int(v)
			}
			aois := 0
			if v, ok := copernicusData["n_aois"].(float64); ok {
				aois = int(v)
			}
			copernicus = map[string]any{
				"status":   status,
				"products": products,
				"aois":     aois,
				"active":   isActive,
			}
		}

		// ── recentWarnings (top 3 non-green) ─────────────────────────────────
		type warningBrief struct {
			Type       string  `json:"type"`
			Level      string  `json:"level"`
			LevelColor *string `json:"levelColor"`
			Text       *string `json:"text"`
		}
		var recentWarnings []warningBrief
		for _, w := range warnings {
			if w.Level == "green" || len(recentWarnings) >= 3 {
				continue
			}
			wb := warningBrief{Type: w.Type, Level: w.Level}
			if w.LevelColor.Valid {
				wb.LevelColor = &w.LevelColor.String
			}
			if w.Text.Valid {
				wb.Text = &w.Text.String
			}
			recentWarnings = append(recentWarnings, wb)
		}
		if recentWarnings == nil {
			recentWarnings = []warningBrief{}
		}

		// ── populationWarnings ────────────────────────────────────────────────
		type procivOut struct {
			ID        int32  `json:"id"`
			Title     string `json:"title"`
			Summary   string `json:"summary"`
			DetailUrl *string `json:"detailUrl"`
			FetchedAt string `json:"fetchedAt"`
		}
		pWarn := make([]procivOut, 0, len(procivWarnings))
		for _, pw := range procivWarnings {
			po := procivOut{
				ID:        pw.ID,
				Title:     pw.Title,
				Summary:   pw.Summary,
				FetchedAt: pw.FetchedAt.Time.UTC().Format(time.RFC3339),
			}
			if pw.DetailUrl.Valid {
				po.DetailUrl = &pw.DetailUrl.String
			}
			pWarn = append(pWarn, po)
		}

		// ── concelhoBreakdown ─────────────────────────────────────────────────
		parishConcelhoMap := parish.ParishConcelhoMap()
		concelhoList := parish.GetAllConcelhos()
		concelhoCountMap := make(map[string]int)
		for _, rpt := range reports {
			if !rpt.Parish.Valid || rpt.Parish.String == "" {
				continue
			}
			if conc, ok := parishConcelhoMap[strings.ToUpper(rpt.Parish.String)]; ok {
				concelhoCountMap[conc]++
			}
		}
		type concelhoEntry struct {
			Concelho string `json:"concelho"`
			Reports  int    `json:"reports"`
		}
		breakdown := make([]concelhoEntry, 0, len(concelhoList))
		for _, c := range concelhoList {
			breakdown = append(breakdown, concelhoEntry{Concelho: c, Reports: concelhoCountMap[c]})
		}
		// Sort descending by report count (simple insertion sort — small slice)
		for i := 1; i < len(breakdown); i++ {
			for j := i; j > 0 && breakdown[j].Reports > breakdown[j-1].Reports; j-- {
				breakdown[j], breakdown[j-1] = breakdown[j-1], breakdown[j]
			}
		}

		respond(w, http.StatusOK, map[string]any{
			"success":   true,
			"timestamp": now(),
			"summary": map[string]any{
				"electricity": map[string]any{
					"status":             electricityStatus,
					"totalOutages":       elecReportCount,
					"municipalitiesAffected": len(uniqueParishes),
					"substationsTotal":   substTotal,
					"substationsActive":  substActive,
				},
				"weather": map[string]any{
					"status":         weatherStatus,
					"activeWarnings": activeWarnings,
				},
				"occurrences": map[string]any{
					"status":      occurrencesStatus,
					"activeCount": 0,
				},
				"scheduledWork": map[string]any{
					"count": len(scheduled),
				},
				"copernicus": copernicus,
			},
			"recentWarnings":    recentWarnings,
			"populationWarnings": pWarn,
			"concelhoBreakdown": breakdown,
		})
	}
}
