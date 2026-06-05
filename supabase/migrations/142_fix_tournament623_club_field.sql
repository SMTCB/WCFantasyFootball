-- Migration 142: Fix club field for Italy/Slovenia players in tournament 623
--
-- Root cause: migration 139 seeded Italy and Slovenia players into tournament 623
-- (int'l friendly) by copying them from tournament 1593 (UCL).  The copy preserved
-- the `club` field as-is from the UCL data — so Italian players showed "Atalanta",
-- "Juventus", "Inter", etc. and Slovenian players showed "Olimpija", "Club Brugge",
-- "Atlético de Madrid", etc.  The UI displays `club` as the sub-label on every
-- player card, making it look like UCL club players were mixed into the int'l
-- friendly squad.
--
-- The `nationality` field was always correct ('Italy' / 'Slovenia') — only `club`
-- was wrong.  Fix: align `club` with `nationality` for all affected rows.
--
-- 26 Italy players, 30 Slovenia players updated (56 total).
-- USA players are intentionally left as `club = 'United States'`; `nationality = 'USA'`
-- is an abbreviation mismatch but the display text is correct.

UPDATE players
SET    club = nationality
WHERE  tournament_id = '623'
  AND  nationality IN ('Italy', 'Slovenia')
  AND  club != nationality;
