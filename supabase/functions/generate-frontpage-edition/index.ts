// generate-frontpage-edition
//
// Generates a daily AI-powered newspaper edition for each league via Groq.
//
// Two invocation modes:
//   CRON  — body: { "mode": "cron" }         service-role JWT, processes all active leagues
//   MANUAL— body: { "league_id": "uuid" }    user JWT, commissioner only, rate-limited 1/4h
//
// Skip logic (cron): if a league already has is_manual=true AND generated_at > now()-12h,
// skip it — a fresh special edition was just published.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logError } from '../_shared/log.ts';

const FN             = 'generate-frontpage-edition';
const GROQ_URL       = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL     = 'llama-3.1-8b-instant';
const RATE_LIMIT_MS  = 4 * 60 * 60 * 1000;   // 4h between manual triggers
const CRON_SKIP_MS   = 12 * 60 * 60 * 1000;  // skip cron if manual edition < 12h old

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

function today(): string {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

// ── Groq call ─────────────────────────────────────────────────────────────────

async function callGroq(userPrompt: string): Promise<Record<string, string | null>> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) throw new Error('GROQ_API_KEY secret not configured');

  const resp = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:           GROQ_MODEL,
      temperature:     0.85,
      max_tokens:      500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are the editor of the Forza Times, a fantasy football league newspaper. ' +
            'Write in a British sports tabloid voice — punchy, snarky, funny but never vicious or personal. ' +
            'Always reference real manager names from the data provided. ' +
            'Respond ONLY with valid JSON.',
        },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Groq ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty Groq response');

  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`Groq returned invalid JSON: ${content.slice(0, 200)}`);
  }
}

// ── Data collection ───────────────────────────────────────────────────────────

async function collectData(sb: ReturnType<typeof createClient>, league: { id: string; name: string; tournament_id: string }) {
  const since24h  = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const next48h   = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const [
    { data: members },
    { data: rawTransfers },
    { data: chatRows },
    { data: fixtures },
    { data: gazetteRows },
    { data: configRows },
  ] = await Promise.all([
    // Standings top 7 (show top 5 + bottom 1 in prompt)
    sb.from('league_members')
      .select('user_id, total_points, rank')
      .eq('league_id', league.id)
      .order('rank', { ascending: true })
      .limit(7),

    // Transfers last 24h (player IDs — names fetched below)
    sb.from('transfers')
      .select('user_id, player_in, player_out, transferred_at')
      .eq('league_id', league.id)
      .gte('transferred_at', since24h)
      .order('transferred_at', { ascending: false })
      .limit(5),

    // Chat — last 3 non-deleted messages
    sb.from('chat_messages')
      .select('message, user_id')
      .eq('league_id', league.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(3),

    // Upcoming fixtures next 48h for this tournament
    sb.from('fixtures')
      .select('home_team, away_team, kickoff_at')
      .eq('tournament_id', league.tournament_id)
      .eq('status', 'scheduled')
      .lte('kickoff_at', next48h)
      .gte('kickoff_at', new Date().toISOString())
      .order('kickoff_at')
      .limit(4),

    // Commissioner content + latest scores
    sb.from('gazette_entries')
      .select('entry_type, headline')
      .eq('league_id', league.id)
      .in('entry_type', ['breaking_news', 'classified', 'activity'])
      .order('published_at', { ascending: false })
      .limit(9),

    // Pinned quote from league_config
    sb.from('league_config')
      .select('config_key, config_value')
      .eq('league_id', league.id)
      .in('config_key', ['frontpage_pinned_quote', 'frontpage_pinned_quote_author']),
  ]);

  // Batch-fetch usernames for all relevant user_ids
  const userIdSet = new Set<string>([
    ...(members ?? []).map((m: { user_id: string }) => m.user_id),
    ...(rawTransfers ?? []).map((t: { user_id: string }) => t.user_id),
    ...(chatRows ?? []).map((c: { user_id: string }) => c.user_id),
  ]);
  const { data: userRows } = await sb
    .from('users')
    .select('id, username')
    .in('id', [...userIdSet]);
  const userMap: Record<string, string> = Object.fromEntries(
    (userRows ?? []).map((u: { id: string; username: string }) => [u.id, u.username])
  );

  // Batch-fetch player names for transfers
  const playerIdSet = new Set<string>();
  for (const t of (rawTransfers ?? []) as { player_in?: string; player_out?: string }[]) {
    if (t.player_in)  playerIdSet.add(t.player_in);
    if (t.player_out) playerIdSet.add(t.player_out);
  }
  let playerMap: Record<string, { name: string; position: string }> = {};
  if (playerIdSet.size > 0) {
    const { data: playerRows } = await sb
      .from('players')
      .select('id, name, position')
      .in('id', [...playerIdSet]);
    playerMap = Object.fromEntries(
      (playerRows ?? []).map((p: { id: string; name: string; position: string }) => [p.id, p])
    );
  }

  const configMap: Record<string, string> = Object.fromEntries(
    (configRows ?? []).map((r: { config_key: string; config_value: unknown }) => [r.config_key, String(r.config_value)])
  );

  return { members, rawTransfers, chatRows, fixtures, gazetteRows, configMap, userMap, playerMap };
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(
  league: { id: string; name: string },
  data: Awaited<ReturnType<typeof collectData>>
): { prompt: string; rawInput: Record<string, unknown> } {
  const { members, rawTransfers, chatRows, fixtures, gazetteRows, configMap, userMap, playerMap } = data;

  // Standings
  const sortedMembers = (members ?? []) as { user_id: string; total_points: number; rank: number }[];
  const top5 = sortedMembers.slice(0, 5);
  const bottom = sortedMembers[sortedMembers.length - 1];
  const standingsLines = top5.map((m, i) =>
    `${i + 1}. ${userMap[m.user_id] ?? 'Unknown'} — ${Math.round(m.total_points ?? 0)} pts`
  );
  if (bottom && bottom.user_id !== top5[top5.length - 1]?.user_id) {
    standingsLines.push(`Last: ${userMap[bottom.user_id] ?? 'Unknown'} — ${Math.round(bottom.total_points ?? 0)} pts`);
  }

  // Transfers
  const transfers = (rawTransfers ?? []) as { user_id: string; player_in?: string; player_out?: string }[];
  const transferLines = transfers.map(t => {
    const mgr  = userMap[t.user_id] ?? 'A manager';
    const pIn  = t.player_in  ? playerMap[t.player_in]?.name  : null;
    const pOut = t.player_out ? playerMap[t.player_out]?.name : null;
    if (pIn && pOut) return `${mgr} swapped out ${pOut} and brought in ${pIn}`;
    if (pIn)         return `${mgr} signed ${pIn}`;
    if (pOut)        return `${mgr} sold ${pOut}`;
    return null;
  }).filter(Boolean);

  // Chat
  const chatLines = (chatRows ?? []).map(
    (c: { message: string; user_id: string }) => `"${c.message}" — ${userMap[c.user_id] ?? 'Unknown'}`
  );

  // Fixtures
  const fixtureLines = (fixtures ?? []).map((f: { home_team: string; away_team: string; kickoff_at: string }) => {
    const d = new Date(f.kickoff_at);
    const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) +
      ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${f.home_team} vs ${f.away_team} — ${label}`;
  });

  // Gazette split by type
  const gazette = (gazetteRows ?? []) as { entry_type: string; headline: string }[];
  const newsLines       = gazette.filter(e => e.entry_type === 'breaking_news').slice(0, 3).map(e => `• ${e.headline}`);
  const classifiedLines = gazette.filter(e => e.entry_type === 'classified').slice(0, 3).map(e => `• ${e.headline}`);
  const lastScores      = gazette.find(e => e.entry_type === 'activity');

  // Pinned quote
  const pinnedQuote  = configMap['frontpage_pinned_quote'];
  const pinnedAuthor = configMap['frontpage_pinned_quote_author'];

  const rawInput = {
    standings:    standingsLines,
    transfers:    transferLines,
    chat:         chatLines,
    fixtures:     fixtureLines,
    news:         newsLines,
    classifieds:  classifiedLines,
    lastScores:   lastScores?.headline ?? null,
    pinnedQuote:  pinnedQuote ?? null,
    memberCount:  sortedMembers.length,
  };

  const prompt = `Generate a newspaper edition for the fantasy football league "${league.name}" (${sortedMembers.length} managers).

STANDINGS:
${standingsLines.join('\n') || 'Season not yet started.'}

LAST 24H TRANSFERS:
${transferLines.length ? transferLines.join('\n') : 'No transfers in the last 24 hours.'}

LATEST ROUND SCORES:
${lastScores?.headline ?? 'No completed rounds yet.'}

UPCOMING FIXTURES (next 48h):
${fixtureLines.length ? fixtureLines.join('\n') : 'No fixtures in the next 48 hours.'}

RECENT LEAGUE CHAT:
${chatLines.length ? chatLines.join('\n') : 'League chat is quiet.'}

COMMISSIONER BULLETINS:
${newsLines.length ? newsLines.join('\n') : 'None.'}

${classifiedLines.length ? 'CLASSIFIEDS:\n' + classifiedLines.join('\n') : ''}
${pinnedQuote ? `\nPINNED QUOTE OF THE WEEK: "${pinnedQuote}" — ${pinnedAuthor ?? 'The Commissioner'}` : ''}

Respond ONLY with a valid JSON object with exactly these keys:
{
  "headline": "ALL-CAPS PUNCHY TABLOID HEADLINE, MAX 65 CHARACTERS",
  "deck": "2-3 sentence article intro. Mention real manager names. Snarky but fair. Max 220 chars.",
  "hot_take": "One provocative observation about the league. Max 90 chars.",
  "wooden_spoon": "Gentle roast of the bottom-table manager by name. Max 90 chars.",
  "transfer_rumour": "Tabloid spin on any transfer from the last 24h. Max 110 chars. Use null if no transfers."
}`;

  return { prompt, rawInput };
}

// ── Write edition to DB ───────────────────────────────────────────────────────

async function writeEdition(
  sb: ReturnType<typeof createClient>,
  leagueId: string,
  generated: Record<string, string | null>,
  rawInput: Record<string, unknown>,
  isManual: boolean
) {
  const editionDate = today();

  // Check if a row already exists for today (to preserve edition_number)
  const { data: existing } = await sb
    .from('frontpage_editions')
    .select('id, edition_number')
    .eq('league_id', leagueId)
    .eq('edition_date', editionDate)
    .maybeSingle();

  if (existing) {
    await sb
      .from('frontpage_editions')
      .update({
        headline:        generated.headline ?? null,
        deck:            generated.deck ?? null,
        hot_take:        generated.hot_take ?? null,
        wooden_spoon:    generated.wooden_spoon ?? null,
        transfer_rumour: generated.transfer_rumour ?? null,
        raw_input:       rawInput,
        is_manual:       isManual,
        generated_at:    new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    // Compute next edition number for this league
    const { count } = await sb
      .from('frontpage_editions')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', leagueId);

    await sb
      .from('frontpage_editions')
      .insert({
        league_id:       leagueId,
        edition_date:    editionDate,
        edition_number:  (count ?? 0) + 1,
        headline:        generated.headline ?? null,
        deck:            generated.deck ?? null,
        hot_take:        generated.hot_take ?? null,
        wooden_spoon:    generated.wooden_spoon ?? null,
        transfer_rumour: generated.transfer_rumour ?? null,
        raw_input:       rawInput,
        is_manual:       isManual,
        generated_at:    new Date().toISOString(),
      });
  }
}

// ── Generate for one league ───────────────────────────────────────────────────

async function generateForLeague(
  sb: ReturnType<typeof createClient>,
  league: { id: string; name: string; tournament_id: string },
  isManual: boolean
) {
  const data = await collectData(sb, league);
  const { prompt, rawInput } = buildPrompt(league, data);
  const generated = await callGroq(prompt);
  await writeEdition(sb, league.id, generated, rawInput, isManual);
  console.log(`[${FN}] Generated edition for league ${league.id} (${league.name})`);
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const isCronMode = body.mode === 'cron';

    // ── CRON mode ─────────────────────────────────────────────────────────────
    if (isCronMode) {
      // Collect all leagues with >1 member
      const { data: memberRows } = await sb
        .from('league_members')
        .select('league_id, leagues(id, name, tournament_id)');

      const leagueMap: Record<string, { info: { id: string; name: string; tournament_id: string }; count: number }> = {};
      for (const row of (memberRows ?? []) as { league_id: string; leagues: { id: string; name: string; tournament_id: string } }[]) {
        if (!row.leagues) continue;
        if (!leagueMap[row.league_id]) leagueMap[row.league_id] = { info: row.leagues, count: 0 };
        leagueMap[row.league_id].count++;
      }
      const activeLeagues = Object.values(leagueMap)
        .filter(l => l.count > 1)
        .map(l => l.info);

      const results = { processed: 0, skipped: 0, errors: 0 };

      // 15s between leagues keeps token usage ~3,600 TPM — well under Groq's 6,000 TPM limit
      const INTER_LEAGUE_DELAY_MS = 15_000;

      for (let i = 0; i < activeLeagues.length; i++) {
        const league = activeLeagues[i];
        if (i > 0) await new Promise(resolve => setTimeout(resolve, INTER_LEAGUE_DELAY_MS));

        try {
          // Skip if a manual edition was generated in the last 12h
          const { data: todayEdition } = await sb
            .from('frontpage_editions')
            .select('is_manual, generated_at')
            .eq('league_id', league.id)
            .eq('edition_date', today())
            .maybeSingle();

          if (todayEdition?.is_manual) {
            const hoursSince = (Date.now() - new Date(todayEdition.generated_at).getTime()) / 3_600_000;
            if (hoursSince < 12) {
              console.log(`[${FN}] Skipping ${league.id} — manual edition ${hoursSince.toFixed(1)}h ago`);
              results.skipped++;
              continue;
            }
          }

          await generateForLeague(sb, league, false);
          results.processed++;
        } catch (err) {
          results.errors++;
          await logError(FN, 'error', `Failed for league ${league.id}: ${(err as Error).message}`, { league_id: league.id });
        }
      }

      return json({ ok: true, ...results }, 200, corsHeaders);
    }

    // ── MANUAL mode (commissioner trigger) ────────────────────────────────────
    const leagueId = body.league_id as string | undefined;
    if (!leagueId) return json({ ok: false, error: 'league_id required' }, 400, corsHeaders);

    // Verify caller is a commissioner
    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ ok: false, error: 'Unauthorised' }, 401, corsHeaders);

    const { data: membership } = await sb
      .from('league_members')
      .select('role')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membership?.role !== 'commissioner') {
      return json({ ok: false, error: 'Forbidden — commissioners only' }, 403, corsHeaders);
    }

    // Rate limit: max 1 manual trigger per 4h
    const { data: recentManual } = await sb
      .from('frontpage_editions')
      .select('generated_at')
      .eq('league_id', leagueId)
      .eq('is_manual', true)
      .gte('generated_at', new Date(Date.now() - RATE_LIMIT_MS).toISOString())
      .maybeSingle();

    if (recentManual) {
      const hoursSince = (Date.now() - new Date(recentManual.generated_at).getTime()) / 3_600_000;
      return json({
        ok: false,
        error: `Special edition already published ${hoursSince.toFixed(1)}h ago. Next one available in ${(4 - hoursSince).toFixed(1)}h.`,
      }, 429, corsHeaders);
    }

    // Fetch league info
    const { data: leagueRow } = await sb
      .from('leagues')
      .select('id, name, tournament_id')
      .eq('id', leagueId)
      .maybeSingle();

    if (!leagueRow) return json({ ok: false, error: 'League not found' }, 404, corsHeaders);

    await generateForLeague(sb, leagueRow as { id: string; name: string; tournament_id: string }, true);

    return json({ ok: true, message: 'Special edition published' }, 200, corsHeaders);

  } catch (err) {
    await logError(FN, 'critical', (err as Error).message);
    return json({ ok: false, error: 'Internal error' }, 500);
  }
});
