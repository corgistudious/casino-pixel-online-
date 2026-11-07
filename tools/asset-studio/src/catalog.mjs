/**
 * KEYO master asset catalog: every asset the studio knows about, with the structured fields each
 * prompt is built from (prompt.mjs). The manifest (manifest.json) is generated from this catalog and
 * keeps each asset's review/generation history; editing the catalog never resets a status.
 *
 * Conventions
 * - id: `<category>.<subcategory>.<name>` in kebab-case, stable forever (files are stored by id).
 * - transparent: true → PNG with real alpha; the object must not touch the canvas edges.
 * - size: a standard GPT image size; delivery files are downscaled to ≤1024 px (game upload limit).
 * - batch: 'sample-1' marks the first premium sample batch (Phase 5).
 * - existing: assets already in the repo; never regenerated, renamed, moved or overwritten.
 */

const SQ = '1024x1024';
const TALL = '1024x1536';
const WIDE = '1536x1024';

const assets = [];
const add = (a) => {
  assets.push({
    transparent: true,
    size: SQ,
    camera: 'Three-quarter front view, slightly from above, centred.',
    composition: 'Single object centred with about 8% empty margin on every side; nothing touches the canvas edges.',
    animation: null,
    rarity: null,
    priority: 'P2',
    batch: null,
    ...a,
  });
};

// ---------------------------------------------------------------- existing (never regenerated)
const existing = (id, system, name, file, note) =>
  assets.push({ id, category: 'existing', subcategory: system, system, name, description: note, existing: { file, note }, transparent: true, size: null, priority: 'P0', batch: null });
existing('existing.currency.cxu-silver', 'Bank / Economy', 'Cxu Bạc', 'apps/web/public/assets/official/cxu-bac.png', 'Official silver currency icon. Do not recreate.');
existing('existing.currency.cxu-gold', 'Bank / Economy', 'Cxu Vàng', 'apps/web/public/assets/official/cxu-vang.png', 'Official gold currency icon. Do not recreate.');
existing('existing.badge.verified', 'Identity', 'Verified Badge', 'apps/web/public/assets/official/badge-verified.png', 'Official verified badge.');
existing('existing.badge.partner', 'Identity', 'Partner Badge', 'apps/web/public/assets/official/badge-partner.png', 'Official partner badge.');
existing('existing.item.rename-card', 'Identity', 'Rename Card', 'apps/web/public/assets/official/rename-card.png', 'Official rename card item.');
existing('existing.brand.logo', 'Brand', 'Keyo Game Logo', 'apps/web/public/assets/official/keyo-game-logo.png', 'Official logo (also "Logo Keyo Game.png").');
existing('existing.ui.hall', 'Lobby', 'V7.1 Hall backdrop', 'apps/web/src/assets/v71/hall.svg', 'V7.1 lobby hall artwork (SVG).');
existing('existing.procedural.game-art', 'Games', 'Procedural 2.5D game art', 'apps/web/src/game/art.ts', 'Code-drawn cards, chips, dice, plate/dome, bowl, roulette wheel+bowl, slot symbols & cabinet (V7.1 2.5D). In use; AI art may replace pieces only after user approval.');
existing('existing.procedural.cosmetics', 'Cosmetics', 'Procedural cosmetics (DB-seeded)', 'apps/web/src/cosmetics/', 'SVG/CSS-drawn frames (81 seeded), chat bubbles (16), titles (11), card backs (12), table skins (13), avatars (7), victory effects (14). In use.');

// ---------------------------------------------------------------- games
const GAME = (id, sub, system, name, description, object, materials, extra = {}) =>
  add({ id: `game.${id}`, category: 'game', subcategory: sub, system, name, description, object, materials, ...extra });

// A. Sic Bo / Tài Xỉu
GAME('taixiu.bowl-cover', 'taixiu', 'Sic Bo / Tài Xỉu', 'Tài Xỉu bowl cover (top view)', 'The lacquered cover that hides the dice on the shared Tài Xỉu table.',
  'An inverted round lacquered dice cover seen exactly from above: glossy black-cherry lacquer dome, a red lacquer band with a fine repeating gold diamond motif, a turned gold knob at the centre, soft reflections on the upper-left of the dome.',
  'black and deep red lacquer, polished gold inlay', { camera: 'Orthographic top-down view, perfectly circular.', composition: 'Perfectly circular object centred, 8% margin.', priority: 'P1', batch: 'sample-1', animation: 'Rotates/shakes and lifts in code (Phaser tween); must stay circular from above.' });
GAME('sicbo.dice-plate', 'sicbo', 'Sic Bo / Tài Xỉu', 'Porcelain dice plate', 'Plate the three dice rest on.', 'A round porcelain dice plate seen from above with a bevelled gold rim and a cobalt-blue glaze ring with small dot motifs; empty plate, no dice.', 'white porcelain, cobalt glaze, polished gold', { camera: 'Orthographic top-down view, perfectly circular.' });
GAME('sicbo.dice-set', 'sicbo', 'Sic Bo / Tài Xỉu', 'Premium dice (face 1–6 sheet)', 'Six die faces for the dice set.', 'Six identical ivory dice with rounded bevelled edges arranged in a neat 3×2 grid, each showing a different face 1 to 6 seen from the front, carved pips (pips 1 and 4 red, others deep navy).', 'warm ivory resin, lacquered pips', { size: WIDE, composition: 'Even 3×2 grid, equal spacing, every die fully visible.', priority: 'P2' });
GAME('sicbo.crystal-dome', 'sicbo', 'Sic Bo / Tài Xỉu', 'Crystal shaker dome', 'Shaker dome over the plate during the roll.', 'A transparent cut-crystal dome seen from above with a thin gold base ring and a small gold knob, faint violet tint, clean specular streaks.', 'cut crystal, gold', { camera: 'Orthographic top-down view.' });
GAME('sicbo.icon-big', 'sicbo', 'Sic Bo / Tài Xỉu', 'Big (Tài) emblem', 'Emblem for the Big bet.', 'A bold upward-rising gold emblem: three stacked dice with a crown, warm ruby accents.', 'gold, ruby', {});
GAME('sicbo.icon-small', 'sicbo', 'Sic Bo / Tài Xỉu', 'Small (Xỉu) emblem', 'Emblem for the Small bet.', 'A compact sapphire-and-silver emblem: a single small die inside a crescent shield.', 'silver, sapphire', {});
GAME('sicbo.icon-triple', 'sicbo', 'Sic Bo / Tài Xỉu', 'Triple emblem', 'Emblem for any-triple bets.', 'Three identical dice fanned in a triangle inside an amethyst gem frame with small sparkles.', 'amethyst, gold, ivory', {});
GAME('sicbo.table-vip', 'sicbo', 'Sic Bo / Tài Xỉu', 'VIP dice table felt', 'Opaque felt texture for the VIP dice table (layout drawn in code on top).', 'A seamless-looking deep emerald velvet felt surface with a subtle embossed royal damask pattern and soft centre spotlight, no markings.', 'velvet felt', { transparent: false, size: WIDE, camera: 'Top-down flat surface.', composition: 'Full-bleed texture, evenly lit, no objects.' });

// B. Roulette
GAME('roulette.wheel-head', 'roulette', 'Roulette', 'Roulette wheel head (no numbers)', 'Spinning wheel head; numbers are drawn in code so they stay correct.', 'A European roulette wheel head (the spinning part only) seen from directly above. From the outside in: a thin polished gold outer lip; EXACTLY ONE single ring of 37 evenly spaced pockets — 18 ruby red and 18 charcoal black strictly alternating, plus one emerald green pocket — separated by thin gold frets; inside that single ring a smooth mahogany cone with a soft highlight; a four-arm polished gold turret at the centre. There is only one ring of coloured pockets (no second inner ring, no number ring, no outer bowl, no diamond deflectors, no ball track). Pockets carry NO numbers or text.', 'mahogany, lacquer, polished gold', { camera: 'Orthographic top-down, perfectly circular and radially symmetric.', priority: 'P1', batch: 'sample-1', animation: 'Rotated in code; must be radially symmetric.' });
GAME('roulette.wheel-rim', 'roulette', 'Roulette', 'Wheel bowl rim', 'Static bowl ring around the wheel.', 'A circular polished mahogany bowl ring seen from above with eight small gold diamond deflectors and a gold inner lip; the centre is empty and fully transparent.', 'mahogany, gold', { camera: 'Orthographic top-down.' });
GAME('roulette.ball', 'roulette', 'Roulette', 'Roulette ball', 'Ivory ball.', 'A single small glossy ivory-white ball with a crisp highlight.', 'ivory', {});
GAME('roulette.pointer', 'roulette', 'Roulette', 'Result pointer', 'Pointer marking the winning pocket.', 'A slim gold arrow pointer with a small ruby, pointing downwards.', 'gold, ruby', {});
GAME('roulette.marker', 'roulette', 'Roulette', 'Betting marker (dolly)', 'Marker placed on the winning number.', 'A crystal-and-gold dolly marker shaped like a small crowned pillar.', 'crystal, gold', {});
GAME('roulette.result-emblem', 'roulette', 'Roulette', 'Result emblem', 'Badge behind the winning number (number added by UI).', 'An empty circular medallion with gold laurel rim and a dark lacquer centre, ready for a number overlay.', 'gold, lacquer', {});

// C–E. Card games (Poker, Liêng, Xì Tố)
GAME('poker.dealer-button', 'poker', "Texas Hold'em Poker", 'Dealer button (no letters)', 'Dealer marker puck.', 'A thick round ivory dealer puck with a gold rim and an embossed gold crown in the centre, seen at a slight angle so its thickness shows; no letters.', 'ivory acrylic, gold', { priority: 'P1', batch: 'sample-1' });
GAME('poker.blind-small', 'poker', "Texas Hold'em Poker", 'Small blind marker', 'Small blind puck.', 'A round sapphire-blue puck with a silver rim and an embossed single small coin motif; no letters.', 'blue acrylic, silver', {});
GAME('poker.blind-big', 'poker', "Texas Hold'em Poker", 'Big blind marker', 'Big blind puck.', 'A round ruby-red puck with a gold rim and an embossed double coin motif; no letters.', 'red acrylic, gold', {});
GAME('poker.pot-pile', 'poker', "Texas Hold'em Poker", 'Pot chip pile', 'Chips piled in the pot.', 'A loose pile of glossy casino chips in mixed colours (red, blue, green, purple, black) with gold edge inserts, no numbers.', 'clay composite chips, gold', {});
GAME('poker.table-felt-royal', 'poker', "Texas Hold'em Poker", 'Royal oval table (opaque)', 'Royal purple oval table felt+rail backdrop (seats/cards in code).', 'An oval poker table seen from directly above: royal purple velvet felt with a faint printed gold line ring, padded dark leather rail with gold piping; empty table, no cards or chips.', 'velvet, leather, gold', { transparent: false, size: WIDE, camera: 'Orthographic top-down.', composition: 'Table fills ~90% of the width, centred, on a very dark plum floor.' });
GAME('cards.chip-stack', 'cards', 'Card games', 'Chip stack', 'Player chip stack.', 'A neat stack of six glossy casino chips (alternating red and black) with gold edge inserts, viewed in three-quarter so the thickness shows; no numbers.', 'clay composite, gold', {});
GAME('cards.action-fold', 'cards', 'Card games', 'Fold icon', 'Action icon.', 'Two playing cards face-down being slid away, simple bold silhouette in rose-red and white.', 'enamel', { size: SQ });
GAME('cards.action-call', 'cards', 'Card games', 'Call icon', 'Action icon.', 'A single gold chip being pushed forward with a soft motion arc, sapphire accents.', 'enamel, gold', {});
GAME('cards.action-raise', 'cards', 'Card games', 'Raise icon', 'Action icon.', 'A rising stack of three gold chips with an upward chevron, emerald accents.', 'enamel, gold', {});
GAME('cards.action-allin', 'cards', 'Card games', 'All-in icon', 'Action icon.', 'A tall chip tower with a crown and small sparks, royal purple and gold.', 'enamel, gold', {});
GAME('lieng.reveal-fan', 'lieng', 'Liêng', 'Three-card reveal fan', 'Three-card hand reveal emblem.', 'Three playing card backs fanned upright with a burst of soft gold light behind them; no faces, no text.', 'card stock, gold foil', {});
GAME('xito.dealer-marker', 'xito', 'Xì Tố', 'Xì Tố dealer marker', 'Marker for the first-to-act / dealer seat.', 'A small gold shield marker with an embossed spade and two crossed cards; no letters.', 'gold', {});

// F–G. Blackjack (shared)
GAME('blackjack.card-shoe', 'blackjack', 'Blackjack (Multiplayer & Solo)', 'Card shoe', 'Dealer card shoe.', 'A stylized dealer card shoe: smoked dark acrylic body with gold trim and a slanted front where a single card back peeks out.', 'smoked acrylic, gold', { priority: 'P1', batch: 'sample-1' });
GAME('blackjack.result-emblem', 'blackjack', 'Blackjack (Multiplayer & Solo)', 'Blackjack result emblem (no text)', 'Emblem shown on a natural blackjack.', 'An ace and a jack card back-to-back fanned behind a gold crest with a small crown and sparkle; card faces are simplified with only suit pips, no letters or numbers.', 'gold, enamel', {});
for (const [k, name, obj] of [
  ['hit', 'Hit', 'a single card sliding in with a plus-shaped sparkle'],
  ['stand', 'Stand', 'an open hand gesture icon over a card, calm sapphire'],
  ['double', 'Double', 'two stacked chips with a ×2-like twin arrow motif (no digits)'],
  ['split', 'Split', 'two cards splitting apart with a gold divider'],
  ['insurance', 'Insurance', 'a gold shield over a chip'],
]) GAME(`blackjack.action-${k}`, 'blackjack', 'Blackjack (Multiplayer & Solo)', `${name} icon`, 'Action icon.', `A bold rounded game icon showing ${obj}, enamel and gold, readable at 44 px.`, 'enamel, gold', {});
GAME('blackjack.table-felt', 'blackjack', 'Blackjack (Multiplayer & Solo)', 'Blackjack arc table (opaque)', 'Arc table felt backdrop (layout drawn in code).', 'A blackjack table arc seen from directly above: deep emerald felt, padded leather rail along the bottom arc with gold piping, faint printed gold arc line; empty, no text.', 'velvet, leather, gold', { transparent: false, size: WIDE, camera: 'Orthographic top-down.' });

// H. Slots (symbols match packages/shared/src/games/slots.ts: cherry, lemon, bell, clover, diamond, seven, wild)
for (const [k, obj, mat, sample] of [
  ['seven', 'a bold lucky seven numeral (the only allowed glyph) in glossy ruby with a thick gold outline', 'ruby enamel, gold', false],
  ['diamond', 'a large brilliant-cut sapphire-blue diamond with crisp facets', 'cut gem', false],
  ['bell', 'a classic golden bell with a small bow', 'polished gold', false],
  ['cherry', 'a pair of glossy cherries with a leaf', 'glossy fruit', false],
  ['lemon', 'a glossy stylized lemon', 'glossy fruit', false],
  ['clover', 'a four-leaf clover in emerald with gold veins', 'emerald enamel, gold', false],
  ['wild', 'a golden star with a purple ribbon banner (banner left blank, no text)', 'gold, velvet ribbon', false],
  ['crown', 'a royal crown with rubies and sapphires (future symbol)', 'gold, gems', true],
  ['scatter', 'a glowing amethyst star-gem scatter emblem with orbiting sparkles (future symbol)', 'amethyst, gold', false],
  ['gold-bar', 'a stack of three gold bars (future symbol)', 'gold', false],
]) GAME(`slots.symbol-${k}`, 'slots', 'Slots', `Slot symbol: ${k}`, 'Reel symbol.', `A slot reel symbol: ${obj}, chunky and readable at 64 px.`, mat, { priority: sample ? 'P1' : 'P2', batch: sample ? 'sample-1' : null, camera: 'Front view, centred.' });
GAME('slots.cabinet-frame', 'slots', 'Slots', 'Slot machine frame', 'Ornate frame around the reels (centre transparent).', 'An ornate slot machine front frame: royal purple lacquer with gold trim, chrome bevel and small marquee bulbs; the reel window in the centre is a fully transparent rectangle.', 'lacquer, gold, chrome', { size: WIDE });
GAME('slots.spin-button', 'slots', 'Slots', 'Spin button', 'Round spin button.', 'A large round domed spin button in glossy ruby with a gold ring and an embossed circular-arrow motif; no text.', 'glossy acrylic, gold', {});

// ---------------------------------------------------------------- card back collection (shared by card games)
for (const [k, desc, sample] of [
  ['classic', 'classic deep navy back with a fine white lattice and a centred spade medallion', false],
  ['royal-gold', 'ivory back with an intricate symmetrical gold filigree and a crown medallion', true],
  ['royal-purple', 'royal purple velvet-look back with gold scrollwork border and a central fleur medallion', true],
  ['diamond', 'icy blue back with a geometric diamond lattice and a central cut-gem medallion', false],
  ['vip', 'black lacquer back with gold art-deco rays and a central VIP-style crest (no letters)', false],
  ['tournament', 'crimson back with crossed laurels and a trophy medallion', false],
  ['halloween', 'midnight purple back with stylized pumpkins and bats in a symmetrical pattern', false],
  ['christmas', 'emerald back with snowflakes, holly and a central star', false],
  ['lunar-new-year', 'red lacquer back with gold clouds, lanterns and a central stylized dragon coin', false],
  ['limited', 'iridescent pearl back with rose-gold geometric engraving and a jewel centre', false],
]) add({ id: `cardback.${k}`, category: 'cardback', subcategory: 'card-back', system: 'Card games', name: `Card back: ${k}`, description: 'Playing card back, shared by Poker, Liêng, Xì Tố and Blackjack.', object: `A single playing card back, perfectly upright and flat, rounded corners, ${desc}; strictly symmetrical (mirror on both axes), thin even border, no text.`, materials: 'premium card stock, foil', size: TALL, camera: 'Perfectly frontal, orthographic, no perspective.', composition: 'One card centred, card aspect 5:7, 6% margin.', priority: sample ? 'P1' : 'P2', batch: sample ? 'sample-1' : null, animation: 'Flip animation in code (scaleX); must be symmetrical.' });

// ---------------------------------------------------------------- VIP badges (15 distinct designs; level shown by UI text)
const VIP = [
  'the simplest badge of the whole set: a small plain heater-shaped shield in brushed silver with one clean bevelled rim and a smooth, slightly domed face; NO wings, NO laurels, NO stars, NO gems, NO crown, NO extra ornaments — modest and entry-level, but still polished and premium',
  'a silver shield with a single raised star',
  'a round silver crest with two laurel sprigs',
  'a gold hexagon badge with a bevelled rim',
  'a gold hexagon with small swept wings and a ruby centre',
  'a gold crest with two crossed sceptres',
  'a platinum diamond-shaped (rhombus) badge with an inner engraved ring',
  'a platinum badge with a sapphire centre and feathered side wings',
  'a platinum star crest set with three sapphires',
  'a faceted crystal-diamond shield with silver filigree',
  'a crystal-diamond crest topped by a slim crown',
  'a crystal-diamond emblem with spread angel wings',
  'a royal amethyst crest with a crown and an orb',
  'a royal phoenix-wing emblem in gold with rubies and amethysts',
  'a legendary celestial emblem: radiant gold halo, a jewelled imperial crown, diamond and amethyst inlays, the most majestic of all',
];
VIP.forEach((desc, i) => add({ id: `vip.badge.vip-${String(i + 1).padStart(2, '0')}`, category: 'vip', subcategory: 'badge', system: 'VIP', name: `VIP ${i + 1} badge`, description: `Badge for VIP level ${i + 1} (tier ${['silver', 'silver', 'silver', 'gold', 'gold', 'gold', 'platinum', 'platinum', 'platinum', 'diamond', 'diamond', 'diamond', 'royal', 'royal', 'royal'][i]}). Level number is UI text.`, object: `A VIP rank badge: ${desc}; its prestige clearly greater than lower levels; no numbers or text.`, materials: i < 3 ? 'brushed silver' : i < 6 ? 'polished gold, ruby' : i < 9 ? 'platinum, sapphire' : i < 12 ? 'cut crystal, silver' : 'gold, amethyst, ruby, diamond', camera: 'Front view, centred, symmetrical.', priority: [0, 7, 14].includes(i) ? 'P1' : 'P2', batch: [0, 7, 14].includes(i) ? 'sample-1' : null }));

// ---------------------------------------------------------------- avatar frames (centre fully transparent)
const FRAME_RULE = 'A circular avatar frame ring: the inner circle (about 72% of the diameter) is completely empty and fully transparent so a profile photo shows through; the ring is even, not too thick, nothing protrudes into the centre;';
const frame = (sub, k, name, desc, extra = {}) => add({ id: `frame.${sub}.${k}`, category: 'frame', subcategory: sub, system: 'Profile / Avatar frames', name, description: `${name} avatar frame.`, object: `${FRAME_RULE} ${desc}; no text.`, materials: extra.materials ?? 'gold, gems', camera: 'Perfectly frontal, circular, symmetrical.', composition: 'Ring centred, 5% margin, decorations stay outside the inner circle.', animation: 'Optional light sweep / sparkle overlay in CSS; never rotate the frame.', ...extra });
frame('vip', 'vip-05', 'VIP 5 frame', 'polished gold ring with a ruby at the bottom and small swept wings at the sides', { priority: 'P2' });
frame('vip', 'vip-07', 'VIP 7 frame', 'platinum ring with sapphire studs and a small crown at the top', { materials: 'platinum, sapphire' });
frame('vip', 'vip-10', 'VIP 10 frame', 'faceted crystal-diamond ring with silver filigree and a diamond crest at the top', { materials: 'crystal, silver' });
frame('vip', 'vip-15', 'VIP 15 frame', 'the most prestigious frame: double gold ring with diamond inlays, a jewelled imperial crown at the top, phoenix wings at the sides and a radiant amethyst at the bottom', { priority: 'P1', batch: 'sample-1', materials: 'gold, diamond, amethyst', animation: 'Gold shimmer + diamond sparkle overlay (CSS, reduced-motion aware).' });
for (const [k, desc, sample] of [
  ['halloween', 'purple and orange ring with tiny pumpkins and bats', false], ['christmas', 'emerald and red ring with holly, snowflakes and a small star', false],
  ['new-year', 'midnight blue ring with gold fireworks and confetti', false], ['lunar-new-year', 'red lacquer ring with gold clouds, two small lanterns hanging close to the ring at the sides and a compact coiled stylized dragon resting on the top of the ring (head, horns, whiskers and flames kept small and close to the ring). Every part — dragon, lanterns, tassels, clouds — stays inside the central 82% of the canvas, leaving a clearly empty transparent margin of at least 9% on all four sides', true],
  ['valentine', 'rose-gold ring with small hearts and roses', false], ['easter', 'pastel ring with painted eggs and spring flowers', false], ['summer', 'turquoise ring with sun, waves and pearls', false],
  ['thanksgiving', 'amber ring with autumn leaves and wheat', false], ['anniversary', 'gold ring with a ribbon, stars and a small cake medallion', false],
]) frame('seasonal', k, `${k} frame`, desc, { priority: sample ? 'P1' : 'P2', batch: sample ? 'sample-1' : null });
for (const [k, desc] of [['participant', 'simple bronze ring with a small banner'], ['top-100', 'silver ring with laurel'], ['top-10', 'gold ring with laurel and a star'], ['top-3', 'gold ring with laurel and three stars'], ['runner-up', 'silver-gold ring with a silver medal'], ['champion', 'gold ring with a trophy at the top and laurels'], ['seasonal-champion', 'gold and ruby ring with a trophy and seasonal ribbon'], ['grand-champion', 'grand gold ring with wings, a trophy-crown and diamonds']]) frame('tournament', k, `Tournament ${k} frame`, desc);
for (const [k, desc, sample] of [['founder', 'antique gold ring with a keystone emblem'], ['early-supporter', 'silver ring with a sprouting laurel'], ['kol', 'sleek violet-and-gold ring with a stylized broadcast star at the top and sound-wave accents', true], ['creator', 'teal and gold ring with a stylized brush-and-star emblem'], ['reviewer', 'sapphire ring with a stylized magnifier crest'], ['collector', 'emerald ring with small gem collection studs'], ['limited-edition', 'iridescent pearl ring with rose-gold engraving'], ['event-exclusive', 'ruby and gold ring with a ticket emblem'], ['anniversary-exclusive', 'champagne gold ring with ribbon and stars']]) frame('special', k, `${k} frame`, desc, { priority: sample ? 'P1' : 'P2', batch: sample ? 'sample-1' : null });

// ---------------------------------------------------------------- profile avatars (fantasy, no real people)
for (const [k, desc] of [['default', 'a friendly stylized corgi mascot head in a round badge'], ['premium', 'a stylized fox mascot in a gold-trimmed jacket'], ['royal', 'a stylized lion mascot with a small crown'], ['vip', 'a stylized panther mascot with sunglasses and gold chain'], ['limited', 'a stylized dragon hatchling mascot'], ['seasonal', 'a stylized snow rabbit mascot with a scarf'], ['tournament', 'a stylized eagle mascot with a laurel'], ['kol', 'a stylized parrot mascot with headphones'], ['collector', 'a stylized owl mascot with a monocle'], ['fantasy-dealer', 'a stylized fantasy casino dealer character (non-human, elf-like) with a vest and bow tie']]) add({ id: `avatar.${k}`, category: 'avatar', subcategory: 'profile-avatar', system: 'Profile', name: `Avatar: ${k}`, description: 'Profile avatar (fantasy mascot, no real people).', object: `${desc}, bust portrait, appealing and expressive, inside a circular composition.`, materials: 'stylized fur/feather/cloth', transparent: true, camera: 'Front three-quarter portrait.', composition: 'Round avatar badge: the character bust inside a soft plum gradient circle that fills about 94% of the canvas; everything outside the circle is fully transparent (real alpha).' });

// ---------------------------------------------------------------- chat bubbles (9-slice base art)
for (const [k, desc, sample] of [['default', 'clean dark plum glass bubble with a thin light rim', false], ['classic', 'warm ivory bubble with a thin gold rim', false], ['gold', 'polished gold-framed bubble with a dark plum interior and small corner ornaments', true], ['diamond', 'icy crystal-framed bubble with tiny diamond corners', false], ['vip', 'black lacquer bubble with gold art-deco corners', false], ['royal', 'royal purple velvet bubble with gold scroll corners', false], ['limited', 'iridescent pearl bubble with rose-gold corners', false], ['tournament', 'crimson bubble with laurel corners', false], ['champion', 'gold bubble with tiny trophy corner ornament', false], ['kol', 'violet gradient bubble with a small star corner', false], ['creator', 'teal bubble with a brush-stroke corner ornament', false], ['halloween', 'purple bubble with a tiny pumpkin corner', false], ['christmas', 'green bubble with a holly corner', false], ['lunar-new-year', 'red bubble with gold cloud corners', false], ['anniversary', 'champagne bubble with ribbon corner', false]]) add({ id: `bubble.${k}`, category: 'bubble', subcategory: 'chat-bubble', system: 'Chat', name: `Chat bubble: ${k}`, description: 'Chat bubble base art for 9-slice scaling (text rendered by the UI).', object: `A wide rounded-rectangle chat speech bubble with a small tail at the bottom-left: ${desc}. All decoration sits in the four corners and the tail; the long straight edges are plain and uniform so the bubble can be 9-slice stretched; the interior is an even flat fill with no text.`, materials: 'glass, metal trims', size: WIDE, camera: 'Perfectly frontal, flat.', composition: 'Bubble fills ~85% width, centred, straight edges perfectly horizontal/vertical.', priority: sample ? 'P1' : 'P2', batch: sample ? 'sample-1' : null });

// ---------------------------------------------------------------- titles & profile decorations
for (const k of ['champion', 'tournament-winner', 'high-roller', 'collector', 'lucky-player', 'jackpot-winner', 'vip-elite', 'founder', 'kol', 'creator', 'limited', 'seasonal', 'event-winner', 'grand-champion']) add({ id: `title.${k}`, category: 'title', subcategory: 'title-plate', system: 'Profile', name: `Title plate: ${k}`, description: 'Decorative plate behind a title (title text is UI text, VI/EN).', object: `A horizontal ornamental title plaque for "${k.replace(/-/g, ' ')}" (themed motifs at both ends), the centre is a plain empty band for UI text; no letters.`, materials: 'enamel, gold', size: WIDE, composition: 'Plaque centred, fills 90% width, ends symmetrical.' });
for (const [k, desc] of [['nameplate', 'a slim horizontal nameplate with gold end caps'], ['header', 'a wide profile header banner with royal purple drapery and gold trim (opaque)'], ['background', 'a soft premium casino lounge backdrop with bokeh lights (opaque)'], ['prestige-effect', 'a radial golden prestige burst emblem'], ['achievement-showcase', 'a velvet showcase shelf panel with three empty gold display slots'], ['accent-vip', 'a corner ornament in gold and amethyst'], ['accent-limited', 'a corner ornament in pearl and rose gold'], ['accent-kol', 'a corner ornament in violet with a star']]) add({ id: `profile.${k}`, category: 'profile', subcategory: 'decoration', system: 'Profile', name: `Profile ${k}`, description: 'Profile decoration.', object: `${desc}; no text.`, materials: 'velvet, gold', size: k === 'header' || k === 'background' ? WIDE : SQ, transparent: !(k === 'header' || k === 'background') });

// ---------------------------------------------------------------- effects (layers for Phaser/CSS animation)
for (const [k, desc] of [['normal-win', 'a warm gold sparkle burst with a few coins'], ['big-win', 'a large gold starburst with coins and gems'], ['mega-win', 'a grand radial burst with crown, coins and gems'], ['jackpot', 'a majestic jackpot burst with a treasure crown, cascading coins and light rays'], ['perfect-win', 'a crystalline radial burst with stars'], ['tournament-victory', 'a trophy with laurel and confetti burst'], ['champion-victory', 'a winged crown-trophy with radiant rays'], ['vip-victory', 'an amethyst-and-gold radial burst with a VIP crest (no letters)'], ['normal-lose', 'a soft subdued smoke puff in cool grey-blue'], ['bust', 'a cracked card emblem with small shards (not violent)'], ['push', 'two balanced chips with a soft neutral glow'], ['fold', 'folded cards with a soft fade swirl'], ['all-in', 'a chip tower with fiery gold aura (stylized, not realistic fire)'], ['reward-reveal', 'a soft beam of light with sparkles from below'], ['chest-opening', 'a burst of light and sparkles from an opening lid (lid not included)']]) add({ id: `fx.${k}`, category: 'fx', subcategory: 'effect-layer', system: 'Effects', name: `Effect: ${k}`, description: 'Static key layer for an effect animated in Phaser/CSS (reduced-motion: show statically).', object: `${desc}, designed as a single animatable layer; no text.`, materials: 'light, gold, gems', composition: 'Centred, radiating, fades to full transparency well before the edges.', animation: 'Scale/fade/rotate in code; reduced-motion shows a static frame.' });

// ---------------------------------------------------------------- bank & chests (Cxu icons are NOT recreated)
for (const [k, desc, sample] of [['vault-premium', 'a premium round bank vault door, closed, polished steel and gold with a large wheel handle', true], ['vault-open', 'the same premium vault door swung open showing a warm golden glow inside (no coins with text)', false], ['money-bag', 'a stylized canvas money bag tied with gold cord', false], ['money-bag-vip', 'a royal purple velvet money bag with gold embroidery and a small crown clasp', false]]) add({ id: `bank.${k}`, category: 'bank', subcategory: 'bank', system: 'Bank', name: `Bank: ${k}`, description: 'Bank screen art. Currency icons (Cxu Bạc/Vàng) are reused, never redrawn.', object: `${desc}; no currency symbols, no text.`, materials: 'steel, gold, velvet', priority: sample ? 'P1' : 'P2', batch: sample ? 'sample-1' : null });
for (const [k, desc, sample] of [['common', 'a sturdy wooden chest with iron bands'], ['rare', 'a sapphire-blue chest with silver bands'], ['epic', 'an amethyst chest with gold bands and gem studs'], ['legendary', 'a majestic gold chest with ruby and diamond inlays and a crown-shaped lock, faint golden glow from the seams', true], ['limited', 'a pearl and rose-gold chest'], ['event', 'a festive ruby chest with a ribbon']]) add({ id: `chest.${k}`, category: 'chest', subcategory: 'reward-chest', system: 'Rewards', name: `Chest: ${k}`, description: 'Reward chest (closed).', object: `${desc}, closed lid, three-quarter view; no text.`, materials: 'wood, metal, gems', rarity: k, priority: sample ? 'P1' : 'P2', batch: sample ? 'sample-1' : null });

// ---------------------------------------------------------------- collectibles (no real brands)
const coll = (sub, k, desc, rarity, sample = false) => add({ id: `collectible.${sub}.${k}`, category: 'collectible', subcategory: sub, system: 'Collectibles / Gifts', name: `${sub}: ${k}`, description: 'Collectible item icon for Shop/Inventory/Profile. Price, quantity and ownership are untouched.', object: `${desc}; fictional design, no real brand, logo or text.`, materials: 'as described', rarity, priority: sample ? 'P1' : 'P2', batch: sample ? 'sample-1' : null });
[['classic', 'a classic steel wristwatch with a leather strap', 'common'], ['luxury', 'a luxury wristwatch with a sapphire dial and gold bezel, three-quarter view', 'epic', true], ['gold', 'a solid gold wristwatch', 'rare'], ['diamond', 'a diamond-paved wristwatch', 'legendary'], ['limited', 'a limited-edition skeleton wristwatch with visible gears', 'mythic']].forEach(([k, d, r, s]) => coll('watch', k, d, r, s));
[['sports', 'a stylized sports coupe', 'common'], ['supercar', 'a stylized low supercar', 'rare'], ['hypercar', 'a stylized futuristic hypercar', 'epic'], ['luxury', 'a stylized luxury grand sedan', 'legendary'], ['limited', 'a stylized one-off concept car in gold and black', 'mythic']].forEach(([k, d, r]) => coll('car', k, d, r));
[['small', 'a stylized small motor yacht', 'common'], ['luxury', 'a stylized luxury yacht', 'rare'], ['super', 'a stylized multi-deck superyacht', 'epic'], ['royal', 'a stylized royal yacht with gold trim', 'legendary'], ['limited', 'a stylized futuristic yacht', 'mythic']].forEach(([k, d, r]) => coll('yacht', k, d, r));
[['villa', 'a stylized modern villa on a small island base', 'common'], ['mansion', 'a stylized luxury mansion diorama', 'rare'], ['beach-villa', 'a stylized beach villa diorama with palms', 'epic'], ['royal-estate', 'a stylized royal estate diorama with gardens', 'legendary'], ['limited-estate', 'a stylized floating sky estate diorama', 'mythic']].forEach(([k, d, r]) => coll('property', k, d, r));
[['standard', 'a stylized smartphone', 'common'], ['premium', 'a stylized premium smartphone', 'rare'], ['luxury', 'a stylized luxury smartphone with leather back', 'epic'], ['gold', 'a stylized gold smartphone', 'legendary'], ['limited', 'a stylized jewelled smartphone', 'mythic']].forEach(([k, d, r]) => coll('phone', k, d, r));

// ---------------------------------------------------------------- tournament, rewards, spin wheel, events, achievements, system UI
for (const [k, desc, sample] of [['trophy', 'a gold tournament trophy cup'], ['trophy-champion', 'a grand champion trophy: tall gold cup with wing handles, ruby and amethyst gems and a crown finial on a black marble base', true], ['medal', 'a gold medal with a ribbon'], ['ticket', 'a premium tournament ticket with a gold edge (no text)'], ['banner', 'a hanging tournament banner with laurel (blank field)'], ['badge', 'a tournament crest badge']]) add({ id: `tournament.${k}`, category: 'tournament', subcategory: 'tournament', system: 'Tournament', name: `Tournament: ${k}`, description: 'Tournament art (only for existing tournament/leaderboard features).', object: `${desc}; no text.`, materials: 'gold, marble, gems', priority: sample ? 'P1' : 'P2', batch: sample ? 'sample-1' : null });
for (const [k, desc] of [['daily-gift', 'a wrapped gift box with a gold ribbon'], ['weekly-gift', 'a larger premium gift box with a royal ribbon'], ['login-chest', 'a small calendar-themed chest'], ['streak', 'a flame-shaped streak emblem in gold (stylized)'], ['vip-daily', 'an amethyst gift box with a crown clasp'], ['milestone', 'a milestone flag emblem with stars'], ['mystery-gift', 'a mystery gift box with a question-mark-shaped ribbon knot (no glyph text)'], ['premium-gift', 'a gold gift box with gem studs']]) add({ id: `reward.${k}`, category: 'reward', subcategory: 'reward', system: 'Rewards', name: `Reward: ${k}`, description: 'Reward icon (existing daily/check-in/mission systems only).', object: `${desc}; no text.`, materials: 'paper, ribbon, gold' });
for (const [k, desc] of [['wheel', 'a prize spin wheel face with 8 coloured segments, gold rim and studs, segments empty for UI icons'], ['pointer', 'a gold spin wheel pointer'], ['ticket', 'a spin ticket'], ['button', 'a round spin button (no text)']]) add({ id: `spin.${k}`, category: 'spin', subcategory: 'spin-wheel', system: 'Spin Wheel (planned — no gameplay without approval)', name: `Spin wheel: ${k}`, description: 'Art only; no new gameplay is added without separate approval.', object: `${desc}; no text.`, materials: 'gold, enamel', camera: k === 'wheel' ? 'Orthographic front view, perfectly circular.' : 'Front view.', priority: 'P3' });
for (const season of ['halloween', 'christmas', 'new-year', 'lunar-new-year', 'valentine', 'summer', 'thanksgiving', 'anniversary']) for (const [k, what] of [['icon', 'a round event icon'], ['banner', 'a wide event banner backdrop with an empty centre band (opaque)'], ['chest', 'an event reward chest'], ['badge', 'an event badge'], ['decoration', 'a corner decoration garland']]) add({ id: `event.${season}.${k}`, category: 'event', subcategory: season, system: 'Seasonal events (existing season system)', name: `${season} ${k}`, description: 'Seasonal event art for the existing season themes.', object: `${what} themed for ${season.replace(/-/g, ' ')}; tasteful, premium; no text.`, materials: 'themed', size: k === 'banner' ? WIDE : SQ, transparent: k !== 'banner', priority: 'P3' });
for (const [k, desc] of [['badge', 'a bronze achievement badge'], ['rare', 'a sapphire achievement badge'], ['epic', 'an amethyst achievement badge'], ['legendary', 'a gold-and-ruby legendary achievement badge'], ['collector', 'an emerald collector achievement badge'], ['champion', 'a gold champion achievement badge with laurels']]) add({ id: `achievement.${k}`, category: 'achievement', subcategory: 'achievement', system: 'Achievements', name: `Achievement: ${k}`, description: 'Achievement badge.', object: `${desc}, star-and-shield shape, no text.`, materials: 'metal, gems' });
for (const [k, desc] of [['notification', 'a notification bell icon'], ['mailbox', 'an envelope with a gold seal icon'], ['calendar', 'an event calendar icon (no numbers)'], ['quest', 'a quest scroll icon'], ['claim-panel', 'an ornamental empty reward claim panel frame (centre transparent)'], ['progress-panel', 'an empty event progress panel with a blank track'], ['announcement', 'an announcement trumpet-and-ribbon decoration'], ['leaderboard', 'a leaderboard podium decoration']]) add({ id: `ui.${k}`, category: 'ui', subcategory: 'system-ui', system: 'System UI', name: `UI: ${k}`, description: 'System UI art.', object: `${desc}; no text.`, materials: 'enamel, gold', size: k.endsWith('panel') ? WIDE : SQ, priority: 'P3' });

export const CATALOG = assets;
export const SAMPLE_BATCH = 'sample-1';
