-- Active UCL (1593) players with no price (youth/reserve squad entries) get the
-- lowest price currently held by a priced player of the same position, so they
-- are priced like the cheapest regular squad member rather than missing from
-- budget maths. Only rows with a NULL/zero price are touched.
UPDATE players p
   SET price = m.min_price
  FROM (
    SELECT position, MIN(price) AS min_price
      FROM players
     WHERE tournament_id = '1593' AND is_active AND price > 0
     GROUP BY position
  ) m
 WHERE p.tournament_id = '1593'
   AND p.is_active
   AND (p.price IS NULL OR p.price <= 0)
   AND p.position = m.position;
