-- Migration 15: Seed player_status alerts for real 1000xxx squad players
-- Covers players in the md2 squad so DangerZone renders real data

insert into player_status (player_id, status, confidence, reason, return_date)
values
  ('1000027', 'doubt',     65, 'Knee knock — assessed in training, decision Thursday', null),
  ('1000279', 'doubt',     70, 'Hamstring tightness — monitored, expected to feature', null),
  ('1000811', 'out',        0, 'One-match suspension — misses this fixture',            null),
  ('1000548', 'returning', 80, 'Returning from ankle knock — full training resumed',   null)
on conflict (player_id) do update set
  status      = excluded.status,
  confidence  = excluded.confidence,
  reason      = excluded.reason,
  return_date = excluded.return_date;
