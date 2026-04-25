-- Migration 14: Replace all national-team fixtures with Premier League club fixtures
-- Players table uses PL clubs (Arsenal, Chelsea, Man City, etc.) so fixtures must match.
-- Preserves md2-f1/f2/f3 team names (already PL clubs) — only updates competition label and remaining fixtures.

-- ─── GW1 (md1) — all scheduled ────────────────────────────────────────────────
update fixtures set home_team = 'Arsenal',     away_team = 'Chelsea',    competition = 'Premier League • GW1' where id = 'md1-f1';
update fixtures set home_team = 'Man City',    away_team = 'Liverpool',  competition = 'Premier League • GW1' where id = 'md1-f2';
update fixtures set home_team = 'Spurs',       away_team = 'Man Utd',    competition = 'Premier League • GW1' where id = 'md1-f3';
update fixtures set home_team = 'Aston Villa', away_team = 'Newcastle',  competition = 'Premier League • GW1' where id = 'md1-f4';
update fixtures set home_team = 'Brighton',    away_team = 'West Ham',   competition = 'Premier League • GW1' where id = 'md1-f5';
update fixtures set home_team = 'Everton',     away_team = 'Wolves',     competition = 'Premier League • GW1' where id = 'md1-f6';

-- ─── GW2 (md2) — f1/f2/f3 teams already correct, fix competition + f4/f5/f6 ──
update fixtures set competition = 'Premier League • GW2' where id in ('md2-f1','md2-f2','md2-f3');
update fixtures set home_team = 'Aston Villa', away_team = 'Newcastle',  competition = 'Premier League • GW2' where id = 'md2-f4';
update fixtures set home_team = 'Brighton',    away_team = 'Everton',    competition = 'Premier League • GW2' where id = 'md2-f5';
update fixtures set home_team = 'West Ham',    away_team = 'Wolves',     competition = 'Premier League • GW2' where id = 'md2-f6';

-- ─── GW3 (md3) — all scheduled ────────────────────────────────────────────────
update fixtures set home_team = 'Chelsea',     away_team = 'Arsenal',    competition = 'Premier League • GW3' where id = 'md3-f1';
update fixtures set home_team = 'Liverpool',   away_team = 'Man City',   competition = 'Premier League • GW3' where id = 'md3-f2';
update fixtures set home_team = 'Man Utd',     away_team = 'Spurs',      competition = 'Premier League • GW3' where id = 'md3-f3';
update fixtures set home_team = 'Newcastle',   away_team = 'Aston Villa',competition = 'Premier League • GW3' where id = 'md3-f4';
update fixtures set home_team = 'West Ham',    away_team = 'Brighton',   competition = 'Premier League • GW3' where id = 'md3-f5';
update fixtures set home_team = 'Wolves',      away_team = 'Everton',    competition = 'Premier League • GW3' where id = 'md3-f6';

-- ─── GW4 (md4) — was quarter-finals TBD ──────────────────────────────────────
update fixtures set home_team = 'Arsenal',     away_team = 'Man City',   competition = 'Premier League • GW4', status = 'scheduled' where id = 'md4-f1';
update fixtures set home_team = 'Chelsea',     away_team = 'Spurs',      competition = 'Premier League • GW4', status = 'scheduled' where id = 'md4-f2';
update fixtures set home_team = 'Liverpool',   away_team = 'Man Utd',    competition = 'Premier League • GW4', status = 'scheduled' where id = 'md4-f3';
update fixtures set home_team = 'Aston Villa', away_team = 'Everton',    competition = 'Premier League • GW4', status = 'scheduled' where id = 'md4-f4';

-- ─── GW5 (md5) — was semi-finals TBD ─────────────────────────────────────────
update fixtures set home_team = 'Arsenal',     away_team = 'Liverpool',  competition = 'Premier League • GW5', status = 'scheduled' where id = 'md5-f1';
update fixtures set home_team = 'Chelsea',     away_team = 'Man City',   competition = 'Premier League • GW5', status = 'scheduled' where id = 'md5-f2';

-- ─── GW6 (md6) — was final/3rd place TBD ────────────────────────────────────
update fixtures set home_team = 'Man City',    away_team = 'Arsenal',    competition = 'Premier League • GW6', status = 'scheduled' where id = 'md6-f1';
update fixtures set home_team = 'Liverpool',   away_team = 'Chelsea',    competition = 'Premier League • GW6', status = 'scheduled' where id = 'md6-f2';

-- ─── test-live fixture ────────────────────────────────────────────────────────
update fixtures set home_team = 'Arsenal',     away_team = 'Man Utd',    competition = 'Premier League • GW1' where id = 'test-live';
