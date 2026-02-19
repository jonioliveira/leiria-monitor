# When Your Hometown Gets Hit: Building a Civic Tech Response to Storm Kristin

*How one developer built an outage reporting system to help Leiria's communities recover*

---

On January 28, 2026, Storm Kristin carved a path of destruction through Portugal's Leiria district. I watched from my apartment as winds tore through streets I'd walked my entire life, ripping down power lines, snapping poles, and severing the infrastructure that connects fifteen municipalities to the modern world. The storm passed in hours, but the aftermath lingered for days — and with it, a gnawing uncertainty that felt worse than the physical damage.

Was the power back in my parents' neighborhood? Which roads were still blocked? Could my friend across town even call for help if she needed to? People were sharing screenshots of screenshots. Elderly relatives were calling anyone who might know anything. The chaos wasn't just physical; it was informational.

That's when the developer instinct kicked in: *what if people could just report what's broken, and everyone could see it?*

---

## The Idea: Let Citizens Report, Let Authorities See

I'm Joni Oliveira, a developer from Leiria. I've spent years building apps and tools, but nothing felt as urgent as this. The problem wasn't that data didn't exist — it was that nobody had a simple way to say "this specific thing is broken in this specific place" and have that information reach the people who could fix it.

So I built Rede Sentinela — the "Sentinel Network" — an outage reporting system where citizens can identify problems with electricity, communications, water, and road cuts across the Leiria district.

---

## What Rede Sentinela Does

At its core, Rede Sentinela is a reporting platform. Anyone can drop a pin on the map, describe the problem, upload a photo, and classify the issue: electricity outage, communication failure, water supply problem, or road cut. Reports are geotagged and timestamped automatically.

The real value is in the aggregation. All citizen reports flow into dashboards organized by council and by parish. A câmara municipal can open their council's dashboard and immediately see: how many electricity reports this week, where communication failures are clustered, which parishes have water issues. Instead of fielding hundreds of individual phone calls and Facebook messages, they get structured, geographic data.

The interactive map layers citizen reports alongside infrastructure data — power substations, telecom antennas, and low-voltage poles — so authorities can cross-reference what citizens are reporting with the underlying infrastructure. A cluster of electricity reports near a specific substation tells a very different story than scattered reports across multiple parishes.

Because information in a disaster doesn't wait for you to be online, Rede Sentinela is a Progressive Web App. It installs on phones like a native app, making it practical for field use by both citizens and municipal workers.

Data is updated daily, and the platform is completely free.

---

## How It's Built: Technical Deep-Dive

Rede Sentinela runs on Next.js 16 using the App Router, TypeScript for type safety, and Tailwind CSS v4 for a responsive, dark-themed interface. The frontend is client-side rendered to keep infrastructure costs near zero — civic tech shouldn't require VC funding to survive.

For persistent data — citizen reports, damage locations, photo uploads — I use PostgreSQL hosted on Neon's serverless platform with Drizzle ORM. Reports include coordinates, timestamps, classification tags, and priority levels. Photos are uploaded to cloud storage and linked to reports via UUID.

The map is built with Leaflet and React Leaflet, using marker clustering to keep performance smooth when rendering thousands of points. Infrastructure data — substations, antennas, poles — is ingested from public sources and displayed as toggleable layers.

The dashboard pages are organized per council and per parish, aggregating report counts and types to give local authorities a practical overview of what's happening in their area.

The whole thing is deployed on Vercel. No API keys or special access required to use it.

---

## Open Data & Civic Tech: Why This Matters

This project proves that a single developer, working alone over a few intense weeks, can build meaningful infrastructure when the will is there. I didn't need special access, insider connections, or a government contract. I just needed open mapping data, a database, and the determination to make reporting easy.

Civic tech works when it solves a real problem simply. Rede Sentinela doesn't try to replace official channels — it complements them by giving citizens a voice and giving authorities visibility. A farmer in a rural parish can report a downed power line with a photo, and the junta de freguesia can see it on their dashboard within the day.

---

## What's Next

Rede Sentinela launched shortly after Storm Kristin hit. It now covers all 15 municipalities across the Leiria district. I'm reaching out to local governments, offering to collaborate on features or data sharing.

The platform is designed to be adapted. Change the geographic scope and you have an outage reporting tool for any region. Floods in the North, wildfires in the South, earthquakes in the Azores — the need to report and track infrastructure damage is universal.

---

## Made with Love from Leiria

Storm Kristin reminded me that code isn't just about building products or optimizing funnels. Sometimes it's about giving your neighbors a way to say "this is broken" and making sure someone sees it. Or giving overwhelmed municipal workers a single dashboard instead of hundreds of phone calls.

Rede Sentinela is my contribution to Leiria — a city that raised me, weathered a storm, and deserves every tool we can build to recover stronger.

If you want to try the platform, visit [redesentinela.com](https://redesentinela.com). Report what's broken. Help your community recover.

Because when disaster strikes, the first step to fixing something is knowing it's broken.

---

*Joni Oliveira is a developer from Leiria, Portugal, building civic tech tools for community resilience.*
