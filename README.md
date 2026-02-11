# Leiria Monitor — Kristin Recovery Dashboard

Dashboard de monitorização em tempo real das infraestruturas do distrito de Leiria após a tempestade Kristin (28 Jan 2026).

## Funcionalidades

- **⚡ Eletricidade** — Dados em tempo real da E-Redes Open Data API (interrupções ativas e programadas por código postal)
- **🌧 Meteorologia** — Avisos e previsões do IPMA API para Leiria
- **📡 Comunicações** — Verificação de acessibilidade dos operadores (MEO, NOS, Vodafone, DIGI) + contexto ANACOM
- **💧 Água** — Status do SMAS Leiria + contexto ERSAR e DGS

## Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS v4**
- APIs: E-Redes OpenDataSoft, IPMA, ANACOM, SMAS Leiria

## Instalação

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## API Routes

| Endpoint | Fonte | Descrição |
|---|---|---|
| `/api/electricity` | E-Redes Open Data | Interrupções ativas/programadas no distrito de Leiria |
| `/api/weather` | IPMA | Avisos meteorológicos e previsão 5 dias |
| `/api/telecom` | Connectivity checks | Estado dos operadores + impacto Kristin via ANACOM |
| `/api/water` | SMAS Leiria / ERSAR | Disponibilidade do portal SMAS + contexto de crise |

## Fontes de Dados

- **E-Redes Open Data Portal**: https://e-redes.opendatasoft.com (CC BY 4.0)
  - Dataset `outages-per-geography` — interrupções ativas
  - Dataset `network-scheduling-work` — interrupções programadas
- **IPMA API**: https://api.ipma.pt (aberta, sem autenticação)
- **ANACOM**: https://www.anacom.pt (dados estáticos atualizados manualmente)
- **SMAS Leiria**: https://www.smas-leiria.pt (sem API pública, apenas health check)
- **ERSAR**: https://www.ersar.pt (qualidade de água, dados anuais)

## Notas

- Os dados de eletricidade (E-Redes) e meteorologia (IPMA) são as fontes mais fiáveis e com APIs públicas
- Os dados de água e comunicações requerem scraping ou atualizações manuais — as entidades responsáveis não disponibilizam APIs em tempo real
- O dashboard faz auto-refresh a cada 5 minutos
- Cache de API routes: 5min (eletricidade), 10min (avisos), 30min (previsão)

## Extensões possíveis

- Integrar Downdetector API para dados de telecomunicações mais granulares
- Scraping automático do site SMAS Leiria para avisos de água
- Mapa interativo com zonas afetadas (Leaflet/Mapbox)
- Histórico de interrupções com gráficos temporais
- Notificações push via Service Worker
- Integração com dados do Gabinete "Reerguer Leiria"

---

Desenvolvido para a comunidade de Leiria na recuperação pós-Kristin 🇵🇹
