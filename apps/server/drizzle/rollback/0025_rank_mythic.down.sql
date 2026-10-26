-- Manual rollback for 0025_rank_mythic (owner approval + backup first). Total RP is kept:
-- Thần Thoại + rp R goes back to Chiến Thần I + rp R + 200 (the old ladder score). Peak divisions
-- above Chiến Thần I are capped at 39. Stop the game server first so no ranked match settles meanwhile.
UPDATE player_ranks SET division = 39, rp = rp + 200, peak_division = LEAST(peak_division, 39) WHERE division = 40;
UPDATE player_ranks SET peak_division = 39 WHERE peak_division > 39;
ALTER TABLE player_ranks DROP CONSTRAINT IF EXISTS player_ranks_division_range;
ALTER TABLE player_ranks ADD CONSTRAINT player_ranks_division_range CHECK (division BETWEEN 0 AND 39);
-- The code of the previous release must be deployed with this rollback (it knows 40 divisions only).
-- Afterwards delete the 0025 row from drizzle.__drizzle_migrations so the migration can re-run.
