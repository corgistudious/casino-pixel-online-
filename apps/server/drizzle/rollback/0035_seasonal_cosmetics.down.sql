-- Manual rollback for 0035_seasonal_cosmetics (owner approval + backup first).
-- Collections go; owned items and their ledger history stay. Built-in cosmetics nobody owns are
-- removed; players wearing a table skin or victory effect simply stop seeing it.
BEGIN;
DROP TABLE IF EXISTS collection_items;
DROP TABLE IF EXISTS cosmetic_collections;
DELETE FROM catalog_items c
WHERE (c.kind IN ('table_skin', 'victory_effect') OR c.id LIKE 'ss2026\_%\_cards' OR c.id LIKE 'ss2026\_%\_bubble' OR c.id LIKE 'ss2026\_%\_title'
       OR c.id IN ('bubble_classic_gold', 'bubble_royal_purple', 'bubble_diamond_blue', 'bubble_emerald_glow'))
  AND NOT EXISTS (SELECT 1 FROM inventory_items i WHERE i.item_id = c.id);
-- Kinds stay allowed while owned rows exist; otherwise restore the previous constraint.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM catalog_items WHERE kind IN ('table_skin', 'victory_effect')) THEN
    ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_kind;
    ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_kind CHECK (kind IN ('frame', 'avatar', 'title', 'chat_bubble', 'card_back', 'collectible'));
  END IF;
END $$;
ALTER TABLE users DROP COLUMN IF EXISTS equipped_table_skin;
ALTER TABLE users DROP COLUMN IF EXISTS equipped_victory_effect;
UPDATE catalog_items SET status = 'draft' WHERE id LIKE 'ss2026\_%' AND kind = 'frame' AND price_silver IS NULL
  AND NOT EXISTS (SELECT 1 FROM inventory_items i WHERE i.item_id = catalog_items.id);
ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_one_price;
ALTER TABLE catalog_items DROP COLUMN IF EXISTS price_gold;
COMMIT;
-- The inventory unique index keeps covering the new kinds (harmless). Afterwards delete the 0035 row
-- from drizzle.__drizzle_migrations.
