package handlers

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	sqlcdb "github.com/jonioliveira/leiria-monitor-api/sqlc/db"
)

const anepcURL = "https://www.prociv.gov.pt/pt/home/avisos-a-populacao/"

var (
	reProcivModal  = regexp.MustCompile(`(?s)<p\s+class="titulo">(.*?)</p>\s*<p\s+class="titulo-informativo">.*?</p>\s*<p\s+class="resumo">(.*?)</p>.*?<a[^>]+href="([^"]*)"[^>]*>Saiba mais</a>`)
	reProcivBanner = regexp.MustCompile(`(?s)<p\s+class="titulo-emergencia">(.*?)</p>.*?<a[^>]+class="button-alerta"[^>]+href="([^"]*)"[^>]*>`)
	procivEntities = strings.NewReplacer(
		"&#xE0;", "à", "&#xE7;", "ç", "&#xE3;", "ã",
		"&#xE9;", "é", "&#xEA;", "ê", "&#xED;", "í",
		"&#xF3;", "ó", "&#xF4;", "ô", "&#xFA;", "ú",
		"&#xA;", "\n", "&nbsp;", " ", "&amp;", "&",
		"&lt;", "<", "&gt;", ">", "&quot;", `"`, "&#x27;", "'",
	)
)

func decodeProcivEntities(s string) string {
	return strings.TrimSpace(procivEntities.Replace(s))
}

type procivWarning struct {
	title     string
	summary   string
	detailURL string
}

// ingestProcivWarnings scrapes the ANEPC page and writes warnings to the DB.
func ingestProcivWarnings(ctx context.Context, pool *pgxpool.Pool) (int, error) {
	fetchCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequestWithContext(fetchCtx, http.MethodGet, anepcURL, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "+
			"(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	// Read up to 2 MB
	buf := make([]byte, 2*1024*1024)
	n, _ := resp.Body.Read(buf)
	html := string(buf[:n])

	var warnings []procivWarning

	// Modal pattern
	matches := reProcivModal.FindAllStringSubmatch(html, -1)
	for _, m := range matches {
		title := decodeProcivEntities(m[1])
		summary := decodeProcivEntities(m[2])
		detailURL := m[3]
		if title != "" && summary != "" {
			warnings = append(warnings, procivWarning{title, summary, detailURL})
		}
	}

	// Banner pattern (fallback)
	if len(warnings) == 0 {
		matches = reProcivBanner.FindAllStringSubmatch(html, -1)
		for _, m := range matches {
			title := decodeProcivEntities(m[1])
			if title != "" && !strings.Contains(title, "&nbsp;") {
				warnings = append(warnings, procivWarning{title, title, m[2]})
			}
		}
	}

	q := sqlcdb.New(pool)
	_ = q.DeleteProcivWarnings(ctx)

	ingested := 0
	for _, w := range warnings {
		detailFull := ""
		if w.detailURL != "" {
			detailFull = "https://www.prociv.gov.pt" + w.detailURL
		}
		params := sqlcdb.InsertProcivWarningParams{
			Title:     w.title,
			Summary:   w.summary,
			DetailUrl: pgtype.Text{String: detailFull, Valid: detailFull != ""},
		}
		if _, err := q.InsertProcivWarning(ctx, params); err == nil {
			ingested++
		}
	}
	return ingested, nil
}

// CronProcivWarnings handles POST /api/cron/prociv-warnings.
func CronProcivWarnings(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ingested, err := ingestProcivWarnings(r.Context(), pool)
		if err != nil {
			respond(w, http.StatusServiceUnavailable,
				envelope{Success: false, Error: "ANEPC scrape failed: " + err.Error()})
			return
		}
		respond(w, http.StatusOK, map[string]any{
			"success":   true,
			"ingested":  ingested,
			"timestamp": now(),
		})
	}
}
