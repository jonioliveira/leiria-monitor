package classify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Priority string

const (
	PriorityUrgente   Priority = "urgente"
	PriorityImportante Priority = "importante"
	PriorityNormal    Priority = "normal"
)

var urgenteKeywords = []string{
	"hospital", "centro de saúde", "centro de saude", "idoso", "lar",
	"criança", "crianca", "escola", "creche", "farmácia", "farmacia",
	"bomba de água", "bomba de agua", "diálise", "dialise",
	"ventilador", "oxigénio", "oxigenio",
	"estrada nacional", "acesso hospital", " ip ", " ic ",
	"poste caído", "poste caido", "poste partido",
	"fio caído", "fio caido", "cabo caído", "cabo caido",
	"risco elétrico", "risco eletrico",
}

var importanteKeywords = []string{
	"empresa", "comércio", "comercio", "loja", "restaurante",
	"abrigo", "supermercado", "edifício", "edificio",
	"bombeiros", "quartel", "municipal", "ponte", "acesso",
}

func keywordFallback(description, reportType, street string) Priority {
	text := strings.ToLower(strings.Join([]string{description, reportType, street}, " "))
	for _, kw := range urgenteKeywords {
		if strings.Contains(text, kw) {
			return PriorityUrgente
		}
	}
	for _, kw := range importanteKeywords {
		if strings.Contains(text, kw) {
			return PriorityImportante
		}
	}
	return PriorityNormal
}

// anthropicRequest / anthropicResponse are minimal structs for the Messages API.
type anthropicRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	System    string             `json:"system"`
	Messages  []anthropicMessage `json:"messages"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
}

const claudeModel = "claude-haiku-4-5-20251001"

const systemPrompt = "Classifica a prioridade deste reporte de infraestrutura danificada em Portugal. " +
	"Responde APENAS com uma palavra: urgente, importante ou normal.\n" +
	"urgente = hospitais, centros de saúde, lares de idosos, escolas, creches, farmácias, bombas de água, equipamento médico, postes caídos/partidos, fios/cabos caídos, risco elétrico\n" +
	"importante = empresas, comércio, abrigos, supermercados, edifícios públicos, bombeiros\n" +
	"normal = residências comuns"

func classifyWithClaude(ctx context.Context, apiKey, description, reportType, street string) (Priority, error) {
	parts := []string{}
	if description != "" {
		parts = append(parts, "Descrição: "+description)
	}
	parts = append(parts, "Tipo: "+reportType)
	if street != "" {
		parts = append(parts, "Rua: "+street)
	}

	body, _ := json.Marshal(anthropicRequest{
		Model:     claudeModel,
		MaxTokens: 10,
		System:    systemPrompt,
		Messages:  []anthropicMessage{{Role: "user", Content: strings.Join(parts, "\n")}},
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("anthropic API returned %d", resp.StatusCode)
	}

	raw, _ := io.ReadAll(resp.Body)
	var ar anthropicResponse
	if err := json.Unmarshal(raw, &ar); err != nil {
		return "", err
	}

	if len(ar.Content) == 0 || ar.Content[0].Type != "text" {
		return "", fmt.Errorf("unexpected response shape")
	}

	switch strings.TrimSpace(strings.ToLower(ar.Content[0].Text)) {
	case "urgente":
		return PriorityUrgente, nil
	case "importante":
		return PriorityImportante, nil
	case "normal":
		return PriorityNormal, nil
	default:
		return "", fmt.Errorf("unexpected priority value: %q", ar.Content[0].Text)
	}
}

// ClassifyPriority classifies a report's priority using keyword matching.
// If apiKey is non-empty and featureAI is true, it first tries Claude Haiku
// and falls back to keywords on any error.
func ClassifyPriority(ctx context.Context, apiKey string, featureAI bool, description, reportType, street string) Priority {
	if featureAI && apiKey != "" {
		p, err := classifyWithClaude(ctx, apiKey, description, reportType, street)
		if err == nil {
			return p
		}
	}
	return keywordFallback(description, reportType, street)
}
