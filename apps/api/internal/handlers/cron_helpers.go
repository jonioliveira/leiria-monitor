package handlers

import (
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// textFromAny returns the first non-empty string from vals as pgtype.Text.
func textFromAny(vals ...any) pgtype.Text {
	for _, v := range vals {
		if s, ok := v.(string); ok && s != "" {
			return pgtype.Text{String: s, Valid: true}
		}
	}
	return pgtype.Text{}
}

// textStr wraps a plain string in pgtype.Text (empty string → null).
func textStr(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}

// nullFloat4Any converts a nullable JSON value (float64) to pgtype.Float4.
func nullFloat4Any(v any) pgtype.Float4 {
	if f, ok := v.(float64); ok {
		return pgtype.Float4{Float32: float32(f), Valid: true}
	}
	return pgtype.Float4{}
}

// nullInt4Any converts a nullable JSON value (float64 or string) to pgtype.Int4.
func nullInt4Any(v any) pgtype.Int4 {
	switch n := v.(type) {
	case float64:
		return pgtype.Int4{Int32: int32(n), Valid: true}
	case string:
		if i, err := strconv.Atoi(n); err == nil {
			return pgtype.Int4{Int32: int32(i), Valid: true}
		}
	}
	return pgtype.Int4{}
}

// parseTimestamp tries RFC3339 then bare "2006-01-02T15:04:05" and returns pgtype.Timestamptz.
func parseTimestamp(s string) pgtype.Timestamptz {
	if s == "" {
		return pgtype.Timestamptz{}
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02 15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return pgtype.Timestamptz{Time: t, Valid: true}
		}
	}
	return pgtype.Timestamptz{}
}

// parseFloat4Str parses a decimal string into pgtype.Float4.
func parseFloat4Str(s string) pgtype.Float4 {
	v, err := strconv.ParseFloat(s, 32)
	if err != nil {
		return pgtype.Float4{}
	}
	return pgtype.Float4{Float32: float32(v), Valid: true}
}

// parseInt4Str parses an integer string into pgtype.Int4.
func parseInt4Str(s string) pgtype.Int4 {
	v, err := strconv.Atoi(s)
	if err != nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: int32(v), Valid: true}
}
