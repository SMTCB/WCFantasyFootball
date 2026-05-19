-- Migration 64: Populate tournament_id for migration 09 seeded players
-- Migration 09 (sprint1_schema.sql) seeded 25+ players but tournament_id column didn't exist yet.
-- These players ended up with tournament_id=NULL. This migration assigns them to EPL (426)
-- so auto-fill queries for EPL leagues can find them.

UPDATE players
SET tournament_id = '426'
WHERE id IN (
  -- Goalkeepers
  'a0000001-0000-0000-0000-000000000001', -- Alisson
  'a0000001-0000-0000-0000-000000000002', -- Thibaut Courtois
  'a0000001-0000-0000-0000-000000000003', -- Manuel Neuer
  'a0000001-0000-0000-0000-000000000004', -- Jordan Pickford

  -- Defenders
  'a0000001-0000-0000-0000-000000000011', -- Virgil van Dijk
  'a0000001-0000-0000-0000-000000000012', -- Achraf Hakimi
  'a0000001-0000-0000-0000-000000000013', -- Ruben Dias
  'a0000001-0000-0000-0000-000000000014', -- Theo Hernandez
  'a0000001-0000-0000-0000-000000000015', -- Alphonso Davies
  'a0000001-0000-0000-0000-000000000016', -- Trent Alexander-Arnold

  -- Midfielders
  'a0000001-0000-0000-0000-000000000021', -- Luka Modric
  'a0000001-0000-0000-0000-000000000022', -- Declan Rice
  'a0000001-0000-0000-0000-000000000023', -- Gavi
  'a0000001-0000-0000-0000-000000000024', -- Enzo Fernandez
  'a0000001-0000-0000-0000-000000000025', -- Phil Foden
  'a0000001-0000-0000-0000-000000000026', -- Rodrigo
  'a0000001-0000-0000-0000-000000000027', -- Jamal Musiala
  'a0000001-0000-0000-0000-000000000028', -- Bernardo Silva

  -- Forwards
  'a0000001-0000-0000-0000-000000000031', -- Erling Haaland
  'a0000001-0000-0000-0000-000000000032', -- Harry Kane
  'a0000001-0000-0000-0000-000000000033', -- Cristiano Ronaldo
  'a0000001-0000-0000-0000-000000000034', -- Lionel Messi
  'a0000001-0000-0000-0000-000000000035', -- Lautaro Martinez
  'a0000001-0000-0000-0000-000000000036', -- Bukayo Saka
  'a0000001-0000-0000-0000-000000000037'  -- Rafael Leao
)
  AND tournament_id IS NULL;
