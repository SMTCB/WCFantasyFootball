/**
 * _shared/wishlistDraft.ts — unit tests (migration 294 scheduler/runner)
 *
 * Exercises claimWishlistDraft + runClaimedWishlistDraft against an
 * in-memory fake of the supabase-js query builder — no Postgres needed. The
 * important case is the "player taken → next" guarantee: if someone buys a
 * wishlisted player between the allocator's snapshot and the commit,
 * commit_wishlist_draft answers STALE and the re-run must skip that player.
 *
 * wishlistDraft.ts imports log.ts, which imports supabase-js from esm.sh —
 * a module hook stubs https: imports so Node can load the file.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const HOOKS = `
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('https:')) {
    return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(
      'export const createClient = () => ({ from: () => ({ insert: async () => ({}) }) });'
    ) };
  }
  return next(spec, ctx);
}`;

let claimWishlistDraft, runClaimedWishlistDraft;

before(async () => {
  register('data:text/javascript,' + encodeURIComponent(HOOKS));
  globalThis.Deno ??= { env: { get: () => '' } };
  ({ claimWishlistDraft, runClaimedWishlistDraft } = await import('../../supabase/functions/_shared/wishlistDraft.ts'));
});

// ── Minimal in-memory supabase-js fake ──────────────────────────────────────

function fakeSupabase(tables, rpcs) {
  const calls = [];
  class Q {
    constructor(table) { this.table = table; this.op = 'select'; this.filters = []; this.one = false; this.sort = null; }
    select() { this.returning = true; return this; }
    eq(c, v)  { this.filters.push((r) => r[c] === v); return this; }
    is(c, v)  { this.filters.push((r) => (r[c] ?? null) === v); return this; }
    in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }
    lt(c, v)  { this.filters.push((r) => r[c] < v); return this; }
    order(c, o = {}) { this.sort = { c, asc: o.ascending !== false }; return this; }
    limit()   { return this; }
    maybeSingle() { this.one = true; return this; }
    update(p) { this.op = 'update'; this.payload = p; return this; }
    insert(p) { this.op = 'insert'; this.payload = p; return this; }
    then(res, rej) { return Promise.resolve().then(() => this.exec()).then(res, rej); }
    exec() {
      const rows = (tables[this.table] ??= []);
      calls.push({ table: this.table, op: this.op, payload: this.payload });
      if (this.op === 'insert') {
        rows.push(...[].concat(this.payload));
        return { data: null, error: null };
      }
      let hit = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === 'update') hit.forEach((r) => Object.assign(r, this.payload));
      if (this.sort) {
        const { c, asc } = this.sort;
        hit = [...hit].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1));
      }
      if (this.op === 'update' && !this.returning) return { data: null, error: null };
      const copy = hit.map((r) => structuredClone(r));
      return { data: this.one ? (copy[0] ?? null) : copy, error: null };
    }
  }
  return {
    calls,
    from: (t) => new Q(t),
    rpc: async (name, args) => {
      calls.push({ rpc: name, args });
      return rpcs[name] ? rpcs[name](args) : { data: null, error: null };
    },
  };
}

const LEAGUE = 'L1', A = 'user-a', B = 'user-b';

function world() {
  const p = (id, position, team) => ({ id, position, price: 5, forza_team_id: team, tournament_id: 'T' });
  return {
    leagues: [{ id: LEAGUE, squad_size: 5, position_limits: { GK: 1, DEF: 2, MID: 1, FWD: 1 },
      min_formation: { GK: 1, DEF: 1, MID: 1, FWD: 1 }, tournament_id: 'T', budget_total: 100 }],
    players: [
      p('g1', 'GK', 't1'), p('d1', 'DEF', 't2'), p('m1', 'MID', 't3'), p('f1', 'FWD', 't4'),
      p('g2', 'GK', 't5'), p('d4', 'DEF', 't6'), p('m2', 'MID', 't7'), p('f2', 'FWD', 't8'),
      p('d2', 'DEF', 't9'), p('d3', 'DEF', 't10'),
    ],
    squads: [
      { id: 'sqA', user_id: A, league_id: LEAGUE, players: ['g1', 'd1', 'm1', 'f1'], budget_remaining: 80, created_at: '2026-01-01' },
      { id: 'sqB', user_id: B, league_id: LEAGUE, players: ['g2', 'd4', 'm2', 'f2'], budget_remaining: 80, created_at: '2026-01-01' },
    ],
    wishlist_draft_submissions: [
      { league_id: LEAGUE, round_number: 3, user_id: A, status: 'pending', target_ids: ['d2', 'd3'], drop_ids: [], carried_over_from: null },
    ],
    league_members: [{ league_id: LEAGUE, user_id: A, role: 'member' }, { league_id: LEAGUE, user_id: B, role: 'commissioner' }],
    wishlist_draft_windows: [
      { id: 'w1', league_id: LEAGUE, round_number: 3, snake_order_seed: 7, status: 'scheduled', processed_at: null, run_token: null, started_at: null },
    ],
    gazette_entries: [],
    league_notifications: [],
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('claimWishlistDraft', () => {
  it('claims a scheduled window exactly once', async () => {
    const t = world();
    const sb = fakeSupabase(t, {});
    const first = await claimWishlistDraft(sb, 'w1', 'auto');
    assert.equal(first?.id, 'w1');
    assert.equal(first.run_trigger, 'auto');
    assert.ok(first.run_token);
    assert.equal(t.wishlist_draft_windows[0].status, 'running');
    assert.equal(await claimWishlistDraft(sb, 'w1', 'deadline'), null);
  });
});

describe('runClaimedWishlistDraft', () => {
  it('player bought before commit → STALE → re-run skips them ("taken → next")', async () => {
    const t = world();
    const commits = [];
    const sb = fakeSupabase(t, {
      get_club_cap: () => ({ data: 3, error: null }),
      commit_wishlist_draft: (args) => {
        commits.push(structuredClone(args));
        if (commits.length === 1) {
          // Outsider (B) buys d2 in the free market after the snapshot.
          t.squads.push({ id: 'sqB2', user_id: B, league_id: LEAGUE, players: ['g2', 'd4', 'm2', 'f2', 'd2'], budget_remaining: 75, created_at: '2026-01-02' });
          return { data: { ok: false, code: 'STALE' }, error: null };
        }
        t.wishlist_draft_windows[0].status = 'done';
        return { data: { ok: true }, error: null };
      },
    });

    const win = await claimWishlistDraft(sb, 'w1', 'deadline');
    const res = await runClaimedWishlistDraft(sb, win);

    assert.equal(res.ok, true);
    assert.equal(res.attempts, 2);
    assert.equal(commits.length, 2);
    assert.deepEqual(commits[0].p_allocations[0].players, ['g1', 'd1', 'm1', 'f1', 'd2']);
    const final = commits[1].p_allocations[0];
    assert.equal(final.user_id, A);
    assert.deepEqual(final.expected_players, ['g1', 'd1', 'm1', 'f1']);
    assert.deepEqual(final.players, ['g1', 'd1', 'm1', 'f1', 'd3']);
    assert.equal(final.budget_remaining, 75);

    const gz = JSON.parse(t.gazette_entries[0].full_data);
    assert.equal(gz.trigger, 'deadline');
    assert.equal(gz.attempts, 2);
    const skip = gz.skip_log.find((s) => s.player_id === 'd2');
    assert.equal(skip.reason, 'taken');
    assert.equal(skip.detail, 'owned');
    assert.equal(skip.owner_user_id, B);

    assert.equal(t.league_notifications.length, 2);
    assert.ok(t.league_notifications.every((n) => n.notification_type === 'wishlist_draft_done'));
  });

  it('no submissions → commits an empty allocation (opens the market)', async () => {
    const t = world();
    t.wishlist_draft_submissions = [];
    const commits = [];
    const sb = fakeSupabase(t, { commit_wishlist_draft: (a) => { commits.push(a); return { data: { ok: true }, error: null }; } });
    const res = await runClaimedWishlistDraft(sb, await claimWishlistDraft(sb, 'w1', 'auto'));
    assert.equal(res.ok, true);
    assert.equal(res.participantCount, 0);
    assert.deepEqual(commits[0].p_allocations, []);
    assert.equal(t.gazette_entries.length, 0);
  });

  it('NOT_RUNNING → gives up without touching the row', async () => {
    const t = world();
    const sb = fakeSupabase(t, {
      get_club_cap: () => ({ data: 3, error: null }),
      commit_wishlist_draft: () => ({ data: { ok: false, code: 'NOT_RUNNING' }, error: null }),
    });
    const win = await claimWishlistDraft(sb, 'w1', 'manual');
    const res = await runClaimedWishlistDraft(sb, win);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'claim lost');
    assert.equal(t.wishlist_draft_windows[0].status, 'running');
  });

  it('commit error → claim released back to scheduled for the next tick', async () => {
    const t = world();
    const sb = fakeSupabase(t, {
      get_club_cap: () => ({ data: 3, error: null }),
      commit_wishlist_draft: () => ({ data: null, error: { message: 'boom' } }),
    });
    const res = await runClaimedWishlistDraft(sb, await claimWishlistDraft(sb, 'w1', 'auto'));
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'allocation error');
    assert.equal(t.wishlist_draft_windows[0].status, 'scheduled');
    assert.equal(t.wishlist_draft_windows[0].run_token, null);
  });

  it('keeps going stale → releases after 3 attempts', async () => {
    const t = world();
    let n = 0;
    const sb = fakeSupabase(t, {
      get_club_cap: () => ({ data: 3, error: null }),
      commit_wishlist_draft: () => { n++; return { data: { ok: false, code: 'STALE' }, error: null }; },
    });
    const res = await runClaimedWishlistDraft(sb, await claimWishlistDraft(sb, 'w1', 'auto'));
    assert.equal(n, 3);
    assert.equal(res.reason, 'stale after retries');
    assert.equal(t.wishlist_draft_windows[0].status, 'scheduled');
  });
});
