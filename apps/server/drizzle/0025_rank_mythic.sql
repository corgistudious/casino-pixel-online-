-- Thần Thoại: a 41st division after Chiến Thần I. Additive for every table; the only data change
-- keeps each player's total RP exactly: Chiến Thần I with RP >= 200 (which used to stack above 200)
-- becomes Thần Thoại with the excess, i.e. division 39 + rp R -> division 40 + rp R - 200.
ALTER TABLE player_ranks DROP CONSTRAINT IF EXISTS player_ranks_division_range;
--> statement-breakpoint
ALTER TABLE player_ranks ADD CONSTRAINT player_ranks_division_range CHECK (division BETWEEN 0 AND 40);
--> statement-breakpoint
UPDATE player_ranks SET division = 40, rp = rp - 200, peak_division = GREATEST(peak_division, 40), streak = 0
WHERE division = 39 AND rp >= 200;
