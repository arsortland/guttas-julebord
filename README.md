# Guttas julebord 2026

Avstemning for dato (fredag/lørdag i uke 49, 50 og 51) og sted, med resultater som oppdateres fortløpende for alle.

- `index.html` – selve siden (ingen byggesteg)
- `api/poll.js` – Vercel Function som lagrer stemmer i Upstash Redis

## Publisering på Vercel

1. Importer dette repoet på vercel.com/new (Framework Preset: **Other**, ingen build-kommando).
2. I prosjektet: **Storage → Create Database → Upstash for Redis** (gratisplan) og koble den til prosjektet.
   Det setter `KV_REST_API_URL` og `KV_REST_API_TOKEN` automatisk.
3. **Redeploy** siste deployment slik at funksjonen får miljøvariablene.
4. Del `https://<prosjekt>.vercel.app` i Messenger-gruppa.

Alle med lenken kan stemme. Hver nettleser får en tilfeldig velger-ID, så man kan endre egne svar fra samme enhet.
