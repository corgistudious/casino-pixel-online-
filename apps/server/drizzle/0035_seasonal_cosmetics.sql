-- Seasonal cosmetic shop: table skins and victory effects become equippable item kinds, catalog
-- items may be priced in Cxu Vàng, and seasonal collections group items with a sale window that
-- only opens once the Owner approves it. Additive: no existing item, inventory row or ledger entry
-- changes; the 24 seasonal frames (0034) are kept and only made visible (sold only via a collection).
ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_kind;
--> statement-breakpoint
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_kind CHECK (kind IN ('frame', 'avatar', 'title', 'chat_bubble', 'card_back', 'table_skin', 'victory_effect', 'collectible'));
--> statement-breakpoint
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS price_gold bigint;
--> statement-breakpoint
ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_one_price;
--> statement-breakpoint
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_one_price CHECK ((price_gold IS NULL OR price_gold >= 0) AND (price_gold IS NULL OR price_silver IS NULL));
--> statement-breakpoint
DROP INDEX IF EXISTS inventory_items_unique_cosmetic_idx;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_unique_cosmetic_idx ON inventory_items (user_id, item_id) WHERE kind IN ('frame', 'avatar', 'title', 'chat_bubble', 'card_back', 'table_skin', 'victory_effect');
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_table_skin text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_victory_effect text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cosmetic_collections (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9_]{2,40}$'),
  theme text NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  name_vi text NOT NULL,
  name_en text NOT NULL,
  desc_vi text,
  desc_en text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  approved_at timestamptz,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ended_at timestamptz,
  rerun_of text REFERENCES cosmetic_collections(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cosmetic_collections_dates CHECK (ends_at > starts_at)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS collection_items (
  collection_id text NOT NULL REFERENCES cosmetic_collections(id) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
  price bigint NOT NULL CHECK (price >= 0),
  currency text NOT NULL CHECK (currency IN ('silver', 'gold')),
  sort integer NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, item_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS collection_items_item_idx ON collection_items (item_id);
--> statement-breakpoint
-- Built-in cosmetics (artwork drawn by the client from style.art). Basic items are priced in the
-- shop; seasonal items carry no shop price and are sold only through an approved collection.
INSERT INTO catalog_items (id, kind, name_vi, name_en, desc_vi, desc_en, rarity, source, tradable, status, style, price_silver, price_gold, sort) VALUES
('table_classic_green', 'table_skin', 'Xanh Cổ Điển', 'Classic Green', 'Nỉ xanh truyền thống, viền gỗ óc chó và một đèn trần.', 'Traditional green felt, walnut rail and a single ceiling light.', 'common', 'shop', false, 'released', '{"colors":["#2aa36b","#11643f","#05301d","#f2c14e"],"animated":false,"art":"table_classic_green"}'::jsonb, 0, NULL, 3000),
  ('table_royal_gold', 'table_skin', 'Hoàng Kim', 'Royal Gold', 'Nỉ đỏ rượu vang hoa văn damask vàng, viền mạ vàng, hai đèn chùm.', 'Wine-red felt with gold damask, gilded rail and two chandeliers.', 'rare', 'shop', false, 'released', '{"colors":["#b3263c","#6e0f22","#2a0410","#f2c14e"],"animated":false,"art":"table_royal_gold"}'::jsonb, 30000, NULL, 3001),
  ('table_midnight_purple', 'table_skin', 'Tím Nửa Đêm', 'Midnight Purple', 'Nỉ tím than lưới ánh kim, viền nhung đen, ánh neon tím.', 'Midnight felt with a metallic lattice, black velvet rail and violet neon.', 'rare', 'shop', false, 'released', '{"colors":["#5b3bb0","#2a1660","#0c0624","#b45cff"],"animated":false,"art":"table_midnight_purple"}'::jsonb, 25000, NULL, 3002),
  ('table_emerald_palace', 'table_skin', 'Cung Điện Lục Bảo', 'Emerald Palace', 'Nỉ lục bảo hoa văn kim cương, viền đá cẩm thạch trắng gân vàng, ba đèn.', 'Emerald felt with diamond inlay, gold-veined white marble rail and three lights.', 'epic', 'shop', false, 'released', '{"colors":["#22c08a","#0b6b4a","#032a1d","#1ec8b0"],"animated":false,"art":"table_emerald_palace"}'::jsonb, 40000, NULL, 3003),
  ('table_diamond_lounge', 'table_skin', 'Phòng Kim Cương', 'Diamond Lounge', 'Nỉ xanh băng tia sáng, viền chrome, ánh kim cương lấp lánh.', 'Ice-blue felt with light rays, chrome rail and diamond sparkle.', 'legendary', 'shop', false, 'released', '{"colors":["#4fb8e8","#1a5a8a","#071a33","#9ee8ff"],"animated":true,"art":"table_diamond_lounge"}'::jsonb, NULL, 80, 3004),
  ('fx_golden_shower', 'victory_effect', 'Mưa Vàng', 'Golden Shower', 'Mưa đồng xu vàng rơi khi bạn thắng.', 'A shower of gold coins when you win.', 'rare', 'shop', false, 'released', '{"colors":["#ffe08a","#f2c14e","#b8860b"],"animated":true,"art":"fx_golden_shower"}'::jsonb, 20000, NULL, 3005),
  ('fx_diamond_sparkle', 'victory_effect', 'Kim Cương Lấp Lánh', 'Diamond Sparkle', 'Kim cương lấp lánh quanh màn hình.', 'Diamonds sparkle around the screen.', 'epic', 'shop', false, 'released', '{"colors":["#e6fbff","#9ee8ff","#c13cff"],"animated":true,"art":"fx_diamond_sparkle"}'::jsonb, 35000, NULL, 3006),
  ('fx_royal_crown', 'victory_effect', 'Vương Miện Hoàng Gia', 'Royal Crown', 'Vương miện vàng hạ xuống giữa màn hình kèm hào quang.', 'A golden crown descends with a royal halo.', 'legendary', 'shop', false, 'released', '{"colors":["#fff3b0","#f2c14e","#e23b55"],"animated":true,"art":"fx_royal_crown"}'::jsonb, 60000, NULL, 3007),
  ('fx_firework_burst', 'victory_effect', 'Pháo Hoa Bùng Nổ', 'Firework Burst', 'Những chùm pháo hoa nhiều màu.', 'Bursts of colourful fireworks.', 'rare', 'shop', false, 'released', '{"colors":["#ff4fd8","#ffd76a","#5ad8ff","#7ff0a8"],"animated":true,"art":"fx_firework_burst"}'::jsonb, 25000, NULL, 3008),
  ('fx_lucky_stars', 'victory_effect', 'Sao May Mắn', 'Lucky Stars', 'Những ngôi sao may mắn bay lên.', 'Lucky stars float upwards.', 'common', 'shop', false, 'released', '{"colors":["#fff3b0","#ffd76a","#ffffff"],"animated":true,"art":"fx_lucky_stars"}'::jsonb, 15000, NULL, 3009),
  ('fx_emerald_aura', 'victory_effect', 'Hào Quang Lục Bảo', 'Emerald Aura', 'Vòng hào quang lục bảo xoáy quanh chiến thắng.', 'An emerald aura swirls around your win.', 'epic', 'shop', false, 'released', '{"colors":["#7ff0a8","#1ec8b0","#0b6b4a"],"animated":true,"art":"fx_emerald_aura"}'::jsonb, 40000, NULL, 3010),
  ('bubble_classic_gold', 'chat_bubble', 'Vàng Cổ Điển', 'Classic Gold', 'Nền đen ánh vàng, viền vàng mảnh.', 'Black with a gold sheen and a fine gold edge.', 'common', 'shop', false, 'released', '{"colors":["#2a1d06","#4a3510","#f2c14e"],"animated":false,"art":"bubble_classic_gold"}'::jsonb, 8000, NULL, 3011),
  ('bubble_royal_purple', 'chat_bubble', 'Tím Hoàng Gia', 'Royal Purple', 'Nhung tím, viền vàng và vương miện nhỏ.', 'Purple velvet, gold edge and a small crown.', 'rare', 'shop', false, 'released', '{"colors":["#3a1466","#6b2bb0","#f2c14e"],"animated":false,"art":"bubble_royal_purple"}'::jsonb, 12000, NULL, 3012),
  ('bubble_diamond_blue', 'chat_bubble', 'Lam Kim Cương', 'Diamond Blue', 'Xanh băng với họa tiết kim cương.', 'Ice blue with a diamond pattern.', 'epic', 'shop', false, 'released', '{"colors":["#0e3a6b","#2a7bc8","#bdf3ff"],"animated":false,"art":"bubble_diamond_blue"}'::jsonb, 18000, NULL, 3013),
  ('bubble_emerald_glow', 'chat_bubble', 'Lục Bảo Rực Rỡ', 'Emerald Glow', 'Lục bảo phát sáng nhẹ.', 'Softly glowing emerald.', 'rare', 'shop', false, 'released', '{"colors":["#06402a","#119a64","#7ff0a8"],"animated":false,"art":"bubble_emerald_glow"}'::jsonb, 15000, NULL, 3014),
  ('ss2026_halloween_table', 'table_skin', 'Sòng Bài Ma Ám', 'Haunted Casino', 'Nỉ tím đêm, mạng nhện bạc và bí ngô phát sáng. Bộ sưu tập Halloween 2026.', 'Night-purple felt, silver cobwebs and glowing pumpkins. Halloween 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#5a2a8a","#2a0f45","#0a0314","#ff7a1a"],"animated":false,"art":"ss2026_halloween_table"}'::jsonb, NULL, NULL, 3015),
  ('ss2026_halloween_fx', 'victory_effect', 'Jackpot Ma Quái', 'Ghostly Jackpot', 'Những bóng ma và dơi bay lên quanh chiến thắng. Bộ sưu tập Halloween 2026.', 'Ghosts and bats rise around your win. Halloween 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#e6d8ff","#ff7a1a","#a4ff6a"],"animated":true,"art":"ss2026_halloween_fx"}'::jsonb, NULL, NULL, 3016),
  ('ss2026_halloween_cards', 'card_back', 'Bài Ma Ám', 'Haunted Cards', 'Bộ sưu tập Halloween 2026.', 'Halloween 2026 collection.', 'rare', 'season', false, 'released', '{"colors":["#3b1458","#120420","#a4ff6a"],"animated":false,"art":"ss2026_halloween_cards"}'::jsonb, NULL, NULL, 3017),
  ('ss2026_halloween_bubble', 'chat_bubble', 'Lời Thì Thầm Bí Ngô', 'Pumpkin Whisper', 'Bộ sưu tập Halloween 2026.', 'Halloween 2026 collection.', 'rare', 'season', false, 'released', '{"colors":["#3a1206","#7a2e0a","#ff9b3d"],"animated":false,"art":"ss2026_halloween_bubble"}'::jsonb, NULL, NULL, 3018),
  ('ss2026_halloween_title', 'title', 'Hoàng Gia Halloween', 'Halloween Royalty', 'Bộ sưu tập Halloween 2026.', 'Halloween 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#ffc46b","#ff7a1a","#b45cff"],"animated":false,"art":"ss2026_halloween_title"}'::jsonb, NULL, NULL, 3019),
  ('ss2026_christmas_table', 'table_skin', 'Sòng Bài Mùa Đông', 'Winter Casino', 'Nỉ xanh thông, tuyết rơi và viền băng trắng. Bộ sưu tập Giáng Sinh 2026.', 'Pine-green felt, falling snow and an icy white rail. Christmas 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#1f7a52","#0d4a30","#04201a","#d62b3c"],"animated":false,"art":"ss2026_christmas_table"}'::jsonb, NULL, NULL, 3020),
  ('ss2026_christmas_fx', 'victory_effect', 'Lễ Hội Tuyết Rơi', 'Snowfall Celebration', 'Tuyết và quà Giáng Sinh rơi nhẹ. Bộ sưu tập Giáng Sinh 2026.', 'Snow and Christmas gifts drift down. Christmas 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#ffffff","#cdeeff","#d62b3c"],"animated":true,"art":"ss2026_christmas_fx"}'::jsonb, NULL, NULL, 3021),
  ('ss2026_christmas_cards', 'card_back', 'Bài Bông Tuyết', 'Snowflake Cards', 'Bộ sưu tập Giáng Sinh 2026.', 'Christmas 2026 collection.', 'rare', 'season', false, 'released', '{"colors":["#1d4f86","#0a1f3a","#9fd8ff"],"animated":false,"art":"ss2026_christmas_cards"}'::jsonb, NULL, NULL, 3022),
  ('ss2026_christmas_bubble', 'chat_bubble', 'Quà Giáng Sinh', 'Christmas Gift', 'Bộ sưu tập Giáng Sinh 2026.', 'Christmas 2026 collection.', 'rare', 'season', false, 'released', '{"colors":["#7a0f1a","#c0263a","#ffd76a"],"animated":false,"art":"ss2026_christmas_bubble"}'::jsonb, NULL, NULL, 3023),
  ('ss2026_christmas_title', 'title', 'Ngôi Sao Mùa Đông', 'Winter Star', 'Bộ sưu tập Giáng Sinh 2026.', 'Christmas 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#ffffff","#9fd8ff","#ffd76a"],"animated":false,"art":"ss2026_christmas_title"}'::jsonb, NULL, NULL, 3024),
  ('ss2026_new_year_table', 'table_skin', 'Dạ Tiệc Năm Mới', 'New Year Gala', 'Nỉ xanh đêm, tia pháo hoa và viền vàng champagne. Bộ sưu tập Năm Mới 2026.', 'Midnight felt, firework rays and a champagne-gold rail. Happy New Year 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#2f3fa8","#141c5a","#05081e","#ff4fd8"],"animated":false,"art":"ss2026_new_year_table"}'::jsonb, NULL, NULL, 3025),
  ('ss2026_new_year_fx', 'victory_effect', 'Pháo Hoa Nửa Đêm', 'Midnight Fireworks', 'Pháo hoa nửa đêm nổ rực rỡ. Bộ sưu tập Năm Mới 2026.', 'Midnight fireworks light up your win. Happy New Year 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#ffd76a","#ff4fd8","#5ad8ff","#ffffff"],"animated":true,"art":"ss2026_new_year_fx"}'::jsonb, NULL, NULL, 3026),
  ('ss2026_new_year_cards', 'card_back', 'Đếm Ngược Nửa Đêm', 'Midnight Countdown', 'Bộ sưu tập Năm Mới 2026.', 'Happy New Year 2026 collection.', 'rare', 'season', false, 'released', '{"colors":["#141c5a","#05081e","#ff4fd8"],"animated":false,"art":"ss2026_new_year_cards"}'::jsonb, NULL, NULL, 3027),
  ('ss2026_new_year_bubble', 'chat_bubble', 'Lấp Lánh Năm Mới', 'New Year Sparkle', 'Bộ sưu tập Năm Mới 2026.', 'Happy New Year 2026 collection.', 'rare', 'season', false, 'released', '{"colors":["#141c5a","#3b4cc0","#ffd76a"],"animated":false,"art":"ss2026_new_year_bubble"}'::jsonb, NULL, NULL, 3028),
  ('ss2026_new_year_title', 'title', 'Nhà Vô Địch Năm Mới', 'New Year Champion', 'Bộ sưu tập Năm Mới 2026.', 'Happy New Year 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#fff3c4","#ffd76a","#ff4fd8"],"animated":false,"art":"ss2026_new_year_title"}'::jsonb, NULL, NULL, 3029),
  ('ss2026_lunar_new_year_table', 'table_skin', 'Cung Điện Âm Lịch', 'Lunar Palace', 'Nỉ đỏ son, hoa mai vàng và viền sơn mài. Bộ sưu tập Tết Nguyên Đán 2026.', 'Vermilion felt, golden apricot blossoms and a lacquer rail. Lunar New Year 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#d8303a","#8a0f18","#3a0408","#ffd23d"],"animated":false,"art":"ss2026_lunar_new_year_table"}'::jsonb, NULL, NULL, 3030),
  ('ss2026_lunar_new_year_fx', 'victory_effect', 'Mưa Tài Lộc', 'Fortune Rain', 'Mưa đồng tiền vàng và lì xì may mắn. Bộ sưu tập Tết Nguyên Đán 2026.', 'A rain of gold coins and lucky envelopes. Lunar New Year 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#ffd23d","#e0262f","#fff1a8"],"animated":true,"art":"ss2026_lunar_new_year_fx"}'::jsonb, NULL, NULL, 3031),
  ('ss2026_lunar_new_year_cards', 'card_back', 'Đỏ May Mắn', 'Lucky Red', 'Bộ sưu tập Tết Nguyên Đán 2026.', 'Lunar New Year 2026 collection.', 'rare', 'season', false, 'released', '{"colors":["#c8202a","#5a0a10","#ffe066"],"animated":false,"art":"ss2026_lunar_new_year_cards"}'::jsonb, NULL, NULL, 3032),
  ('ss2026_lunar_new_year_bubble', 'chat_bubble', 'Đèn Lồng May Mắn', 'Lucky Lantern', 'Bộ sưu tập Tết Nguyên Đán 2026.', 'Lunar New Year 2026 collection.', 'rare', 'season', false, 'released', '{"colors":["#8a0f18","#d8303a","#ffd23d"],"animated":false,"art":"ss2026_lunar_new_year_bubble"}'::jsonb, NULL, NULL, 3033),
  ('ss2026_lunar_new_year_title', 'title', 'Xuân Phú Quý', 'Xuân Phú Quý', 'Bộ sưu tập Tết Nguyên Đán 2026.', 'Lunar New Year 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#fff1a8","#ffd23d","#e0262f"],"animated":false,"art":"ss2026_lunar_new_year_title"}'::jsonb, NULL, NULL, 3034),
  ('ss2026_valentine_table', 'table_skin', 'Phòng Hoa Hồng', 'Rose Lounge', 'Nỉ hồng nhung, cánh hoa hồng rải và viền vàng hồng. Bộ sưu tập Valentine 2026.', 'Rose velvet felt, scattered petals and a rose-gold rail. Valentine''s Day 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#e04a7a","#8a1240","#2a0414","#ffd6e0"],"animated":false,"art":"ss2026_valentine_table"}'::jsonb, NULL, NULL, 3035),
  ('ss2026_valentine_fx', 'victory_effect', 'Lễ Hội Trái Tim', 'Heart Celebration', 'Những trái tim bay lên rộn ràng. Bộ sưu tập Valentine 2026.', 'Hearts flutter upwards. Valentine''s Day 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#ff4f7a","#ffc2d1","#ffffff"],"animated":true,"art":"ss2026_valentine_fx"}'::jsonb, NULL, NULL, 3036),
  ('ss2026_valentine_cards', 'card_back', 'Trái Tim Hồng Ngọc', 'Ruby Hearts', 'Bộ sưu tập Valentine 2026.', 'Valentine''s Day 2026 collection.', 'rare', 'season', false, 'released', '{"colors":["#c0245e","#4a0620","#ffc2d1"],"animated":false,"art":"ss2026_valentine_cards"}'::jsonb, NULL, NULL, 3037),
  ('ss2026_valentine_bubble', 'chat_bubble', 'Lời Nhắn Ngọt Ngào', 'Sweet Message', 'Bộ sưu tập Valentine 2026.', 'Valentine''s Day 2026 collection.', 'rare', 'season', false, 'released', '{"colors":["#8a1240","#e04a7a","#ffd6e0"],"animated":false,"art":"ss2026_valentine_bubble"}'::jsonb, NULL, NULL, 3038),
  ('ss2026_valentine_title', 'title', 'Người Sưu Tầm Trái Tim', 'Heart Collector', 'Bộ sưu tập Valentine 2026.', 'Valentine''s Day 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#ffd6e0","#ff4f7a","#c0245e"],"animated":false,"art":"ss2026_valentine_title"}'::jsonb, NULL, NULL, 3039),
  ('ss2026_summer_table', 'table_skin', 'Sòng Bài Nhiệt Đới', 'Tropical Casino', 'Nỉ xanh ngọc như biển, sóng nắng và viền san hô. Bộ sưu tập Lễ Hội Mùa Hè 2026.', 'Turquoise sea felt, sunny waves and a coral rail. Summer Festival 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#26c6c0","#0a7a8a","#033040","#ffb21a"],"animated":false,"art":"ss2026_summer_table"}'::jsonb, NULL, NULL, 3040),
  ('ss2026_summer_fx', 'victory_effect', 'Té Nước Mùa Hè', 'Summer Splash', 'Bọt sóng và ngọc trai bắn tung. Bộ sưu tập Lễ Hội Mùa Hè 2026.', 'Waves and pearls splash around. Summer Festival 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#9ae6ff","#ffffff","#ffd23d"],"animated":true,"art":"ss2026_summer_fx"}'::jsonb, NULL, NULL, 3041),
  ('ss2026_summer_cards', 'card_back', 'Gió Biển', 'Ocean Breeze', 'Bộ sưu tập Lễ Hội Mùa Hè 2026.', 'Summer Festival 2026 collection.', 'rare', 'season', false, 'released', '{"colors":["#1aa0c8","#073a5a","#fff6a8"],"animated":false,"art":"ss2026_summer_cards"}'::jsonb, NULL, NULL, 3042),
  ('ss2026_summer_bubble', 'chat_bubble', 'Sóng Nắng', 'Sunny Wave', 'Bộ sưu tập Lễ Hội Mùa Hè 2026.', 'Summer Festival 2026 collection.', 'rare', 'season', false, 'released', '{"colors":["#0a6a8a","#26c6c0","#fff6a8"],"animated":false,"art":"ss2026_summer_bubble"}'::jsonb, NULL, NULL, 3043),
  ('ss2026_summer_title', 'title', 'Ngôi Sao Mùa Hè', 'Summer Star', 'Bộ sưu tập Lễ Hội Mùa Hè 2026.', 'Summer Festival 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#fff6a8","#ffb21a","#26c6c0"],"animated":false,"art":"ss2026_summer_title"}'::jsonb, NULL, NULL, 3044),
  ('ss2026_mid_autumn_table', 'table_skin', 'Cung Trăng', 'Moon Palace', 'Nỉ xanh đêm, trăng tròn và đèn lồng, viền sơn mài nâu. Bộ sưu tập Trung Thu 2026.', 'Night felt with a full moon and lanterns, brown lacquer rail. Mid-Autumn Festival 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#3a3a8a","#1a1a4a","#070720","#ff6b5a"],"animated":false,"art":"ss2026_mid_autumn_table"}'::jsonb, NULL, NULL, 3045),
  ('ss2026_mid_autumn_fx', 'victory_effect', 'Ánh Trăng Rằm', 'Lunar Glow', 'Trăng rằm tỏa sáng và đèn lồng bay lên. Bộ sưu tập Trung Thu 2026.', 'A full moon glows as lanterns rise. Mid-Autumn Festival 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#ffe6a8","#ff6b5a","#ffffff"],"animated":true,"art":"ss2026_mid_autumn_fx"}'::jsonb, NULL, NULL, 3046),
  ('ss2026_mid_autumn_cards', 'card_back', 'Bài Ánh Trăng', 'Moonlight Cards', 'Bộ sưu tập Trung Thu 2026.', 'Mid-Autumn Festival 2026 collection.', 'rare', 'season', false, 'released', '{"colors":["#2a2a6a","#0a0a24","#fff6c4"],"animated":false,"art":"ss2026_mid_autumn_cards"}'::jsonb, NULL, NULL, 3047),
  ('ss2026_mid_autumn_bubble', 'chat_bubble', 'Đèn Lồng Trăng', 'Moon Lantern', 'Bộ sưu tập Trung Thu 2026.', 'Mid-Autumn Festival 2026 collection.', 'rare', 'season', false, 'released', '{"colors":["#1a1a4a","#3a3a8a","#ffe6a8"],"animated":false,"art":"ss2026_mid_autumn_bubble"}'::jsonb, NULL, NULL, 3048),
  ('ss2026_mid_autumn_title', 'title', 'Hộ Vệ Ánh Trăng', 'Moonlight Guardian', 'Bộ sưu tập Trung Thu 2026.', 'Mid-Autumn Festival 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#fffbe6","#ffd98a","#8a8aff"],"animated":false,"art":"ss2026_mid_autumn_title"}'::jsonb, NULL, NULL, 3049),
  ('ss2026_anniversary_table', 'table_skin', 'Đại Sảnh Hoàng Gia Keyo', 'Keyo Royal Hall', 'Nỉ tím hoàng gia, hoa văn chữ K vàng và viền mạ vàng. Bộ sưu tập Kỷ Niệm Keyo 2026.', 'Royal purple felt, gold K damask and a gilded rail. Keyo Anniversary 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#7a3ad0","#3a1478","#120530","#c13cff"],"animated":false,"art":"ss2026_anniversary_table"}'::jsonb, NULL, NULL, 3050),
  ('ss2026_anniversary_fx', 'victory_effect', 'Jackpot Kỷ Niệm', 'Anniversary Jackpot', 'Bánh kỷ niệm, kim cương và đồng xu vàng. Bộ sưu tập Kỷ Niệm Keyo 2026.', 'Anniversary cake, diamonds and gold coins. Keyo Anniversary 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#ffd76a","#c13cff","#ffffff"],"animated":true,"art":"ss2026_anniversary_fx"}'::jsonb, NULL, NULL, 3051),
  ('ss2026_anniversary_cards', 'card_back', 'Phiên Bản Kỷ Niệm', 'Anniversary Edition', 'Bộ sưu tập Kỷ Niệm Keyo 2026.', 'Keyo Anniversary 2026 collection.', 'rare', 'season', false, 'released', '{"colors":["#4a1a8a","#14052a","#c13cff"],"animated":false,"art":"ss2026_anniversary_cards"}'::jsonb, NULL, NULL, 3052),
  ('ss2026_anniversary_bubble', 'chat_bubble', 'Vàng Lễ Hội', 'Celebration Gold', 'Bộ sưu tập Kỷ Niệm Keyo 2026.', 'Keyo Anniversary 2026 collection.', 'rare', 'season', false, 'released', '{"colors":["#4a3510","#8a6a1a","#fff3b0"],"animated":false,"art":"ss2026_anniversary_bubble"}'::jsonb, NULL, NULL, 3053),
  ('ss2026_anniversary_title', 'title', 'Huyền Thoại Kỷ Niệm', 'Anniversary Legend', 'Bộ sưu tập Kỷ Niệm Keyo 2026.', 'Keyo Anniversary 2026 collection.', 'epic', 'season', false, 'released', '{"colors":["#fff6d6","#ffd76a","#c13cff"],"animated":false,"art":"ss2026_anniversary_title"}'::jsonb, NULL, NULL, 3054)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
UPDATE catalog_items SET status = 'released', updated_at = now() WHERE id LIKE 'ss2026\_%' AND kind = 'frame' AND status = 'draft' AND price_silver IS NULL;
--> statement-breakpoint
-- 2026 seasonal collections: drafts (nothing is sold until the Owner approves each one).
INSERT INTO cosmetic_collections (id, theme, year, name_vi, name_en, starts_at, ends_at) VALUES
('halloween_2026', 'halloween', 2026, 'Halloween 2026', 'Halloween 2026', '2026-10-19T17:00:00.000Z'::timestamptz, '2026-11-03T17:00:00.000Z'::timestamptz),
  ('christmas_2026', 'christmas', 2026, 'Giáng Sinh 2026', 'Christmas 2026', '2026-12-14T17:00:00.000Z'::timestamptz, '2027-01-01T17:00:00.000Z'::timestamptz),
  ('new_year_2026', 'new_year', 2026, 'Năm Mới 2026', 'Happy New Year 2026', '2026-12-27T17:00:00.000Z'::timestamptz, '2027-01-06T17:00:00.000Z'::timestamptz),
  ('lunar_new_year_2026', 'lunar_new_year', 2026, 'Tết Nguyên Đán 2026', 'Lunar New Year 2026', '2027-01-19T17:00:00.000Z'::timestamptz, '2027-02-09T17:00:00.000Z'::timestamptz),
  ('valentine_2026', 'valentine', 2026, 'Valentine 2026', 'Valentine''s Day 2026', '2027-02-06T17:00:00.000Z'::timestamptz, '2027-02-16T17:00:00.000Z'::timestamptz),
  ('summer_2026', 'summer', 2026, 'Lễ Hội Mùa Hè 2026', 'Summer Festival 2026', '2027-06-19T17:00:00.000Z'::timestamptz, '2027-07-10T17:00:00.000Z'::timestamptz),
  ('mid_autumn_2026', 'mid_autumn', 2026, 'Trung Thu 2026', 'Mid-Autumn Festival 2026', '2027-09-09T17:00:00.000Z'::timestamptz, '2027-09-24T17:00:00.000Z'::timestamptz),
  ('anniversary_2026', 'anniversary', 2026, 'Kỷ Niệm Keyo 2026', 'Keyo Anniversary 2026', '2027-07-31T17:00:00.000Z'::timestamptz, '2027-08-14T17:00:00.000Z'::timestamptz)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO collection_items (collection_id, item_id, price, currency, sort) VALUES
('halloween_2026', 'ss2026_halloween_table', 45000, 'silver', 0),
  ('halloween_2026', 'ss2026_halloween_fx', 40000, 'silver', 1),
  ('halloween_2026', 'ss2026_halloween_cards', 15000, 'silver', 2),
  ('halloween_2026', 'ss2026_halloween_bubble', 12000, 'silver', 3),
  ('halloween_2026', 'ss2026_halloween_title', 20000, 'silver', 4),
  ('halloween_2026', 'ss2026_pumpkin_night', 20000, 'silver', 5),
  ('halloween_2026', 'ss2026_haunted_moon', 40000, 'silver', 6),
  ('halloween_2026', 'ss2026_phantom_crown', 80, 'gold', 7),
  ('christmas_2026', 'ss2026_christmas_table', 45000, 'silver', 0),
  ('christmas_2026', 'ss2026_christmas_fx', 40000, 'silver', 1),
  ('christmas_2026', 'ss2026_christmas_cards', 15000, 'silver', 2),
  ('christmas_2026', 'ss2026_christmas_bubble', 12000, 'silver', 3),
  ('christmas_2026', 'ss2026_christmas_title', 20000, 'silver', 4),
  ('christmas_2026', 'ss2026_snowflake', 20000, 'silver', 5),
  ('christmas_2026', 'ss2026_golden_christmas', 40000, 'silver', 6),
  ('christmas_2026', 'ss2026_winter_royalty', 80, 'gold', 7),
  ('new_year_2026', 'ss2026_new_year_table', 45000, 'silver', 0),
  ('new_year_2026', 'ss2026_new_year_fx', 40000, 'silver', 1),
  ('new_year_2026', 'ss2026_new_year_cards', 15000, 'silver', 2),
  ('new_year_2026', 'ss2026_new_year_bubble', 12000, 'silver', 3),
  ('new_year_2026', 'ss2026_new_year_title', 20000, 'silver', 4),
  ('new_year_2026', 'ss2026_midnight_fireworks', 20000, 'silver', 5),
  ('new_year_2026', 'ss2026_golden_countdown', 40000, 'silver', 6),
  ('new_year_2026', 'ss2026_new_year_royal', 80, 'gold', 7),
  ('lunar_new_year_2026', 'ss2026_lunar_new_year_table', 45000, 'silver', 0),
  ('lunar_new_year_2026', 'ss2026_lunar_new_year_fx', 40000, 'silver', 1),
  ('lunar_new_year_2026', 'ss2026_lunar_new_year_cards', 15000, 'silver', 2),
  ('lunar_new_year_2026', 'ss2026_lunar_new_year_bubble', 12000, 'silver', 3),
  ('lunar_new_year_2026', 'ss2026_lunar_new_year_title', 20000, 'silver', 4),
  ('lunar_new_year_2026', 'ss2026_lucky_lantern', 20000, 'silver', 5),
  ('lunar_new_year_2026', 'ss2026_golden_blossom', 40000, 'silver', 6),
  ('lunar_new_year_2026', 'ss2026_lunar_emperor', 80, 'gold', 7),
  ('valentine_2026', 'ss2026_valentine_table', 45000, 'silver', 0),
  ('valentine_2026', 'ss2026_valentine_fx', 40000, 'silver', 1),
  ('valentine_2026', 'ss2026_valentine_cards', 15000, 'silver', 2),
  ('valentine_2026', 'ss2026_valentine_bubble', 12000, 'silver', 3),
  ('valentine_2026', 'ss2026_valentine_title', 20000, 'silver', 4),
  ('valentine_2026', 'ss2026_ruby_heart', 20000, 'silver', 5),
  ('valentine_2026', 'ss2026_rose_crown', 40000, 'silver', 6),
  ('valentine_2026', 'ss2026_eternal_love', 80, 'gold', 7),
  ('summer_2026', 'ss2026_summer_table', 45000, 'silver', 0),
  ('summer_2026', 'ss2026_summer_fx', 40000, 'silver', 1),
  ('summer_2026', 'ss2026_summer_cards', 15000, 'silver', 2),
  ('summer_2026', 'ss2026_summer_bubble', 12000, 'silver', 3),
  ('summer_2026', 'ss2026_summer_title', 20000, 'silver', 4),
  ('summer_2026', 'ss2026_tropical_sun', 20000, 'silver', 5),
  ('summer_2026', 'ss2026_ocean_pearl', 40000, 'silver', 6),
  ('summer_2026', 'ss2026_summer_crown', 80, 'gold', 7),
  ('mid_autumn_2026', 'ss2026_mid_autumn_table', 45000, 'silver', 0),
  ('mid_autumn_2026', 'ss2026_mid_autumn_fx', 40000, 'silver', 1),
  ('mid_autumn_2026', 'ss2026_mid_autumn_cards', 15000, 'silver', 2),
  ('mid_autumn_2026', 'ss2026_mid_autumn_bubble', 12000, 'silver', 3),
  ('mid_autumn_2026', 'ss2026_mid_autumn_title', 20000, 'silver', 4),
  ('mid_autumn_2026', 'ss2026_moon_rabbit', 20000, 'silver', 5),
  ('mid_autumn_2026', 'ss2026_golden_moon', 40000, 'silver', 6),
  ('mid_autumn_2026', 'ss2026_moon_palace', 80, 'gold', 7),
  ('anniversary_2026', 'ss2026_anniversary_table', 45000, 'silver', 0),
  ('anniversary_2026', 'ss2026_anniversary_fx', 40000, 'silver', 1),
  ('anniversary_2026', 'ss2026_anniversary_cards', 15000, 'silver', 2),
  ('anniversary_2026', 'ss2026_anniversary_bubble', 12000, 'silver', 3),
  ('anniversary_2026', 'ss2026_anniversary_title', 20000, 'silver', 4),
  ('anniversary_2026', 'ss2026_anniversary_gold', 20000, 'silver', 5),
  ('anniversary_2026', 'ss2026_anniversary_diamond', 40000, 'silver', 6),
  ('anniversary_2026', 'ss2026_keyo_royal_legacy', 80, 'gold', 7)
ON CONFLICT DO NOTHING;
