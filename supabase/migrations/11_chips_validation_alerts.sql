-- Migration 11: Chips server validation + player alerts seed
-- 1. chips_used table — tracks season-level chip consumption
-- 2. activate_chip RPC — server validates no double-use across matchdays
-- 3. Seed player_status for extended player roster

-- ─── chips_used ───────────────────────────────────────────────────────────────
-- One row per chip activation per user per league per season.
-- A chip can be deactivated but not re-activated once consumed here.
create table if not exists chips_used (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  league_id   uuid        not null references leagues(id) on delete cascade,
  chip_type   text        not null,   -- 'wildcard' | 'triple_captain'
  matchday_id text        not null,
  used_at     timestamptz default now(),
  unique(user_id, league_id, chip_type)
);
alter table chips_used disable row level security;

-- ─── activate_chip RPC ────────────────────────────────────────────────────────
-- Called by client instead of raw squads.update().
-- Validates season-level chip limit, records usage, toggles the squad flag.
-- Returns: { ok, active, code?, error? }
create or replace function activate_chip(
  p_user_id   uuid,
  p_league_id uuid,
  p_chip_type text
) returns jsonb language plpgsql security definer as $$
declare
  v_squad      record;
  v_cur_val    boolean;
  v_db_field   text;
begin
  -- Map chip type to column name
  case p_chip_type
    when 'wildcard'       then v_db_field := 'is_wildcard';
    when 'triple_captain' then v_db_field := 'is_triple_captain';
    else return jsonb_build_object('ok', false, 'error', 'Unknown chip type: ' || p_chip_type);
  end case;

  -- Load the squad
  select * into v_squad
  from squads
  where user_id = p_user_id and league_id = p_league_id
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Squad not found');
  end if;

  -- Resolve current value
  v_cur_val := case p_chip_type
    when 'wildcard'       then v_squad.is_wildcard
    when 'triple_captain' then v_squad.is_triple_captain
  end;

  -- Activating path
  if not v_cur_val then
    -- Season-level guard: chip already used in a previous matchday?
    if exists (
      select 1 from chips_used
      where user_id   = p_user_id
        and league_id = p_league_id
        and chip_type = p_chip_type
        and matchday_id <> v_squad.matchday_id  -- same gameweek reactivation allowed
    ) then
      return jsonb_build_object(
        'ok',    false,
        'code',  'CHIP_ALREADY_USED',
        'error', 'This chip has already been used this season'
      );
    end if;

    -- Record first-use (upsert so same-matchday re-activation just overwrites)
    insert into chips_used (user_id, league_id, chip_type, matchday_id)
    values (p_user_id, p_league_id, p_chip_type, v_squad.matchday_id)
    on conflict (user_id, league_id, chip_type) do update
      set matchday_id = excluded.matchday_id, used_at = now();
  end if;

  -- Toggle the flag
  execute format(
    'update squads set %I = $1 where id = $2',
    v_db_field
  ) using (not v_cur_val), v_squad.id;

  return jsonb_build_object('ok', true, 'active', not v_cur_val);
end;
$$;

-- ─── Seed player_status for extended roster ───────────────────────────────────
-- Gives the DangerZone real data for the new players added in migration 09.
insert into player_status (player_id, status, confidence, reason, return_date)
values
  -- Doubts
  ('a0000001-0000-0000-0000-000000000025', 'doubt',     70,  'Knock in training — monitored daily',       null),
  ('a0000001-0000-0000-0000-000000000031', 'doubt',     65,  'Groin strain — fitness test before kickoff', null),
  ('a0000001-0000-0000-0000-000000000036', 'doubt',     75,  'Suspended for one match (yellow card total)', null),

  -- Out
  ('a0000001-0000-0000-0000-000000000034', 'out',       0,   'Calf injury — ruled out for 3 weeks',       '2026-05-10'),
  ('a0000001-0000-0000-0000-000000000028', 'out',       0,   'Hamstring tear — out 4–6 weeks',            '2026-05-20'),

  -- Returning
  ('a0000001-0000-0000-0000-000000000033', 'returning', 80,  'Back from international duty — fit',        null),
  ('a0000001-0000-0000-0000-000000000022', 'returning', 85,  'Returned to full training this week',       null)
on conflict (player_id) do update set
  status     = excluded.status,
  confidence = excluded.confidence,
  reason     = excluded.reason,
  return_date = excluded.return_date,
  updated_at  = now();
