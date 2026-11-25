import { describe, expect, it } from 'vitest';
import { getCurrentConquestStage } from '../../src/sim/conquest';
import { SYSTEM_FORBIDDEN_PUBLIC_TERMS } from '../../src/sim/constants';
import { advance, cloneState } from '../../src/sim/engine';
import { hashCanonical } from '../../src/sim/hash';
import { computeMemberPowerScore } from '../../src/sim/power';
import { projectPublicView } from '../../src/sim/projections';
import { createInitialWorld } from '../../src/sim/worldgen';

describe('爽游化高潮迭代：天道神权、五重踢馆征伐、14点万剑归宗、气运暴击返还与自动托管', () => {
  it('醍醐灌顶 + 立地破境支持炼气一路连破至筑基/紫府/金丹/元婴/出窍/化神，战力与属性真切暴涨', () => {
    const w0 = createInitialWorld(20261123);
    w0.daoyuanAvailable = 500;
    const seniorId = 'member_senior_disciple';
    const power0 = computeMemberPowerScore(w0.members.find((m) => m.id === seniorId)!);

    let s = cloneState(w0);
    const expectedRealms = ['筑基', '紫府', '金丹', '元婴', '出窍', '化神'] as const;
    for (let i = 0; i < expectedRealms.length; i += 1) {
      s = advance(s, s.tick + 1, [
        { commandId: `emp-${i}`, type: 'system.cast_miracle', miracleId: 'empower_peak', targetMemberId: seniorId },
        { commandId: `brk-${i}`, type: 'system.cast_miracle', miracleId: 'instant_breakthrough', targetMemberId: seniorId },
      ]).state;
      const m = s.members.find((x) => x.id === seniorId)!;
      expect(m.realm).toBe(expectedRealms[i]);
      expect(m.realmLayer).toBe(1);
    }

    const finalElder = s.members.find((x) => x.id === seniorId)!;
    const finalPower = computeMemberPowerScore(finalElder);
    expect(finalElder.realm).toBe('化神');
    expect(finalPower).toBeGreaterThan(power0 + 1400);
  });

  it('逆天洗髓（凡品→地品→天品）与天道赐器（旧器自动入库）大幅提升战力与吸收速率', () => {
    const w0 = createInitialWorld(20261123);
    w0.daoyuanAvailable = 200;
    const targetId = 'member_senior_disciple';
    const m0 = w0.members.find((m) => m.id === targetId)!;
    const power0 = computeMemberPowerScore(m0);
    const vaultWeapons0 = w0.inventory.weapons.length;

    const r1 = advance(w0, 1, [
      { commandId: 'root-up-1', type: 'system.cast_miracle', miracleId: 'upgrade_root', targetMemberId: targetId },
      { commandId: 'root-up-2', type: 'system.cast_miracle', miracleId: 'upgrade_root', targetMemberId: targetId },
      { commandId: 'wpn-gift-1', type: 'system.cast_miracle', miracleId: 'bestow_divine_weapon', targetMemberId: targetId },
    ]);
    const m1 = r1.state.members.find((m) => m.id === targetId)!;
    expect(m1.spiritRoot.grade).toBe('天品');
    expect(m1.equippedWeapon?.name).toBe('赤霄斩蛟剑');
    expect(r1.state.inventory.weapons.length).toBe(vaultWeapons0 + 1);
    expect(computeMemberPowerScore(m1)).toBeGreaterThan(power0 + 50);

    // 连续升阶破境并赏赐高阶神兵，单就换装前后也绝不倒跌战力
    let stair = cloneState(r1.state);
    stair.daoyuanAvailable = 400;
    for (const stepIdx of [0, 1, 2]) {
      stair = advance(stair, stair.tick + 1, [
        { commandId: `st-emp-${stepIdx}`, type: 'system.cast_miracle', miracleId: 'empower_peak', targetMemberId: targetId },
        { commandId: `st-brk-${stepIdx}`, type: 'system.cast_miracle', miracleId: 'instant_breakthrough', targetMemberId: targetId },
      ]).state;
      const beforeGiftPower = computeMemberPowerScore(stair.members.find((m) => m.id === targetId)!);
      stair = advance(stair, stair.tick + 1, [
        { commandId: `st-wpn-${stepIdx}`, type: 'system.cast_miracle', miracleId: 'bestow_divine_weapon', targetMemberId: targetId },
      ]).state;
      const afterGiftPower = computeMemberPowerScore(stair.members.find((m) => m.id === targetId)!);
      expect(afterGiftPower).toBeGreaterThan(beforeGiftPower);
    }

    // 强降仙霖应清伤、开启 spirit_tide 异象并补草药
    m1.injuries.push('演示轻伤');
    const herbsBefore = r1.state.inventory.herbs.herb_humai;
    const r2 = advance(r1.state, 2, [
      { commandId: 'tide-cast', type: 'system.cast_miracle', miracleId: 'summon_spirit_tide' },
    ]);
    expect(r2.state.activePhenomenon?.kind).toBe('spirit_tide');
    expect(r2.state.members.find((m) => m.id === targetId)!.injuries.length).toBe(0);
    expect(r2.state.inventory.herbs.herb_humai).toBe(herbsBefore + 3);
  });

  it('打穿 5 重诸域踢馆征伐线稳获 17 点根基与天阶神器，解锁 14 点「宗门法则·万剑归宗」且公开纪事零泄密', () => {
    const w0 = createInitialWorld(20261123);
    w0.daoyuanAvailable = 800;
    const heroId = 'member_master';

    // 先把宗主武装到化神天品 + 天阶极品斩仙戟，横推五关验证每关递进与掉落
    let s = advance(w0, 1, [
      { commandId: 'hero-r1', type: 'system.cast_miracle', miracleId: 'upgrade_root', targetMemberId: heroId },
    ]).state;
    for (let i = 0; i < 4; i += 1) {
      s = advance(s, s.tick + 1, [
        { commandId: `hero-e-${i}`, type: 'system.cast_miracle', miracleId: 'empower_peak', targetMemberId: heroId },
        { commandId: `hero-b-${i}`, type: 'system.cast_miracle', miracleId: 'instant_breakthrough', targetMemberId: heroId },
      ]).state;
    }
    s = advance(s, s.tick + 1, [
      { commandId: 'hero-w', type: 'system.cast_miracle', miracleId: 'bestow_divine_weapon', targetMemberId: heroId },
    ]).state;

    for (let st = 0; st < 5; st += 1) {
      const stageBefore = getCurrentConquestStage(s.conquestStage ?? 0);
      expect(stageBefore.stageIndex).toBe(st);
      s = advance(s, s.tick + 5, [
        {
          commandId: `conq-${st}`,
          type: 'mission.issue',
          recipientId: heroId,
          targetType: 'conquer_frontline',
        },
      ]).state;
      expect(s.conquestStage).toBe(st + 1);
    }

    // 5 重首通共 +17 根基，正式跨过 14 点解锁「sect_law」
    expect(s.foundationPoints).toBeGreaterThanOrEqual(17);
    expect(s.unlockedPermissions).toContain('sect_law');
    expect(s.inventory.spiritStones.supreme).toBeGreaterThanOrEqual(1);

    // 发动终极大法「万剑归宗」
    const repBefore = s.sectReputation;
    const elderCultBefore = s.members.find((m) => m.id === 'member_alchemy_elder')!.cultivation;
    const afterWanjian = advance(s, s.tick + 1, [
      { commandId: 'wanjian-1', type: 'system.cast_miracle', miracleId: 'sect_law_wanjian' },
    ]).state;
    expect(afterWanjian.sectReputation).toBe(repBefore + 30);
    expect(afterWanjian.members.find((m) => m.id === 'member_alchemy_elder')!.cultivation).toBeGreaterThan(elderCultBefore);

    // 严格核查三视角公开文本绝不含系统禁用词
    const pub = projectPublicView(afterWanjian);
    for (const pf of pub.publicFacts) {
      for (const bad of SYSTEM_FORBIDDEN_PUBLIC_TERMS) {
        expect(pf.summary).not.toContain(bad);
      }
      expect(pf.summary).not.toContain('…');
    }
  });

  it('tick >= 12 确定性触发气运暴击返还，开启「天道托管」自动派令且分片推进哈希完全一致', () => {
    const w0 = createInitialWorld(20261123);
    const sStart = advance(w0, 12, [
      { commandId: 'auto-init', type: 'recruitment.auto_fill' },
      { commandId: 'toggle-auto-on', type: 'system.toggle_auto_dispatch', enabled: true },
    ]).state;
    expect(sStart.autoDispatchEnabled).toBe(true);

    // 一次推进 vs 随机分片推进必须严格同哈希
    const oneShot = advance(cloneState(sStart), 60, []).state;
    let chunked = cloneState(sStart);
    for (const b of [17, 25, 33, 44, 53, 60]) {
      chunked = advance(chunked, b, []).state;
    }
    expect(hashCanonical(chunked)).toBe(hashCanonical(oneShot));

    // 自动托管期间已替宿主派发悬赏，并触发了暴击返还账本或大捷
    const autoMissions = oneShot.missions.filter((m) => m.source === 'player_bounty');
    expect(autoMissions.length).toBeGreaterThanOrEqual(3);
    const hasCritLedger = oneShot.ledger.some((l) => l.id.endsWith(':crit'));
    expect(hasCritLedger).toBe(true);
  });
});
