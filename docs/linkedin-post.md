When Storm Kristin tore through my hometown on January 28th, I watched power lines fall, water systems fail, and my neighbors scrambling for reliable information about when services would return.

As a developer from Leiria, I knew I could help.

So I built **Rede Sentinela** (redesentinela.com) — a real-time infrastructure recovery platform monitoring 15 municipalities across the Leiria district.

**What it does:**

→ Real-time dashboard tracking 5 critical sectors: electricity outages (E-REDES data), weather alerts (IPMA), telecom coverage (MEO/NOS/Vodafone/DIGI), water services (SMAS), and emergency response (ANEPC)

→ Interactive map with 4 infrastructure layers: power transformers, telecom antennas, BT poles, and crowdsourced damage reports from citizens

→ AI-powered triage using Claude Haiku that auto-classifies citizen reports by priority — hospitals and schools flagged urgent, businesses important, residential areas normal

→ Satellite damage assessment integrated from Copernicus Emergency Management Service (EMSR861) to verify ground reports

→ Recovery tracking with per-substation electricity load charts and per-municipality telecom heatmaps, so communities know exactly when their area will be restored

→ PWA that installs on phones and works offline when connectivity drops

**The tech:** Next.js 16, TypeScript, PostgreSQL, Leaflet maps, integrating 7+ public data sources. All open data, no authentication barriers.

This isn't about a flashy product launch. It's about civic tech that matters — using open data and AI to help communities navigate crisis and recovery with clarity.

If you're a municipal council, emergency service, or community org dealing with infrastructure recovery, reach out. This model can scale.

And if you know someone in the Leiria district still waiting for services to return, share this. Information is infrastructure too.

**→ redesentinela.com**

Made with love from Leiria 🇵🇹

#CivicTech #OpenData #DisasterRecovery #AIForGood #NextJS
