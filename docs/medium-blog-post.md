# When Your Hometown Gets Hit: Building a Civic Tech Response to Storm Kristin

*How one developer turned Portugal's open government data into a real-time recovery dashboard after disaster struck Leiria*

---

On January 28, 2026, Storm Kristin carved a path of destruction through Portugal's Leiria district. I watched from my apartment as winds tore through streets I'd walked my entire life, ripping down power lines, snapping poles, and severing the infrastructure that connects fifteen municipalities to the modern world. The storm passed in hours, but the aftermath lingered for days — and with it, a gnawing uncertainty that felt worse than the physical damage.

Was the power back in my parents' neighborhood? Which roads were still blocked? Could my friend across town even call for help if she needed to? The information existed somewhere — E-REDES knew which transformers were down, IPMA had weather projections, municipal water services knew their status — but it was scattered across a dozen websites, PDFs, and Facebook posts. Neighbors were sharing screenshots of screenshots. Elderly relatives were calling anyone who might know anything. The chaos wasn't just physical; it was informational.

That's when the developer instinct kicked in: *all this data is public. What if I just... put it in one place?*

---

## The Idea: Aggregate Everything

I'm Joni Oliveira, a developer from Leiria. I've spent years building apps and tools, but nothing felt as urgent as this. The data we needed already existed in Portugal's surprisingly robust open data ecosystem. E-REDES publishes real-time outage data through their OpenDataSoft API. IPMA (our meteorological institute) provides weather warnings and forecasts. ANEPC, the national emergency service, tracks active incidents and deployed resources. ANACOM has telecom antenna locations. The European Union's Copernicus program had already activated emergency mapping for Storm Kristin (activation code EMSR861).

All the pieces were there. They just weren't talking to each other.

So I built Rede Sentinela — the "Sentinel Network" — a real-time infrastructure recovery dashboard designed to answer one question: *what's actually working right now?*

---

## What Rede Sentinela Does

At its core, Rede Sentinela is a single-page dashboard monitoring five critical sectors: electricity, weather, telecommunications, water, and emergency response. Every five minutes, it polls public APIs and displays the current state of each sector with color-coded status indicators. Red means critical issues. Amber means warnings or partial service. Green means operational. It's simple, but in a crisis, simple is what people need.

The real power, though, is in the interactive map. I integrated four data layers that can be toggled independently. First, power transformers (PTDs) from E-REDES — over 1,000 substations across the district, each showing whether it's operational, impaired, or offline. Second, telecom antennas mapped by operator: MEO, NOS, Vodafone, and DIGI. Citizens can see which carrier has coverage in their area at a glance. Third, low-voltage electrical poles (there are thousands) ingested via a cron job that processes E-REDES data. Fourth, and most importantly: citizen reports.

Because official data only tells part of the story. A transformer might show as "operational" but a downed line two blocks away leaves fifty homes in the dark. That's where crowdsourcing comes in. Anyone visiting Rede Sentinela can drop a pin on the map, upload a photo, and describe the problem: a fallen tree blocking a road, a burst water pipe, a dead cell tower. Reports are automatically classified by type — electricity, telecom, water, roads — and geotagged for municipal tracking.

But here's where it gets interesting: I integrated Anthropic's Claude Haiku to triage reports based on location context. The AI considers whether the damage affects critical infrastructure like hospitals, schools, or elderly care homes. Those get flagged as urgent. Businesses get marked important. Residential areas are normal priority. It's not perfect, but it gives emergency services a head start when triaging hundreds of incoming reports.

The dashboard also tracks recovery progress at a granular level. For electricity, I built per-substation load charts comparing actual power consumption against pre-storm baselines and projected recovery curves. You can select any of the district's major substations and see how quickly the grid is healing. For telecom, I calculate municipality-by-municipality coverage percentages by operator, so councils know exactly where connectivity gaps remain.

And because information in a disaster doesn't wait for you to be online, Rede Sentinela is a Progressive Web App. Service workers cache critical data so the dashboard works even when your connection drops. In the first week after Kristin, that mattered more than I expected.

---

## How It's Built: Technical Deep-Dive

Rede Sentinela runs on Next.js 16 using the App Router, TypeScript for type safety, and Tailwind CSS v4 for a responsive, dark-themed interface (because who needs a blinding white screen during a power outage?). The frontend is entirely client-side rendered to keep infrastructure costs near zero — civic tech shouldn't require VC funding to survive.

The backend is a series of serverless API routes, each responsible for one data source. The electricity route hits E-REDES's OpenDataSoft API to fetch current outages and scheduled maintenance work, then normalizes the response. The weather route pulls IPMA warnings and five-day forecasts for Leiria. Telecom and water routes perform HEAD checks against operator websites and municipal services to verify uptime, with some light HTML scraping for availability pages. The recovery route aggregates data from five government platforms, including ANEPC incident tracking and CCDR-C (the regional coordination commission) recovery programs.

Every API route uses `Promise.allSettled` for resilience — if one data source fails, the others keep flowing. External fetches are wrapped in `AbortController` with 5-8 second timeouts to prevent hanging requests. The whole stack is designed to fail gracefully, because disaster infrastructure can't afford brittleness.

For persistent data — citizen reports, damage locations, photo uploads — I use PostgreSQL hosted on Neon's serverless platform with Drizzle ORM. Reports include coordinates, timestamps, classification tags, and an AI-assigned priority. Photos are uploaded to cloud storage and linked to reports via UUID.

The map is built with Leaflet and React Leaflet, using marker clustering to keep performance smooth when rendering thousands of points. I wrote custom cron jobs (using Next.js scheduled routes) to ingest E-REDES pole data, IPMA forecasts, ANEPC active incidents, and ANACOM antenna locations. The pole ingestion job alone processes tens of thousands of records every six hours, streaming data via JSONL to avoid memory overload.

For the AI triage, I send each citizen report to Claude Haiku via Anthropic's API with structured context: the report text, location coordinates, and a classification prompt. Haiku returns a priority level and reasoning in JSON format. It takes about 200-400ms per report. Fast enough for real-time use, cheap enough to run on every submission.

The whole thing is deployed on Vercel with edge caching where appropriate. Most API routes revalidate every 5-10 minutes using Next.js's `fetch` cache controls. Telecom and water checks run fresh every time because uptime changes fast.

And here's the kicker: *no API keys are required to access any of this data*. E-REDES, IPMA, ANEPC, ANACOM — all of it is publicly accessible. Rede Sentinela just makes it usable.

---

## Open Data & Civic Tech: Why This Matters

This project exists because Portugal has made a commitment to open government data. E-REDES doesn't have to publish real-time outage APIs, but they do. IPMA could lock weather warnings behind credentials, but they don't. ANEPC shares active incident data without gatekeeping. That openness creates space for civic hackers like me to build tools that genuinely help people.

Rede Sentinela proves that a single developer, working alone over a few intense weeks, can build meaningful infrastructure when the data is accessible. I didn't need special access, insider connections, or a government contract. I just needed public APIs, documentation (sometimes sparse, but workable), and the will to glue it all together.

This is the promise of civic tech: democratizing information so communities can respond to their own crises. But it only works when governments commit to transparency. Every closed dataset, every paywalled API, every "contact us for access" form is a barrier between citizens and the tools they need to stay safe.

---

## What's Next

Rede Sentinela launched two weeks after Storm Kristin hit. In that time, it's logged thousands of visits from residents across Leiria district, dozens of citizen reports, and interest from municipal councils looking to integrate it into their own recovery coordination. I'm reaching out to local governments now, offering to collaborate on feature additions or data sharing.

The platform is designed to be adapted. Change the API endpoints, swap the geographic scope, and you have a disaster response tool for any region. Floods in the North, wildfires in the South, earthquakes in the Azores — the architecture is the same. I'd love to see this forked and redeployed elsewhere in Portugal or beyond.

I'm also working on expanding coverage: integrating road closure data from IMT (the mobility institute), adding Red Cross shelter locations, and exploring partnerships with volunteer networks for on-the-ground verification of citizen reports.

---

## Made with Love from Leiria

Storm Kristin reminded me that code isn't just about building products or optimizing funnels. Sometimes it's about helping your neighbors find out if the pharmacy down the street has power. Or letting an elderly person's family check if their town's water is safe. Or giving overwhelmed municipal workers a single screen instead of twenty browser tabs.

Rede Sentinela is my love letter to Leiria — a city that raised me, weathered a storm, and deserves every tool we can build to recover stronger.

If you want to explore the dashboard, check out [redesentinela.com](https://redesentinela.com). The code is born from urgency, refined through iteration, and offered in service.

Because when disaster strikes, information isn't just power. It's shelter.

---

*Joni Oliveira is a developer from Leiria, Portugal, building civic tech tools at the intersection of open data and community resilience.*
