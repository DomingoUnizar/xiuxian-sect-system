import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_ROOT = 'D:\\GeminiProjects\\修仙素材';
const IMG_ROOT = path.join(SRC_ROOT, '图像素材');
const NPC_ROOT = path.join(SRC_ROOT, 'NPC素材3D+2D', '2D');
const MUSIC_ROOT = path.join(SRC_ROOT, '音乐素材');
const PUB_ASSETS = path.join(ROOT, 'public', 'assets');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function ffmpegImage(src, dest, vf, quality = 82, lossless = false) {
  ensureDir(path.dirname(dest));
  const args = ['-y', '-v', 'error', '-i', src];
  if (vf) {
    args.push('-vf', vf);
  }
  if (dest.endsWith('.webp')) {
    args.push(
      '-c:v',
      'libwebp',
      '-lossless',
      lossless ? '1' : '0',
      '-quality',
      String(quality),
      '-pix_fmt',
      'yuva420p',
    );
  }
  args.push(dest);
  execFileSync('ffmpeg', args, { stdio: 'pipe' });
}

function ffmpegAudioOgg(src, dest, maxSeconds = 48) {
  ensureDir(path.dirname(dest));
  const args = [
    '-y',
    '-v',
    'error',
    '-i',
    src,
    '-t',
    String(maxSeconds),
    '-vn',
    '-ac',
    '2',
    '-c:a',
    'libvorbis',
    '-b:a',
    '64k',
    dest,
  ];
  execFileSync('ffmpeg', args, { stdio: 'pipe' });
}

const manifestEntries = [];

function recordAsset(id, relPath, sourcePack, licenseRef, credit, useScope) {
  const fullPath = path.join(PUB_ASSETS, relPath.replace(/^assets\//, ''));
  const stat = fs.statSync(fullPath);
  manifestEntries.push({
    id,
    variantOf: null,
    sourcePack,
    relativePath: relPath.replace(/\\/g, '/'),
    sha256: sha256File(fullPath),
    format: path.extname(fullPath).slice(1),
    bytes: stat.size,
    licenseRef,
    credit,
    useScope,
  });
}

console.log('1/7 Curating NPC 2D standing portraits (standees) & icons...');
const standeeSpecs = [
  ['boy_0', 'Boy1_Skin0.png', 'Boy1_Icon0.png'],
  ['boy_1', 'Boy1_Skin1.png', 'Boy1_Icon1.png'],
  ['boy_2', 'Boy1_Skin2.png', 'Boy1_Icon2.png'],
  ['girl_0', 'Girl1_Skin0.png', 'Girl1_Icon0.png'],
  ['girl_1', 'Girl1_Skin1.png', 'Girl1_Icon1.png'],
  ['girl_2', 'Girl1_Skin2.png', 'Girl1_Icon2.png'],
  ['young_man_0', 'YoungMan1_Skin0.png', 'YoungMale1_Icon0.png'],
  ['young_man_1', 'YoungMan1_Skin1.png', 'YoungMale1_Icon01.png'],
  ['young_man_2', 'YoungMan1_Skin2.png', 'YoungMale1_Icon02.png'],
  ['young_female_0', 'YoungFemale1_Skin0.png', 'YoungFemale1_Icon0.png'],
  ['young_female_1', 'YoungFemale1_Skin1.png', 'YoungFemale1_Icon1.png'],
  ['young_female_2', 'YoungFemale1_Skin2.png', 'YoungFemale1_Icon2.png'],
  ['mid_male_0', 'MiddleAgedMale1_Skin0.png', 'MiddleAgedMale1_Icon0.png'],
  ['mid_male_1', 'MiddleAgedMale1_Skin1.png', 'MiddleAgedMale1_Icon1.png'],
  ['mid_female_0', 'MiddleAgedFemale1_Skin0.png', 'MiddleAgedFemale1_Icon0.png'],
  ['mid_female_1', 'MiddleAgedFemale1_Skin1.png', 'MiddleAgedFemale1_Icon1.png'],
  ['old_male_0', 'OldMale1_Skin0.png', 'OldMale1_Icon0.png'],
  ['old_female_0', 'OldFemale1_Skin0.png', 'OldFemale1_Icon0.png'],
];

for (const [id, standeeFile, iconFile] of standeeSpecs) {
  const srcStandee = path.join(NPC_ROOT, 'Portraits', standeeFile);
  const outStandee = path.join(PUB_ASSETS, 'standees', `${id}.webp`);
  ffmpegImage(srcStandee, outStandee, 'scale=-1:420', 84);
  recordAsset(
    `standee_${id}`,
    `assets/standees/${id}.webp`,
    `NPC素材3D+2D/2D/Portraits/${standeeFile}`,
    'Project local curated NPC 2D artwork',
    'NPC素材3D+2D',
    'lazy-host-standee',
  );

  const srcIcon = path.join(NPC_ROOT, 'Icons', iconFile);
  const outIcon = path.join(PUB_ASSETS, 'npc-icons', `${id}.webp`);
  ffmpegImage(srcIcon, outIcon, 'scale=128:128', 84);
  recordAsset(
    `npc_icon_${id}`,
    `assets/npc-icons/${id}.webp`,
    `NPC素材3D+2D/2D/Icons/${iconFile}`,
    'Project local curated NPC 2D artwork',
    'NPC素材3D+2D',
    'npc-avatar-icon',
  );
}

console.log('2/7 Curating Portraits_300, Cultivators_100, Wanderers_100, Beasts_100...');
const p300Circle = path.join(IMG_ROOT, 'Xianxia_Portraits_FULL_300', 'Framed_Circle_PNG', '64x64');
const p300Trans = path.join(IMG_ROOT, 'Xianxia_Portraits_FULL_300', 'Transparent_PNG', '256x256');
const righteousNums = [
  ...Array.from({ length: 24 }, (_, i) => String(i + 1).padStart(3, '0')),
  '045',
  '049',
];
for (const num of righteousNums) {
  const fileName = `righteous_${num}.png`;
  copyFile(path.join(p300Circle, fileName), path.join(PUB_ASSETS, 'portraits', fileName));
  recordAsset(
    `portrait_righteous_${num}`,
    `assets/portraits/${fileName}`,
    'Xianxia_Portraits_FULL_300 (Framed_Circle_PNG/64x64)',
    'Embedded game use allowed per pack LICENSE',
    'Xianxia_Portraits_FULL_300',
    'member-circle-64',
  );
  if (['001', '003', '004', '009', '011', '013', '014', '045', '049'].includes(num)) {
    const outHd = path.join(PUB_ASSETS, 'portraits', 'hd', `righteous_${num}.webp`);
    ffmpegImage(path.join(p300Trans, fileName), outHd, 'scale=256:256', 84);
    recordAsset(
      `portrait_hd_righteous_${num}`,
      `assets/portraits/hd/righteous_${num}.webp`,
      'Xianxia_Portraits_FULL_300 (Transparent_PNG/256x256)',
      'Embedded game use allowed per pack LICENSE',
      'Xianxia_Portraits_FULL_300',
      'lazy-portrait-hd',
    );
  }
}

const wandCircle = path.join(IMG_ROOT, 'Xianxia_Wanderers_FULL_100', 'Framed_Circle_PNG', '64x64');
for (let i = 1; i <= 16; i += 1) {
  const fileName = `mortal_${String(i).padStart(3, '0')}.png`;
  copyFile(path.join(wandCircle, fileName), path.join(PUB_ASSETS, 'wanderers', fileName));
  recordAsset(
    `wanderer_${i}`,
    `assets/wanderers/${fileName}`,
    'Xianxia_Wanderers_FULL_100',
    'Embedded game use allowed per pack LICENSE',
    'Xianxia_Wanderers_FULL_100',
    'candidate-circle-64',
  );
  if (i <= 6) {
    copyFile(path.join(wandCircle, fileName), path.join(PUB_ASSETS, 'portraits', fileName));
    recordAsset(
      `portrait_mortal_${String(i).padStart(3, '0')}`,
      `assets/portraits/${fileName}`,
      'Xianxia_Wanderers_FULL_100',
      'Embedded game use allowed per pack LICENSE',
      'Xianxia_Wanderers_FULL_100',
      'member-circle-64',
    );
  }
}

const cultCircle = path.join(IMG_ROOT, 'Xianxia_Cultivators_FULL_100', 'Framed_Circle_PNG', '64x64');
for (let i = 1; i <= 12; i += 1) {
  const fileName = `demonic_${String(i).padStart(3, '0')}.png`;
  copyFile(path.join(cultCircle, fileName), path.join(PUB_ASSETS, 'cultivators', fileName));
  recordAsset(
    `cultivator_${i}`,
    `assets/cultivators/${fileName}`,
    'Xianxia_Cultivators_FULL_100',
    'Embedded game use allowed per pack LICENSE',
    'Xianxia_Cultivators_FULL_100',
    'rival-circle-64',
  );
}

const beastCircle = path.join(IMG_ROOT, 'Xianxia_Beasts_FULL_100', 'Framed_Circle_PNG', '64x64');
const beastTrans = path.join(IMG_ROOT, 'Xianxia_Beasts_FULL_100', 'Transparent_PNG', '256x256');
for (let i = 1; i <= 10; i += 1) {
  const fileName = `beast_${String(i).padStart(3, '0')}.png`;
  copyFile(path.join(beastCircle, fileName), path.join(PUB_ASSETS, 'beasts', fileName));
  recordAsset(
    `beast_circle_${i}`,
    `assets/beasts/${fileName}`,
    'Xianxia_Beasts_FULL_100',
    'Embedded game use allowed per pack LICENSE',
    'Xianxia_Beasts_FULL_100',
    'beast-circle-64',
  );
  if (i === 1) {
    copyFile(path.join(beastCircle, fileName), path.join(PUB_ASSETS, 'portraits', fileName));
  }
  const outHd = path.join(PUB_ASSETS, 'beasts', 'hd', `beast_${String(i).padStart(3, '0')}.webp`);
  ffmpegImage(path.join(beastTrans, fileName), outHd, 'scale=220:220', 84);
  recordAsset(
    `beast_hd_${i}`,
    `assets/beasts/hd/beast_${String(i).padStart(3, '0')}.webp`,
    'Xianxia_Beasts_FULL_100',
    'Embedded game use allowed per pack LICENSE',
    'Xianxia_Beasts_FULL_100',
    'lazy-beast-hd',
  );
}

console.log('3/7 Curating all 12 Weapon categories + all 12 Icon categories...');
const wpnSrcRoot = path.join(IMG_ROOT, 'Xianxia_Weapons_Artifacts_FULL_500', 'Transparent_PNG', '128x128');
// Preserve exact referenced aliases from sim/worldgen + content.json
copyFile(path.join(wpnSrcRoot, 'sword', 'ma_tu_sword_t01_001.png'), path.join(PUB_ASSETS, 'weapons', 'sword_t01_001.png'));
copyFile(path.join(wpnSrcRoot, 'sword', 'ma_tu_sword_t01_002.png'), path.join(PUB_ASSETS, 'weapons', 'sword_t01_002.png'));
copyFile(path.join(wpnSrcRoot, 'sword', 'ma_tu_sword_t02_006.png'), path.join(PUB_ASSETS, 'weapons', 'sword_t02_006.png'));
copyFile(path.join(wpnSrcRoot, 'seal', 'ma_tu_seal_t02_004.png'), path.join(PUB_ASSETS, 'weapons', 'seal_t02_004.png'));
copyFile(path.join(wpnSrcRoot, 'bell', 'bell_t01_001.png'), path.join(PUB_ASSETS, 'weapons', 'bell_t01_001.png'));

for (const dirEntry of fs.readdirSync(wpnSrcRoot, { withFileTypes: true })) {
  if (!dirEntry.isDirectory()) continue;
  const catDir = path.join(wpnSrcRoot, dirEntry.name);
  const files = fs.readdirSync(catDir).filter((f) => f.endsWith('.png')).sort();
  const picks = [files[0], files[5] ?? files[1], files[10] ?? files[2]].filter(Boolean);
  for (const file of picks) {
    const outPath = path.join(PUB_ASSETS, 'weapons', file);
    ffmpegImage(path.join(catDir, file), outPath, 'scale=96:96');
    recordAsset(
      `weapon_${path.basename(file, '.png')}`,
      `assets/weapons/${file}`,
      `Xianxia_Weapons_Artifacts_FULL_500/${dirEntry.name}`,
      'Embedded game use allowed per pack LICENSE',
      'Xianxia_Weapons_Artifacts_FULL_500',
      'weapon-icon-96',
    );
  }
}

const iconSrcRoot = path.join(IMG_ROOT, 'Xianxia_Icons_FULL_PACK_300', 'Transparent_PNG', '128x128');
for (const dirEntry of fs.readdirSync(iconSrcRoot, { withFileTypes: true })) {
  if (!dirEntry.isDirectory()) continue;
  const catDir = path.join(iconSrcRoot, dirEntry.name);
  const files = fs.readdirSync(catDir).filter((f) => f.endsWith('.png')).sort().slice(0, 3);
  for (const file of files) {
    const outPath = path.join(PUB_ASSETS, 'icons', file);
    ffmpegImage(path.join(catDir, file), outPath, 'scale=64:64');
    recordAsset(
      `icon_${path.basename(file, '.png')}`,
      `assets/icons/${file}`,
      `Xianxia_Icons_FULL_PACK_300/${dirEntry.name}`,
      'Embedded game use allowed per pack LICENSE',
      'Xianxia_Icons_FULL_PACK_300',
      'item-icon-64',
    );
  }
}

console.log('4/7 Curating UI frames (T1..T6), portrait borders, panels, buttons, tabs, bars & symbols...');
const uiRoot = path.join(IMG_ROOT, 'Xianxia_RPG_UI_GUI_And_Rarity_Frames_Full');
const rarityFrames = [
  ['item_t1_wood_128', '01_Item_Rarity_Frames/Tier1_Mortal_Wood_Stone/item_t1_wood_128.png'],
  ['item_t1_stone_128', '01_Item_Rarity_Frames/Tier1_Mortal_Wood_Stone/item_t1_stone_128.png'],
  ['item_t2_bronze_128', '01_Item_Rarity_Frames/Tier2_Spirit_Bronze/item_t2_bronze_128.png'],
  ['item_t3_jade_128', '01_Item_Rarity_Frames/Tier3_Mystic_Jade/item_t3_jade_128.png'],
  ['item_t4_amethyst_128', '01_Item_Rarity_Frames/Tier4_Earth_Amethyst/item_t4_amethyst_128.png'],
  ['item_t5_dragon_128', '01_Item_Rarity_Frames/Tier5_Heaven_GoldenDragon/item_t5_dragon_128.png'],
  ['item_t6_phoenix_128', '01_Item_Rarity_Frames/Tier6_Immortal_Demonic/item_t6_phoenix_128.png'],
];
for (const [id, rel] of rarityFrames) {
  const dest = path.join(PUB_ASSETS, 'ui', `${id}.png`);
  copyFile(path.join(uiRoot, rel), dest);
  recordAsset(id, `assets/ui/${id}.png`, `Xianxia_RPG_UI/${rel}`, 'Embedded UI asset use', 'Xianxia_RPG_UI_GUI', 'rarity-slot-frame');
}

const uiResizeWebp = [
  ['celestial_jade_portrait', '02_Avatar_Portrait_Borders/celestial_jade_portrait.png', 'scale=160:160', 86],
  ['celestial_jade_bamboo_portrait', '02_Avatar_Portrait_Borders/celestial_jade_bamboo_portrait.png', 'scale=160:160', 86],
  ['celestial_jade_white_portrait', '02_Avatar_Portrait_Borders/celestial_jade_white_portrait.png', 'scale=160:160', 86],
  ['heavenly_bronze_dragon_portrait', '02_Avatar_Portrait_Borders/heavenly_bronze_dragon_portrait.png', 'scale=160:160', 86],
  ['celestial_jade_panel', '06_Dialog_Panels_And_Scrolls/celestial_jade_panel.png', 'scale=512:320', 86],
  ['shared_bamboo_panel', '06_Dialog_Panels_And_Scrolls/shared_bamboo_panel.png', 'scale=512:320', 86],
  ['heavenly_bronze_panel', '06_Dialog_Panels_And_Scrolls/heavenly_bronze_panel.png', 'scale=512:320', 86],
  ['celestial_jade_button', '05_Buttons_And_Tabs/Normal/celestial_jade_button.png', 'scale=320:100', 86],
  ['celestial_jade_button_hover', '05_Buttons_And_Tabs/Hover_Brightened/celestial_jade_button.png', 'scale=320:100', 86],
  ['celestial_jade_button_pressed', '05_Buttons_And_Tabs/Pressed_Darkened/celestial_jade_button.png', 'scale=320:100', 86],
  ['celestial_jade_nephrite_button', '05_Buttons_And_Tabs/Normal/celestial_jade_nephrite_button.png', 'scale=320:100', 86],
  ['celestial_jade_nephrite_button_hover', '05_Buttons_And_Tabs/Hover_Brightened/celestial_jade_nephrite_button.png', 'scale=320:100', 86],
  ['celestial_jade_bamboo_button', '05_Buttons_And_Tabs/Normal/celestial_jade_bamboo_button.png', 'scale=320:100', 86],
  ['celestial_jade_tab', '05_Buttons_And_Tabs/Tabs/Normal/celestial_jade_tab.png', 'scale=220:110', 86],
  ['celestial_jade_tab_hover', '05_Buttons_And_Tabs/Tabs/Hover_Brightened/celestial_jade_tab.png', 'scale=220:110', 86],
  ['celestial_jade_nephrite_tab', '05_Buttons_And_Tabs/Tabs/Normal/celestial_jade_nephrite_tab.png', 'scale=220:110', 86],
  ['celestial_jade_orb', '04_HUD_Bars_And_Orbs/Cultivation_Dantian_Orbs/celestial_jade_orb.png', 'scale=128:128', 86],
  ['shared_bagua_symbol', '07_Cultivation_HUD_Symbols/shared_bagua_symbol.png', 'scale=128:128', 86],
  ['shared_wuxing_symbol', '07_Cultivation_HUD_Symbols/shared_wuxing_symbol.png', 'scale=128:128', 86],
  ['shared_breakthrough_symbol', '07_Cultivation_HUD_Symbols/shared_breakthrough_symbol.png', 'scale=128:128', 86],
  ['shared_gold_formation_symbol', '07_Cultivation_HUD_Symbols/shared_gold_formation_symbol.png', 'scale=128:128', 86],
  ['celestial_jade_symbol', '07_Cultivation_HUD_Symbols/celestial_jade_symbol.png', 'scale=128:128', 86],
  ['heavenly_bronze_symbol', '07_Cultivation_HUD_Symbols/heavenly_bronze_symbol.png', 'scale=128:128', 86],
  ['crimson_moon_symbol', '07_Cultivation_HUD_Symbols/crimson_moon_symbol.png', 'scale=128:128', 86],
  ['shared_corner_symbol', '07_Cultivation_HUD_Symbols/shared_corner_symbol.png', 'scale=96:96', 86],
];

for (const [id, rel, vf, q] of uiResizeWebp) {
  const outPath = path.join(PUB_ASSETS, 'ui', `${id}.webp`);
  ffmpegImage(path.join(uiRoot, rel), outPath, vf, q);
  recordAsset(id, `assets/ui/${id}.webp`, `Xianxia_RPG_UI/${rel}`, 'Embedded UI asset use', 'Xianxia_RPG_UI_GUI', 'ui-chrome');
}

// Crisp PNG UI controls that keep exact small dimensions
ffmpegImage(path.join(uiRoot, '04_HUD_Bars_And_Orbs/Empty_Bar_Frames/celestial_jade_bar.png'), path.join(PUB_ASSETS, 'ui', 'celestial_jade_bar.png'), 'scale=384:48');
ffmpegImage(path.join(uiRoot, '07_Cultivation_HUD_Symbols/Cursors/celestial_jade_cursor.png'), path.join(PUB_ASSETS, 'ui', 'celestial_jade_cursor.png'), 'scale=36:36');
copyFile(path.join(uiRoot, '04_HUD_Bars_And_Orbs/Fill_Strips_HP_Qi_Exp/HP.png'), path.join(PUB_ASSETS, 'ui', 'fill_hp.png'));
copyFile(path.join(uiRoot, '04_HUD_Bars_And_Orbs/Fill_Strips_HP_Qi_Exp/Qi.png'), path.join(PUB_ASSETS, 'ui', 'fill_qi.png'));
copyFile(path.join(uiRoot, '04_HUD_Bars_And_Orbs/Fill_Strips_HP_Qi_Exp/Exp.png'), path.join(PUB_ASSETS, 'ui', 'fill_exp.png'));
recordAsset('celestial_jade_bar', 'assets/ui/celestial_jade_bar.png', 'Xianxia_RPG_UI', 'Embedded UI asset use', 'Xianxia_RPG_UI_GUI', 'ui-gauge');
recordAsset('celestial_jade_cursor', 'assets/ui/celestial_jade_cursor.png', 'Xianxia_RPG_UI', 'Embedded UI asset use', 'Xianxia_RPG_UI_GUI', 'ui-cursor');

console.log('5/7 Curating 8 Xuanhuan Mood Art scenes as lazy WebPs...');
const moodRoot = path.join(IMG_ROOT, 'Xuanhuan_Mood_Art');
const sceneIds = [
  '04_celestial_palace',
  '06_bronze_gate',
  '07_immortal_gate',
  '08_sword_tomb',
  '13_volcano_cauldron',
  '17_star_platform',
  '21_herb_valley',
  '22_peach_blossom_stream',
];
for (const sceneId of sceneIds) {
  const src = path.join(moodRoot, `${sceneId}.jpg`);
  const out = path.join(PUB_ASSETS, 'scenes', `${sceneId}.webp`);
  ffmpegImage(src, out, 'scale=960:-1', 74);
  recordAsset(
    `scene_${sceneId}`,
    `assets/scenes/${sceneId}.webp`,
    `Xuanhuan_Mood_Art/${sceneId}.jpg`,
    'CC0 / Mood Art bundle',
    'Xuanhuan_Mood_Art',
    'lazy-mood-backdrop',
  );
}

console.log('6/7 Transcoding additional ambient music tracks (lazy preload=none)...');
const bgmSpecs = [
  ['bgm_sect_reverence', path.join(MUSIC_ROOT, 'music-loop-bundle-2026-q3', 'Week 35 - Reverence ENDLESS.ogg')],
  ['bgm_jade_spring', path.join(MUSIC_ROOT, 'music-loop-bundle-2026-q2', 'Week 24 - Pull Me Down GRAVITY.ogg')],
  ['bgm_cloud_sea', path.join(MUSIC_ROOT, 'music-loop-bundle-2026-q1', 'Week 9 - Graceful Descent FLOATING.ogg')],
  ['bgm_ancient_pass', path.join(MUSIC_ROOT, 'music-loop-bundle-2026-q2', 'Week 19 - Dark Portents MYSTERIOUS TRAVELER.ogg')],
];
for (const [id, src] of bgmSpecs) {
  const dest = path.join(PUB_ASSETS, 'audio', `${id}.ogg`);
  ffmpegAudioOgg(src, dest, 48);
  recordAsset(
    id,
    `assets/audio/${id}.ogg`,
    path.basename(src),
    'CC0 1.0 Universal (Abstraction Music Loop Bundle)',
    'Abstraction',
    'lazy-bgm-loop',
  );
}
for (const sfxName of ['sfx_alchemy_done', 'sfx_sword_clash', 'sfx_system_ding']) {
  const p = path.join(PUB_ASSETS, 'audio', `${sfxName}.ogg`);
  if (fs.existsSync(p)) {
    recordAsset(sfxName, `assets/audio/${sfxName}.ogg`, 'Curated local SFX', 'Royalty-free curated SFX', 'Sonniss / Soundza', 'lazy-sfx');
  }
}

console.log('7/7 Writing updated asset-manifest.json...');
const manifestPath = path.join(ROOT, 'src', 'content', 'asset-manifest.json');
fs.writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      version: '2.0.0',
      generatedAt: '2026-11-24',
      totalCuratedAssets: manifestEntries.length,
      assets: manifestEntries,
    },
    null,
    2,
  ),
);

const totalKiB = (manifestEntries.reduce((acc, a) => acc + a.bytes, 0) / 1024).toFixed(1);
console.log(`Done! Curated ${manifestEntries.length} assets across all categories (${totalKiB} KiB total, mostly lazy-loaded).`);
