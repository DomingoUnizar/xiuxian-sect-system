import { describe, expect, it } from 'vitest';
import { SYSTEM_FORBIDDEN_PUBLIC_TERMS } from '../../src/sim/constants';
import { advance, cloneState } from '../../src/sim/engine';
import { pruneWorldHistory } from '../../src/sim/facts';
import { hashCanonical } from '../../src/sim/hash';
import { computeMemberPowerScore } from '../../src/sim/power';
import { projectPublicView } from '../../src/sim/projections';
import { deriveMemberObsession } from '../../src/sim/schemes';
import { createInitialWorld } from '../../src/sim/worldgen';

describe('真可玩核心循环：先天气运命格、外挂三选一、奇袭前哨与实况手操斗法', () => {
  it('杜绝第1天秒通漏洞：跨大章首领靠真实攻防碾压未发育角色；拔除前哨+场外破招可合规赢下第1幕', () => {
    const base = createInitialWorld(20261123);
    expect(base.members[0].destinyTraits?.length).toBe(2);
    expect(base.recruitment.candidates[0].destinyTraits?.length).toBe(2);

    // 1. 若强行跳到第4幕（战力700金丹首座），第1天227战力的宗主即使开「借剑仙一击」也绝不可能秒杀跳过
    const skipAttempt = cloneState(base);
    skipAttempt.sectCrisis!.chapterIndex = 3;
    const skipDuel = advance(skipAttempt, 0, [
      { commandId: 'skip-start', type: 'crisis.resolve_now' },
      { commandId: 'skip-strike', type: 'duel.cheat', cheat: 'sword_immortal_strike' },
      { commandId: 'skip-finish', type: 'duel.step', mode: 'auto_finish' },
    ]).state;
    expect(skipDuel.activeDuel?.status).toBe('defeat');
    expect(skipDuel.sectCrisis?.chapterIndex).toBe(3);

    // 2. 正常战术流程：先奇袭寒鸦山口前哨 -> 削弱第1幕首领18% -> 再实况对决并配合识海传音破招赢下第1幕！
    let s = cloneState(base);
    s = advance(s, 0, [
      { commandId: 'raid-1', type: 'crisis.raid_outpost' },
      { commandId: 'raid-fin', type: 'duel.step', mode: 'auto_finish' },
      { commandId: 'raid-close', type: 'duel.close' },
    ]).state;
    expect(s.sectCrisis?.outpostCleared).toBe(true);

    s = advance(s, 0, [
      { commandId: 'boss-1', type: 'crisis.resolve_now' },
      { commandId: 'boss-r1', type: 'duel.step', mode: 'one_round' },
    ]).state;
    expect(s.activeDuel?.oppWeakenedByOutpost).toBe(true);
    expect(s.activeDuel?.oppChargingUltimate).toBe(true);

    // 敌方蓄力绝杀时拍下「识海传音·破招」闪避并反击暴击，再借剑仙一击完胜收官
    s = advance(s, 0, [
      { commandId: 'boss-whisper', type: 'duel.cheat', cheat: 'whisper_dodge' },
      { commandId: 'boss-r2', type: 'duel.step', mode: 'one_round' },
      { commandId: 'boss-strike', type: 'duel.cheat', cheat: 'sword_immortal_strike' },
      { commandId: 'boss-fin', type: 'duel.step', mode: 'auto_finish' },
      { commandId: 'boss-close', type: 'duel.close' },
    ]).state;
    expect(s.activeDuel).toBeNull();
    expect(s.sectCrisis?.chapterIndex).toBe(1);
    expect(s.foundationPoints).toBeGreaterThanOrEqual(3);
  });

  it('幕后私令带6刻同招冷却防无脑连点，满60算力弹出天机外挂三选一并激活全局插件', () => {
    const w0 = createInitialWorld(20261123);
    w0.daoyuanAvailable = 50;
    const obs = deriveMemberObsession(w0, w0.members[0]);
    expect(obs.monologue).not.toContain('…');

    const seniorId = 'member_senior_disciple';
    const seniorBefore = computeMemberPowerScore(w0.members.find((m) => m.id === seniorId)!);

    // 连续点两次同一人的「雪中送炭」，第二次应被6刻消化冷却拦截
    const r = advance(w0, 0, [
      { commandId: 'sc-n1', type: 'scheme.execute', memberId: seniorId, schemeKind: 'nurture' },
      { commandId: 'sc-n2', type: 'scheme.execute', memberId: seniorId, schemeKind: 'nurture' },
      { commandId: 'sc-riv', type: 'scheme.execute', memberId: seniorId, schemeKind: 'dual_rivalry' },
    ]);
    expect(r.receipts[0].ok).toBe(true);
    expect(r.receipts[1].ok).toBe(false);
    expect(r.receipts[2].ok).toBe(true);

    const s1 = r.state;
    const seniorAfter = s1.members.find((m) => m.id === seniorId)!;
    // senior 拥有内卷狂魔命格，双头拱火羁绊直接+18战力！
    expect(computeMemberPowerScore(seniorAfter)).toBeGreaterThanOrEqual(seniorBefore + 18);

    // 两道私令累计 >= 60 算力，已生成 3 枚不重复外挂供三选一
    expect(s1.pendingPerkChoices?.length).toBe(3);
    const chosenPerk = s1.pendingPerkChoices![0];
    const s2 = advance(s1, 1, [
      { commandId: 'pick-perk-1', type: 'perk.choose', perkId: chosenPerk },
    ]).state;
    expect(s2.pendingPerkChoices).toBeNull();
    expect(s2.systemLevel).toBe(1);
    expect(s2.activePerks).toContain(chosenPerk);

    // 公开视角零系统词与零省略号校验
    const pub = projectPublicView(s2);
    for (const pf of pub.publicFacts) {
      for (const bad of SYSTEM_FORBIDDEN_PUBLIC_TERMS) {
        expect(pf.summary).not.toContain(bad);
      }
      expect(pf.summary).not.toContain('…');
    }
    for (const dr of s2.dramaLogs ?? []) {
      for (const bad of SYSTEM_FORBIDDEN_PUBLIC_TERMS) {
        expect(dr.publicShock).not.toContain(bad);
      }
      expect(dr.publicShock).not.toContain('…');
    }
  });

  it('跨过三十日护匾大限（tick 0 -> 400）单次推进与分片推进哈希严格一致', () => {
    const w0 = createInitialWorld(20261123);
    const single = advance(cloneState(w0), 400, []).state;

    let chunked = cloneState(w0);
    for (const b of [40, 120, 240, 359, 360, 400]) {
      chunked = advance(chunked, b, []).state;
    }
    expect(hashCanonical(chunked)).toBe(hashCanonical(single));
  });

  it('大乘期高数值与长局海量历史下，pruneWorldHistory 确定性裁剪体积且前哨首回合顺滑胜出', () => {
    const big = createInitialWorld(20261123);
    big.sectCrisis!.chapterIndex = 9;
    big.daoyuanAvailable = 190064;
    big.activePerks = ['perk_gu_involution'];

    const ace = big.members[0];
    ace.realm = '无漏';
    ace.realmLayer = 9;
    ace.cultivation = 12000;
    ace.aptitude.bone = 95;
    ace.bonds = [
      { targetId: 'member_elder_1', targetName: '江玄月', kind: 'rivalry', label: '死磕', powerBonus: 24 },
    ];
    ace.notes = Array.from({ length: 85 }, (_, i) => `历练手札-${i}`);
    for (let i = 0; i < 105; i += 1) {
      big.inventory.weapons.push({
        id: `wpn_extra_${i}`,
        templateId: 'weapon_chaowen_sword',
        name: `铁剑${i}`,
        tier: '凡阶',
        quality: '中品',
        iconPath: 'assets/weapons/sword_t01_001.png',
        durability: 40,
        maxDurability: 40,
        attackBonus: i,
        defenseBonus: 5,
      });
    }
    for (let i = 0; i < 28; i += 1) {
      big.tournaments!.push({
        id: `tourn_${i}`,
        tickOpened: i * 10,
        prepResolveTick: i * 10 + 2,
        duelResolveTick: i * 10 + 4,
        phase: 'settled',
        breakthroughHostId: ace.id,
        championHostId: ace.id,
        guardianElderId: ace.id,
        breakthroughMissionId: `bm_${i}`,
        championMissionId: `cm_${i}`,
        guardMissionId: `gm_${i}`,
      });
    }

    pruneWorldHistory(big);
    expect(ace.notes.length).toBe(40);
    expect(big.inventory.weapons.length).toBe(80);
    expect(big.tournaments!.length).toBe(12);

    const out = advance(big, 0, [
      { commandId: 'late-raid', type: 'crisis.raid_outpost', challengerMemberId: ace.id },
      { commandId: 'late-r1', type: 'duel.step', mode: 'one_round' },
    ]).state;
    expect(out.activeDuel?.round).toBe(1);
    expect(out.activeDuel?.status).toBe('victory');
    expect(out.sectCrisis?.outpostCleared).toBe(true);
  });

  it('does not hang when advance is called while activeDuel or pendingClutch pauses the clock', () => {
    const world = createInitialWorld(20261123);
    const duelRes = advance(world, 0, [{ commandId: 'hang-raid', type: 'crisis.raid_outpost' }]);
    expect(duelRes.state.activeDuel?.status).toBe('fighting');

    const catchUpWhileDuel = advance(duelRes.state, duelRes.state.tick + 50, []);
    expect(catchUpWhileDuel.state.tick).toBe(duelRes.state.tick);
    expect(catchUpWhileDuel.state.activeDuel?.status).toBe('fighting');

    const resolvedDuel = advance(catchUpWhileDuel.state, catchUpWhileDuel.state.tick, [
      { commandId: 'hang-finish', type: 'duel.step', mode: 'auto_finish' },
      { commandId: 'hang-close', type: 'duel.close' },
    ]);
    expect(resolvedDuel.state.activeDuel).toBeNull();

    const clutchState = createInitialWorld(20261123);
    clutchState.pendingClutch = {
      id: 'clutch_test',
      kind: 'crisis_showdown',
      title: '测试绝境',
      actorId: clutchState.members[0].id,
      actorName: clutchState.members[0].name,
      actorPortraitId: clutchState.members[0].portraitId,
      beats: ['b1'],
      crisisPrompt: 'p',
      futureCost: 14,
      aegisCost: 10,
      spawnedAtTick: 0,
    };

    const catchUpWhileClutch = advance(clutchState, clutchState.tick + 50, []);
    expect(catchUpWhileClutch.state.tick).toBe(clutchState.tick);
    expect(catchUpWhileClutch.state.pendingClutch?.id).toBe('clutch_test');
  });
});
