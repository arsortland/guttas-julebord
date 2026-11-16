// Vercel Function: lagrer og henter stemmer i Upstash Redis (REST API).
// Miljøvariablene settes automatisk når Upstash Redis kobles til prosjektet i Vercel.

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const VOTES = 'julebord:votes';
const PLACES = 'julebord:places';
const DATE_IDS = ['2026-12-04', '2026-12-05', '2026-12-11', '2026-12-12', '2026-12-18', '2026-12-19'];
const MAX_VOTERS = 200;
const MAX_PLACES = 40;

async function redis(commands) {
  const res = await fetch(`${REDIS_URL.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Redis svarte ${res.status}`);
  const out = await res.json();
  const failed = out.find((r) => r.error);
  if (failed) throw new Error(failed.error);
  return out.map((r) => r.result);
}

// HGETALL kommer som flat liste [felt, verdi, felt, verdi, ...]
function parseHash(flat) {
  const items = [];
  for (let i = 0; i + 1 < (flat || []).length; i += 2) {
    try {
      items.push({ id: flat[i], ...JSON.parse(flat[i + 1]) });
    } catch {
      /* hopp over ødelagte rader */
    }
  }
  return items;
}

async function readState() {
  const [votes, places] = await redis([['HGETALL', VOTES], ['HGETALL', PLACES]]);
  return {
    votes: parseHash(votes).sort((a, b) => (a.at || 0) - (b.at || 0)),
    places: parseHash(places).sort((a, b) => (a.at || 0) - (b.at || 0)),
  };
}

const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const placeId = (name) =>
  name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export default {
  async fetch(request) {
    if (!REDIS_URL || !REDIS_TOKEN) {
      return json({ error: 'Databasen er ikke koblet til ennå (mangler Upstash Redis i Vercel).' }, 503);
    }
    try {
      if (request.method === 'GET') return json(await readState());
      if (request.method !== 'POST') return json({ error: 'Metoden støttes ikke.' }, 405);

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Ugyldig forespørsel.' }, 400);
      }

      if (body.action === 'vote') {
        const voterId = clean(body.voterId, 40);
        const name = clean(body.name, 30);
        if (!/^[a-zA-Z0-9-]{8,40}$/.test(voterId)) return json({ error: 'Ugyldig velger-ID.' }, 400);
        if (!name) return json({ error: 'Skriv inn navnet ditt først.' }, 400);

        const state = await readState();
        const known = state.votes.some((v) => v.id === voterId);
        if (!known && state.votes.length >= MAX_VOTERS) return json({ error: 'Avstemningen er full.' }, 400);

        const placeIds = new Set(state.places.map((p) => p.id));
        const dates = [...new Set(Array.isArray(body.dates) ? body.dates : [])].filter((d) => DATE_IDS.includes(d));
        const places = [...new Set(Array.isArray(body.places) ? body.places : [])].filter((p) => placeIds.has(p));
        const at = state.votes.find((v) => v.id === voterId)?.at || Date.now();

        await redis([['HSET', VOTES, voterId, JSON.stringify({ name, dates, places, at })]]);
        return json(await readState());
      }

      if (body.action === 'addPlace') {
        const name = clean(body.name, 50);
        const id = placeId(name);
        if (!id) return json({ error: 'Skriv inn et stedsnavn.' }, 400);
        const state = await readState();
        if (!state.places.some((p) => p.id === id)) {
          if (state.places.length >= MAX_PLACES) return json({ error: 'Det er nok forslag nå.' }, 400);
          // HSETNX: to som foreslår samme sted samtidig gir bare ett forslag
          await redis([['HSETNX', PLACES, id, JSON.stringify({ name, at: Date.now() })]]);
        }
        return json({ ...(await readState()), placeId: id });
      }

      return json({ error: 'Ukjent handling.' }, 400);
    } catch (err) {
      console.error(err);
      return json({ error: 'Noe gikk galt mot databasen. Prøv igjen.' }, 500);
    }
  },
};
