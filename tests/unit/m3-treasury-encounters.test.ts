import { describe, expect, it } from 'vitest';
import { getCurrentConquestStage } from '../../src/sim/conquest';
import { SYSTEM_FORBIDDEN_PUBLIC_TERMS } from '../../src/sim/constants';
import { advance, cloneState } from '../../src/sim/engine';
import { hashCanonical } from '../../src/sim/hash';
import { computeMemberPowerScore } from '../../src/sim/power';
import { projectPublicView } from '../../src/sim/projections';
import { createInitialWorld } from '../../src/sim/worldgen';
import { tokenizeRichText } from '../../src/ui/visuals/richText';

describe('仙坊百宝阁、宗门福地灵脉、14境无漏、8重帝器踢馆、师徒传功与天机奇遇', () => {
  it('福地灵脉升阶（1→5阶）真实增益全宗并扩充后续招贤席位（2→3→4席）', () => {
    const w0 = createInitialWorld(20261123);
    w0.inventory.spiritStones = { low: 500, mid: 10, high: 5, supreme: 1 };
    const elder0 = w0.members.find((m) => m.id === 'member_alchemy_elder')!;
    const startCave = elder0.caveSupplyPerRound;

    const up2 = advance(w0, 1, [{ commandId: 'vein-2', type: 'sect.upgrade_spirit_vein' }]).state;
    expect(up2.sectSpiritVeinLevel).toBe(2);
    expect(up2.members.find((m) => m.id === 'member_alchemy_elder')!.caveSupplyPerRound).toBe(startCave + 3);

    const openGen2 = advance(up2, 2, [
      { commandId: 'open-gen2-vein', type: 'recruitment.open_session', regionId: 'zhongzhou' },
    ]).state;
    expect(openGen2.recruitment.totalSeats).toBe(3);

    const up5 = advance(openGen2, 3, [
      { commandId: 'vein-3', type: 'sect.upgrade_spirit_vein' },
      { commandId: 'vein-4', type: 'sect.upgrade_spirit_vein' },
      { commandId: 'vein-5', type: 'sect.upgrade_spirit_vein' },
    ]).state;
    expect(up5.sectSpiritVeinLevel).toBe(5);

    const openGen3 = advance(up5, 4, [
      { commandId: 'open-gen3-vein', type: 'recruitment.open_session', regionId: 'beihuang' },
    ]).state;
    expect(openGen3.recruitment.totalSeats).toBe(4);
  });

  it('天机盲盒、灵石熔炼道源、采买补草与 +1..+9 淬兵强化均可真实运作且战力严格暴涨', () => {
    const w0 = createInitialWorld(20261123);
    w0.inventory.spiritStones = { low: 800, mid: 3, high: 2, supreme: 0 };
    const startHerbs = w0.inventory.herbs.herb_humai;
    const masterPower0 = computeMemberPowerScore(w0.members.find((m) => m.id === 'member_master')!);

    const res = advance(w0, 2, [
      { commandId: 'box-1', type: 'treasury.open_mystery_box' },
      { commandId: 'box-2', type: 'treasury.open_mystery_box' },
      { commandId: 'herb-1', type: 'treasury.restock_herbs' },
      { commandId: 'ex-low', type: 'treasury.exchange_stones', tier: 'low' },
      { commandId: 'ex-mid', type: 'treasury.exchange_stones', tier: 'mid' },
      { commandId: 'ex-high', type: 'treasury.exchange_stones', tier: 'high' },
      { commandId: 'ref-1', type: 'treasury.refine_weapon', memberId: 'member_master' },
      { commandId: 'ref-2', type: 'treasury.refine_weapon', memberId: 'member_master' },
    ]).state;

    expect(res.inventory.herbs.herb_humai).toBeGreaterThanOrEqual(startHerbs + 6);
    expect(res.daoyuanAvailable).toBeGreaterThanOrEqual(24 + 20 + 50 + 150);
    const masterAfter = res.members.find((m) => m.id === 'member_master')!;
    expect(masterAfter.equippedWeapon?.refineLevel).toBe(2);
    expect(computeMemberPowerScore(masterAfter)).toBeGreaterThan(masterPower0 + 40);
  });

  it('天机奇遇自 tick >= 18 周期出现且可二选一结算；公开视野零禁词且分片严格一致', () => {
    const w0 = createInitialWorld(20261123);
    const at18 = advance(cloneState(w0), 18, []).state;
    expect(at18.pendingEncounter).toBeTruthy();

    // 验证分片推进到此奇遇点与一次性推进哈希相等
    let chunked = cloneState(w0);
    for (const b of [5, 11, 17, 18]) {
      chunked = advance(chunked, b, []).state;
    }
    expect(hashCanonical(chunked)).toBe(hashCanonical(at18));

    const enc = at18.pendingEncounter!;
    const resolved = advance(at18, 19, [
      { commandId: 'res-enc-1', type: 'system.resolve_encounter', encounterId: enc.id, choice: 'b' },
    ]).state;
    expect(resolved.pendingEncounter).toBeNull();
    expect(resolved.resolvedEncounterCount).toBe(1);

    const pub = projectPublicView(resolved);
    for (const pf of pub.publicFacts) {
      for (const bad of SYSTEM_FORBIDDEN_PUBLIC_TERMS) {
        expect(pf.summary).not.toContain(bad);
      }
      expect(pf.summary).not.toContain('…');
    }
  });

  it('支持一路破境至十四境极巅「无漏」、横扫第 8 重巡天仙使并解锁「鸿蒙无漏印」帝器与师徒传功', () => {
    const w0 = createInitialWorld(20261123);
    w0.daoyuanAvailable = 2000;
    const heroId = 'member_master';
    const rookieId = 'member_senior_disciple';

    let s = advance(w0, 1, [
      { commandId: 'root-god', type: 'system.cast_miracle', miracleId: 'upgrade_root', targetMemberId: heroId },
    ]).state;

    // 筑基 -> 无漏 (共 10 大境)
    for (let i = 0; i < 10; i += 1) {
      s = advance(s, s.tick + 1, [
        { commandId: `wulou-e-${i}`, type: 'system.cast_miracle', miracleId: 'empower_peak', targetMemberId: heroId },
        { commandId: `wulou-b-${i}`, type: 'system.cast_miracle', miracleId: 'instant_breakthrough', targetMemberId: heroId },
        { commandId: `wulou-w-${i}`, type: 'system.cast_miracle', miracleId: 'bestow_divine_weapon', targetMemberId: heroId },
      ]).state;
    }
    const immortal = s.members.find((m) => m.id === heroId)!;
    expect(immortal.realm).toBe('无漏');
    expect(immortal.equippedWeapon?.tier).toBe('帝器');

    // 打穿全部 8 重诸域强宗踢馆线
    for (let st = 0; st < 8; st += 1) {
      expect(getCurrentConquestStage(s.conquestStage ?? 0).stageIndex).toBe(st);
      s = advance(s, s.tick + 5, [
        { commandId: `boss8-${st}`, type: 'mission.issue', recipientId: heroId, targetType: 'conquer_frontline' },
      ]).state;
      expect(s.conquestStage).toBe(st + 1);
    }
    expect(s.members.find((m) => m.id === heroId)!.equippedWeapon?.name).toBe('鸿蒙无漏印');
    expect(s.inventory.spiritStones.supreme).toBeGreaterThanOrEqual(5);

    // 征伐胜报关联 battleFactId，公开详报可直接展开非空战报
    const conquestFact = s.facts.find(
      (f) => f.type === 'battle.finished' && f.publicSummary?.includes('【山门大捷】'),
    );
    expect(conquestFact?.battleFactId).toBeTruthy();
    expect(s.battleFacts[conquestFact!.battleFactId!]?.detailedReport.length).toBeGreaterThan(20);

    // 重复锻剑超过 3 把备剑时自动寄售灵石，不再无限制堆叠重复武器
    s.inventory.materials = { ...(s.inventory.materials ?? {}), mat_chaowen_jade: 10 };
    for (const m of s.members) {
      if (m.status === 'active' && !m.equippedWeapon) {
        m.equippedWeapon = {
          id: `wpn_fill_${m.id}`,
          templateId: 'weapon_chaowen_sword',
          name: '储水回锋剑',
          tier: '凡阶',
          quality: '上品',
          durability: 42,
          maxDurability: 42,
          attackBonus: 11,
          defenseBonus: 5,
          specialTrait: 'water_tide',
        };
      }
    }
    const stonesBeforeForge = s.inventory.spiritStones.low;
    for (let fIdx = 0; fIdx < 6; fIdx += 1) {
      s = advance(s, s.tick + 1, [
        {
          commandId: `forge-cap-${fIdx}`,
          type: 'mission.issue',
          recipientId: rookieId,
          targetType: 'craft_forging_sword',
        },
      ]).state;
      s = advance(s, s.tick + 5, []).state;
    }
    const spareChaowen = s.inventory.weapons.filter((w) => w.name === '储水回锋剑').length;
    expect(spareChaowen).toBeLessThanOrEqual(3);
    expect(s.inventory.spiritStones.low).toBeGreaterThan(stonesBeforeForge);

    // 师徒薪火传功：无漏宗主提点大师兄
    const rookiePowerBefore = computeMemberPowerScore(s.members.find((m) => m.id === rookieId)!);
    const mentored = advance(s, s.tick + 1, [
      { commandId: 'mentor-1', type: 'member.mentor_disciple', apprenticeId: rookieId },
    ]).state;
    const rookieAfter = mentored.members.find((m) => m.id === rookieId)!;
    expect(computeMemberPowerScore(rookieAfter)).toBeGreaterThan(rookiePowerBefore);
    expect(rookieAfter.knownMethods.includes('method_qinglian_huifeng')).toBe(true);

    const pub = projectPublicView(mentored);
    for (const pf of pub.publicFacts) {
      for (const bad of SYSTEM_FORBIDDEN_PUBLIC_TERMS) {
        expect(pf.summary).not.toContain(bad);
      }
      expect(pf.summary).not.toContain('…');
    }
  });

  it('RichText 分词器应无损还原全文，并准确标注人名、境界、引言与数字收益颜色类别', () => {
    const sample =
      '【山门大捷】陆宁竹（金丹3层）依「分火提清法」佩「储水回锋剑」战力 229，触发×5倍气运暴击得+80 缕与+2 根基、22 道源！';
    const segs = tokenizeRichText(sample, ['陆宁竹', '苏玄远']);
    expect(segs.map((s) => s.text).join('')).toBe(sample);
    expect(segs.some((s) => s.text === '【山门大捷】' && s.cls === 'rt-tag-combat')).toBe(true);
    expect(segs.some((s) => s.text === '陆宁竹' && s.cls === 'rt-name')).toBe(true);
    expect(segs.some((s) => s.text === '金丹3层' && s.cls === 'rt-realm-mid')).toBe(true);
    expect(segs.some((s) => s.text === '「分火提清法」' && s.cls === 'rt-quote-method')).toBe(true);
    expect(segs.some((s) => s.text === '「储水回锋剑」' && s.cls === 'rt-quote-weapon')).toBe(true);
    expect(segs.some((s) => s.text === '战力 229' && s.cls === 'rt-stat-power')).toBe(true);
    expect(segs.some((s) => s.text === '+80 缕' && s.cls === 'rt-stat-jade')).toBe(true);
    expect(segs.some((s) => s.text === '+2 根基' && s.cls === 'rt-stat-gold')).toBe(true);
    expect(segs.some((s) => s.text === '22 道源' && s.cls === 'rt-stat-jade')).toBe(true);
  });
});
