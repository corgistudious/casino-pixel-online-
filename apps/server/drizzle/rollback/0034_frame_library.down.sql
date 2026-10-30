-- Manual rollback for 0034_frame_library (owner approval + backup first).
-- Role triggers go; library items stay if anyone owns them (their history is kept) — only unowned
-- library items are deleted. Players wearing a role or removed frame fall back to the default frame.
BEGIN;
DROP TRIGGER IF EXISTS inventory_items_no_role_items ON inventory_items;
DROP FUNCTION IF EXISTS keyo_no_role_items();
DROP TRIGGER IF EXISTS user_roles_drop_role_frame ON user_roles;
DROP FUNCTION IF EXISTS keyo_drop_role_frame();
UPDATE users SET frame = 'classic' WHERE frame LIKE 'role\_%';
DROP FUNCTION IF EXISTS keyo_role_frame_allowed(uuid, text);
DELETE FROM catalog_items c
WHERE (c.id LIKE 'lb\_%' OR c.id LIKE 'hof\_%' OR c.id LIKE 'ss2026\_%' OR c.id LIKE 'tour\_%' OR c.id LIKE 'role\_%')
  AND NOT EXISTS (SELECT 1 FROM inventory_items i WHERE i.item_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.frame = c.id);
COMMIT;
-- Afterwards delete the 0034 row from drizzle.__drizzle_migrations.
