package config

import (
	"log/slog"
	"os"
)

type Config struct {
	DatabaseURL      string
	CronSecret       string
	Port             string
	CORSOrigins      []string
	VAPIDPublic      string
	VAPIDPrivate     string
	VAPIDSubject     string
	AnthropicAPIKey  string
	MeoAPIKey        string
	FeatureAIPriority bool
}

func Load() *Config {
	return &Config{
		DatabaseURL:       mustEnv("DATABASE_URL"),
		CronSecret:        mustEnv("CRON_SECRET"),
		Port:              getEnv("PORT", "8080"),
		CORSOrigins:       []string{getEnv("CORS_ORIGIN", "http://localhost:3000")},
		VAPIDPublic:       getEnv("VAPID_PUBLIC_KEY", ""),
		VAPIDPrivate:      getEnv("VAPID_PRIVATE_KEY", ""),
		VAPIDSubject:      getEnv("VAPID_SUBJECT", ""),
		AnthropicAPIKey:   getEnv("ANTHROPIC_API_KEY", ""),
		MeoAPIKey:         getEnv("MEO_API_KEY", "177204608089cec963d39972af2b2df0d2fcc130d6"),
		FeatureAIPriority: getEnv("FEATURE_AI_PRIORITY", "") == "true",
	}
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("required environment variable not set", "key", key)
		os.Exit(1)
	}
	return v
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
