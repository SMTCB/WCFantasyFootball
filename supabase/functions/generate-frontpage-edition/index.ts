// generate-frontpage-edition
//
// Generates a daily AI-powered newspaper edition via Groq.
//
// Three invocation modes:
//   CRON   — body: { "mode": "cron" }          service-role JWT, processes all leagues + circles
//   LEAGUE — body: { "league_id": "uuid" }      user JWT, commissioner only, rate-limited 1/4h
//   CIRCLE — body: { "circle_id": "uuid" }      user JWT, Clubhouse owner only, rate-limited 1/4h

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logError } from '../_shared/log.ts';

const FN             = 'generate-frontpage-edition';
const GROQ_URL       = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL     = 'llama-3.1-8b-instant';
const RATE_LIMIT_MS  = 4 * 60 * 60 * 1000;
const CRON_SKIP_MS   = 12 * 60 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

function today(): string {
  return new Date().toISOString().split('T')[0];
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
            'You are the editor of the Forza Times, a multi-sport fantasy newspaper. ' +
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

// ── League data collection ────────────────────────────────────────────────────

async function collectLeagueData(sb: ReturnType<typeof createClient>, league: { id: string; name: string; tournament_id: string }) {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const next48h  = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const [
    { data: members },
    { data: rawTransfers },
    { data: chatRows },
    { data: fixtures },
    { data: gazetteRows },
    { data: configRows },
  ] = await Promise.all([
    sb.from('league_members').select('user_id, total_points, rank').eq('league_id', league.id).order('rank', { ascending: true }).limit(7),
    sb.from('transfers').select('user_id, player_in, player_out, transferred_at').eq('league_id', league.id).gte('transferred_at', since24h).order('transferred_at', { ascending: false }).limit(5),
    sb.from('chat_messages').select('message, user_id').eq('league_id', league.id).or('is_deleted.eq.false,is_deleted.is.null').order('created_at', { ascending: false }).limit(3),
    sb.from('fixtures').select('home_team, away_team, kickoff_at').eq('tournament_id', league.tournament_id).eq('status', 'scheduled').lte('kickoff_at', next48h).gte('kickoff_at', new Date().toISOString()).order('kickoff_at').limit(4),
    sb.from('gazette_entries').select('entry_type, headline').eq('league_id', league.id).in('entry_type', ['breaking_news', 'classified', 'activity']).order('published_at', { ascending: false }).limit(9),
    sb.from('league_config').select('config_key, config_value').eq('league_id', league.id).in('config_key', ['frontpage_pinned_quote', 'frontpage_pinned_quote_author']),
  ]);

  const userIdSet = new Set<string>([
    ...(members ?? []).map((m: { user_id: string }) => m.user_id),
    ...(rawTransfers ?? []).map((t: { user_id: string }) => t.user_id),
    ...(chatRows ?? []).map((c: { user_id: string }) => c.user_id),
  ]);
  const { data: userRows } = await sb.from('users').select('id, username').in('id', [...userIdSet]);
  const userMap: Record<string, string> = Object.fromEntries(
    (userRows ?? []).map((u: { id: string; username: string }) => [u.id, u.username])
  );

  const playerIdSet = new Set<string>();
  for (const t of (rawTransfers ?? []) as { player_in?: string; player_out?: string }[]) {
    if (t.player_in)  playerIdSet.add(t.player_in);
    if (t.player_out) playerIdSet.add(t.player_out);
  }
  let playerMap: Record<string, { name: string; position: string }> = {};
  if (playerIdSet.size > 0) {
    const { data: playerRows } = await sb.from('players').select('id, name, position').in('id', [...playerIdSet]);
    playerMap = Object.fromEntries(
      (playerRows ?? []).map((p: { id: string; name: string; position: string }) => [p.id, p])
    );
  }

  const configMap: Record<string, string> = Object.fromEntries(
    (configRows ?? []).map((r: { config_key: string; config_value: unknown }) => [r.config_key, String(r.config_value)])
  );

  return { members, rawTransfers, chatRows, fixtures, gazetteRows, configMap, userMap, playerMap };
}

// ── League prompt builder ─────────────────────────────────────────────────────

function buildLeaguePrompt(
  league: { id: string; name: string },
  data: Awaited<ReturnType<typeof collectLeagueData>>
): { prompt: string; rawInput: Record<string, unknown> } {
  const { members, rawTransfers, chatRows, fixtures, gazetteRows, configMap, userMap, playerMap } = data;

  const sortedMembers = (members ?? []) as { user_id: string; total_points: number; rank: number }[];
  const top5 = sortedMembers.slice(0, 5);
  const bottom = sortedMembers[sortedMembers.length - 1];
  const standingsLines = top5.map((m, i) =>
    `${i + 1}. ${userMap[m.user_id] ?? 'Unknown'} — ${Math.round(m.total_points ?? 0)} pts`
  );
  if (bottom && bottom.user_id !== top5[top5.length - 1]?.user_id) {
    standingsLines.push(`Last: ${userMap[bottom.user_id] ?? 'Unknown'} — ${Math.round(bottom.total_points ?? 0)} pts`);
  }

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

  const chatLines = (chatRows ?? []).map(
    (c: { message: string; user_id: string }) => `"${c.message}" — ${userMap[c.user_id] ?? 'Unknown'}`
  );

  const fixtureLines = (fixtures ?? []).map((f: { home_team: string; away_team: string; kickoff_at: string }) => {
    const d = new Date(f.kickoff_at);
    const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) +
      ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${f.home_team} vs ${f.away_team} — ${label}`;
  });

  const gazette = (gazetteRows ?? []) as { entry_type: string; headline: string }[];
  const newsLines       = gazette.filter(e => e.entry_type === 'breaking_news').slice(0, 3).map(e => `• ${e.headline}`);
  const classifiedLines = gazette.filter(e => e.entry_type === 'classified').slice(0, 3).map(e => `• ${e.headline}`);
  const lastScores      = gazette.find(e => e.entry_type === 'activity');

  const pinnedQuote  = configMap['frontpage_pinned_quote'];
  const pinnedAuthor = configMap['frontpage_pinned_quote_author'];

  const rawInput = {
    standings: standingsLines, transfers: transferLines, chat: chatLines,
    fixtures: fixtureLines, news: newsLines, classifieds: classifiedLines,
    lastScores: lastScores?.headline ?? null, pinnedQuote: pinnedQuote ?? null,
    memberCount: sortedMembers.length,
  };

  const prompt = `Generate a newspaper edition for the fantasy football league "${league.name}" (${sortedMembers.length} managers).

OVERALL STANDINGS:
${standingsLines.join('\n') || 'Season not yet started.'}

LAST 24H TRANSFERS:
${transferLines.length ? transferLines.join('\n') : 'No transfers in the last 24 hours.'}

LAST COMPLETED GAMEWEEK:
${lastScores?.headline ?? 'No completed rounds yet.'}

UPCOMING FIXTURES (next 48h):
${fixtureLines.length ? fixtureLines.join('\n') : 'No fixtures in the next 48 hours.'}

RECENT CHAT:
${chatLines.length ? chatLines.join('\n') : 'League chat is quiet.'}

COMMISSIONER BULLETINS:
${newsLines.length ? newsLines.join('\n') : 'None.'}
${classifiedLines.length ? '\nCLASSIFIEDS:\n' + classifiedLines.join('\n') : ''}
${pinnedQuote ? `\nPINNED QUOTE: "${pinnedQuote}" — ${pinnedAuthor ?? 'The Commissioner'}` : ''}

Base headline/hot_take on overall standings. wooden_spoon = the LAST-PLACED manager.

Respond ONLY with valid JSON:
{
  "headline": "ALL-CAPS PUNCHY TABLOID HEADLINE, MAX 65 CHARACTERS",
  "deck": "2-3 sentence article intro. Mention the overall leader by name. Snarky but fair. Weave in a chat quote or banter if there are recent messages. Max 220 chars.",
  "hot_take": "One provocative observation — riff on the recent league chat or current standings form. Max 90 chars.",
  "wooden_spoon": "Gentle roast of the BOTTOM-TABLE manager (last in standings) by name. Max 90 chars.",
  "transfer_rumour": "Tabloid spin on any transfer from the last 24h. Max 110 chars. Use null if no transfers."
}`;

  return { prompt, rawInput };
}

// ── Circle data collection ────────────────────────────────────────────────────

async function collectCircleData(sb: ReturnType<typeof createClient>, circleId: string) {
  const next48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const [{ data: clRows }, { data: cpRows }] = await Promise.all([
    sb.from('circle_leagues').select('league_id, leagues(id, name, tournament_id)').eq('circle_id', circleId),
    sb.from('circle_paddocks').select('paddock_id, paddocks(id, name)').eq('circle_id', circleId),
  ]);

  const leagues = ((clRows ?? []) as { leagues: { id: string; name: string; tournament_id: string } }[])
    .map(r => r.leagues).filter(Boolean);
  const paddocks = ((cpRows ?? []) as { paddocks: { id: string; name: string } }[])
    .map(r => r.paddocks).filter(Boolean);

  // Per-league: top 3 standings + recent gazette
  const leagueDataSections = await Promise.all(leagues.map(async (league) => {
    const [{ data: members }, { data: gazette }] = await Promise.all([
      sb.from('league_members').select('user_id, total_points, rank').eq('league_id', league.id).order('rank', { ascending: true }).limit(3),
      sb.from('gazette_entries').select('headline, entry_type').eq('league_id', league.id)
        .in('entry_type', ['activity', 'breaking_news']).order('published_at', { ascending: false }).limit(2),
    ]);
    const userIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
    const { data: users } = userIds.length > 0
      ? await sb.from('users').select('id, username').in('id', userIds)
      : { data: [] };
    const userMap = Object.fromEntries((users ?? []).map((u: { id: string; username: string }) => [u.id, u.username]));
    return {
      name: league.name,
      standings: (members ?? []).map((m: { user_id: string; total_points: number }, i: number) =>
        `${i + 1}. ${userMap[m.user_id] ?? '?'} — ${Math.round(m.total_points ?? 0)} pts`
      ),
      news: (gazette ?? []).map((g: { headline: string }) => g.headline).filter(Boolean),
    };
  }));

  // Upcoming fixtures across all linked tournament_ids
  const tournamentIds = leagues.map(l => l.tournament_id).filter(Boolean);
  let fixtureLines: string[] = [];
  if (tournamentIds.length > 0) {
    const { data: fixtures } = await sb.from('fixtures')
      .select('home_team, away_team, kickoff_at')
      .in('tournament_id', tournamentIds)
      .eq('status', 'scheduled')
      .lte('kickoff_at', next48h)
      .gte('kickoff_at', new Date().toISOString())
      .order('kickoff_at').limit(5);
    fixtureLines = (fixtures ?? []).map((f: { home_team: string; away_team: string; kickoff_at: string }) => {
      const d = new Date(f.kickoff_at);
      return `${f.home_team} vs ${f.away_team} — ` +
        d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' +
        d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    });
  }

  return { leagueDataSections, paddocks, fixtureLines };
}

// ── Circle prompt builder ─────────────────────────────────────────────────────

function buildCirclePrompt(
  circleName: string,
  data: Awaited<ReturnType<typeof collectCircleData>>
): { prompt: string; rawInput: Record<string, unknown> } {
  const { leagueDataSections, paddocks, fixtureLines } = data;

  const sportBlocks = leagueDataSections.map(s => {
    const lines = [`FOOTBALL LEAGUE "${s.name}"`];
    if (s.standings.length) lines.push('  Standings: ' + s.standings.join(' | '));
    if (s.news.length) lines.push('  News: ' + s.news.join(' · '));
    return lines.join('\n');
  });

  const paddockLines = paddocks.map(p => `F1 PADDOCK: "${p.name}"`);

  const rawInput = { clubhouse: circleName, leagues: leagueDataSections, paddocks: paddocks.map(p => p.name), fixtures: fixtureLines };

  const prompt = `Generate a multi-sport Forza Times edition for "${circleName}" Clubhouse.

${sportBlocks.join('\n\n') || 'No linked leagues yet.'}
${paddockLines.length ? '\n' + paddockLines.join('\n') : ''}
${fixtureLines.length ? '\nUPCOMING FIXTURES (next 48h):\n' + fixtureLines.join('\n') : ''}

This is a cross-sport Clubhouse edition — reference all sports and competitions where relevant. British tabloid voice.

Respond ONLY with valid JSON:
{
  "headline": "ALL-CAPS TABLOID HEADLINE COVERING THE CLUBHOUSE, MAX 65 CHARS",
  "deck": "2-3 sentences on the biggest story across all sports in this Clubhouse. Max 220 chars.",
  "hot_take": "Provocative take on any league/paddock standings. Max 90 chars.",
  "wooden_spoon": "Gentle roast of the lowest-placed manager across all leagues. Max 90 chars.",
  "transfer_rumour": "Transfer gossip or paddock rumour. null if nothing to report. Max 110 chars."
}`;

  return { prompt, rawInput };
}

// ── Write edition (league) ────────────────────────────────────────────────────

async function writeLeagueEdition(
  sb: ReturnType<typeof createClient>,
  leagueId: string,
  generated: Record<string, string | null>,
  rawInput: Record<string, unknown>,
  isManual: boolean
) {
  const editionDate = today();
  const { data: existing } = await sb.from('frontpage_editions').select('id, edition_number').eq('league_id', leagueId).eq('edition_date', editionDate).maybeSingle();

  const payload = {
    headline: generated.headline ?? null, deck: generated.deck ?? null,
    hot_take: generated.hot_take ?? null, wooden_spoon: generated.wooden_spoon ?? null,
    transfer_rumour: generated.transfer_rumour ?? null, raw_input: rawInput,
    is_manual: isManual, generated_at: new Date().toISOString(),
  };

  if (existing) {
    await sb.from('frontpage_editions').update(payload).eq('id', existing.id);
  } else {
    const { count } = await sb.from('frontpage_editions').select('*', { count: 'exact', head: true }).eq('league_id', leagueId);
    await sb.from('frontpage_editions').insert({ league_id: leagueId, edition_date: editionDate, edition_number: (count ?? 0) + 1, ...payload });
  }
}

// ── Write edition (circle) ────────────────────────────────────────────────────

async function writeCircleEdition(
  sb: ReturnType<typeof createClient>,
  circleId: string,
  generated: Record<string, string | null>,
  rawInput: Record<string, unknown>,
  isManual: boolean
) {
  const editionDate = today();
  const { data: existing } = await sb.from('frontpage_editions').select('id, edition_number').eq('circle_id', circleId).eq('edition_date', editionDate).maybeSingle();

  const payload = {
    headline: generated.headline ?? null, deck: generated.deck ?? null,
    hot_take: generated.hot_take ?? null, wooden_spoon: generated.wooden_spoon ?? null,
    transfer_rumour: generated.transfer_rumour ?? null, raw_input: rawInput,
    is_manual: isManual, generated_at: new Date().toISOString(),
  };

  if (existing) {
    await sb.from('frontpage_editions').update(payload).eq('id', existing.id);
  } else {
    const { count } = await sb.from('frontpage_editions').select('*', { count: 'exact', head: true }).eq('circle_id', circleId);
    await sb.from('frontpage_editions').insert({ circle_id: circleId, edition_date: editionDate, edition_number: (count ?? 0) + 1, ...payload });
  }
}

// ── Generate for one league ───────────────────────────────────────────────────

async function generateForLeague(
  sb: ReturnType<typeof createClient>,
  league: { id: string; name: string; tournament_id: string },
  isManual: boolean
) {
  const data = await collectLeagueData(sb, league);
  const { prompt, rawInput } = buildLeaguePrompt(league, data);
  const generated = await callGroq(prompt);
  await writeLeagueEdition(sb, league.id, generated, rawInput, isManual);
  console.log(`[${FN}] Generated league edition for ${league.id} (${league.name})`);
}

// ── Generate for one circle ───────────────────────────────────────────────────

async function generateForCircle(
  sb: ReturnType<typeof createClient>,
  circle: { id: string; name: string },
  isManual: boolean
) {
  const data = await collectCircleData(sb, circle.id);
  const { prompt, rawInput } = buildCirclePrompt(circle.name, data);
  const generated = await callGroq(prompt);
  await writeCircleEdition(sb, circle.id, generated, rawInput, isManual);
  console.log(`[${FN}] Generated circle edition for ${circle.id} (${circle.name})`);
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
      const cronLeagueId = body.league_id as string | undefined;
      const results = { processed: 0, skipped: 0, errors: 0 };
      const DELAY_MS = 15_000;

      // ── Per-league editions ──
      const { data: memberRows } = await sb.from('league_members').select('league_id, leagues(id, name, tournament_id)');
      const leagueMap: Record<string, { info: { id: string; name: string; tournament_id: string }; count: number }> = {};
      for (const row of (memberRows ?? []) as { league_id: string; leagues: { id: string; name: string; tournament_id: string } }[]) {
        if (!row.leagues) continue;
        if (!leagueMap[row.league_id]) leagueMap[row.league_id] = { info: row.leagues, count: 0 };
        leagueMap[row.league_id].count++;
      }
      let activeLeagues = Object.values(leagueMap).filter(l => l.count > 1).map(l => l.info);
      if (cronLeagueId) activeLeagues = activeLeagues.filter(l => l.id === cronLeagueId);

      for (let i = 0; i < activeLeagues.length; i++) {
        const league = activeLeagues[i];
        if (i > 0) await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        try {
          const { data: todayEdition } = await sb.from('frontpage_editions').select('is_manual, generated_at').eq('league_id', league.id).eq('edition_date', today()).maybeSingle();
          if (todayEdition?.is_manual) {
            const hoursSince = (Date.now() - new Date(todayEdition.generated_at).getTime()) / 3_600_000;
            if (hoursSince < 12) { results.skipped++; continue; }
          }
          await generateForLeague(sb, league, false);
          results.processed++;
        } catch (err) {
          results.errors++;
          await logError(FN, 'error', `League ${league.id}: ${(err as Error).message}`, { league_id: league.id });
        }
      }

      // ── Per-circle editions ──
      const { data: circleRows } = await sb.from('circles').select('id, name');
      for (const circle of (circleRows ?? []) as { id: string; name: string }[]) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        try {
          // Skip if circle has no linked leagues (nothing to report)
          const { count: linkedCount } = await sb.from('circle_leagues').select('*', { count: 'exact', head: true }).eq('circle_id', circle.id);
          if (!linkedCount) { results.skipped++; continue; }

          const { data: todayEdition } = await sb.from('frontpage_editions').select('is_manual, generated_at').eq('circle_id', circle.id).eq('edition_date', today()).maybeSingle();
          if (todayEdition?.is_manual) {
            const hoursSince = (Date.now() - new Date(todayEdition.generated_at).getTime()) / 3_600_000;
            if (hoursSince < 12) { results.skipped++; continue; }
          }
          await generateForCircle(sb, circle, false);
          results.processed++;
        } catch (err) {
          results.errors++;
          await logError(FN, 'error', `Circle ${circle.id}: ${(err as Error).message}`, { circle_id: circle.id });
        }
      }

      return json({ ok: true, ...results }, 200, corsHeaders);
    }

    // ── CIRCLE mode (Clubhouse owner manual trigger) ───────────────────────────
    const circleId = body.circle_id as string | undefined;
    if (circleId) {
      const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
      if (authErr || !user) return json({ ok: false, error: 'Unauthorised' }, 401, corsHeaders);

      const { data: membership } = await sb.from('circle_members').select('role').eq('circle_id', circleId).eq('user_id', user.id).maybeSingle();
      if (membership?.role !== 'owner') return json({ ok: false, error: 'Forbidden — Clubhouse owner only' }, 403, corsHeaders);

      const { data: recentManual } = await sb.from('frontpage_editions').select('generated_at').eq('circle_id', circleId).eq('is_manual', true).gte('generated_at', new Date(Date.now() - RATE_LIMIT_MS).toISOString()).maybeSingle();
      if (recentManual) {
        const hoursSince = (Date.now() - new Date(recentManual.generated_at).getTime()) / 3_600_000;
        return json({ ok: false, error: `Special edition already published ${hoursSince.toFixed(1)}h ago. Next in ${(4 - hoursSince).toFixed(1)}h.` }, 429, corsHeaders);
      }

      const { data: circle } = await sb.from('circles').select('id, name').eq('id', circleId).maybeSingle();
      if (!circle) return json({ ok: false, error: 'Circle not found' }, 404, corsHeaders);

      await generateForCircle(sb, circle as { id: string; name: string }, true);
      return json({ ok: true, message: 'Special edition published' }, 200, corsHeaders);
    }

    // ── LEAGUE mode (commissioner manual trigger) ──────────────────────────────
    const leagueId = body.league_id as string | undefined;
    if (!leagueId) return json({ ok: false, error: 'league_id or circle_id required' }, 400, corsHeaders);

    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ ok: false, error: 'Unauthorised' }, 401, corsHeaders);

    const { data: leagueMembership } = await sb.from('league_members').select('role').eq('league_id', leagueId).eq('user_id', user.id).maybeSingle();
    if (leagueMembership?.role !== 'commissioner') return json({ ok: false, error: 'Forbidden — commissioners only' }, 403, corsHeaders);

    const { data: recentManual } = await sb.from('frontpage_editions').select('generated_at').eq('league_id', leagueId).eq('is_manual', true).gte('generated_at', new Date(Date.now() - RATE_LIMIT_MS).toISOString()).maybeSingle();
    if (recentManual) {
      const hoursSince = (Date.now() - new Date(recentManual.generated_at).getTime()) / 3_600_000;
      return json({ ok: false, error: `Special edition already published ${hoursSince.toFixed(1)}h ago. Next in ${(4 - hoursSince).toFixed(1)}h.` }, 429, corsHeaders);
    }

    const { data: leagueRow } = await sb.from('leagues').select('id, name, tournament_id').eq('id', leagueId).maybeSingle();
    if (!leagueRow) return json({ ok: false, error: 'League not found' }, 404, corsHeaders);

    await generateForLeague(sb, leagueRow as { id: string; name: string; tournament_id: string }, true);
    return json({ ok: true, message: 'Special edition published' }, 200, corsHeaders);

  } catch (err) {
    await logError(FN, 'critical', (err as Error).message);
    return json({ ok: false, error: 'Internal error' }, 500);
  }
});
