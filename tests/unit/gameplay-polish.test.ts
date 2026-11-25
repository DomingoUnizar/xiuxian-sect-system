import { describe, expect, it } from 'vitest';
import { estimateBreakthroughChance, isAtRealmPeak } from '../../src/sim/breakthrough';
import { SYSTEM_FORBIDDEN_PUBLIC_TERMS } from '../../src/sim/constants';
import { advance, cloneState } from '../../src/sim/engine';
import { hashCanonical } from '../../src/sim/hash';
import { evaluateMissionHookPreview, getMissionAvailability } from '../../src/sim/missions';
import { computeMemberPowerScore, getCultivationPerRound } from '../../src/sim/power';
import { projectPublicView } from '../../src/sim/projections';
import { createInitialWorld } from '../../src/sim/worldgen';

describe('可玩性打磨：大境界破境、山门天时、多元诱饵赏格与心跳博弈', () => {
  it('炼气九层圆满宿主执行「破关冲境」真实破入筑基1层，战力、气血、寿元跃升且公开纪事无泄露', () => {
    const w0 = createInitialWorld(20261123);
    const elder = w0.members.find((m) => m.id === 'member_alchemy_elder')!;
    expect(isAtRealmPeak(elder)).toBe(false);
    expect(getMissionAvailability(w0, elder, 'realm_breakthrough').ok).toBe(false);

    // 推至炼气9层圆满，并备好护脉丹与天时以确保持续高把握破境
    elder.realm = '炼气';
    elder.realmLayer = 9;
    elder.cultivation = 260;
    elder.cultivationCap = 260;
    elder.foundation = 18;
    w0.inventory.pills.pill_humai_2_mid = 1;
    expect(isAtRealmPeak(elder)).toBe(true);

    const estBefore = estimateBreakthroughChance(w0, elder);
    expect(estBefore.chance).toBeGreaterThanOrEqual(75);

    const beforePower = computeMemberPowerScore(elder);
    const beforeHp = elder.maxHp;
    const beforeLifespan = elder.lifespanYears;

    const after = advance(w0, w0.tick + 5, [
      {
        commandId: 'bt-elder-1',
        type: 'mission.issue',
        recipientId: elder.id,
        targetType: 'realm_breakthrough',
        rewardKind: 'cultivation_rounds',
        rewardRounds: 12,
      },
    ]);

    const elderAfter = after.state.members.find((m) => m.id === 'member_alchemy_elder')!;
    expect(elderAfter.realm).toBe('筑基');
    expect(elderAfter.realmLayer).toBe(1);
    expect(elderAfter.maxHp).toBe(beforeHp + 48);
    expect(elderAfter.lifespanYears).toBe(beforeLifespan + 600);
    expect(computeMemberPowerScore(elderAfter)).toBeGreaterThan(beforePower + 50);

    const btFact = after.state.facts.find((f) => f.type === 'member.breakthrough');
    expect(btFact?.visibility).toBe('public');

    const pub = projectPublicView(after.state);
    for (const pf of pub.publicFacts) {
      for (const term of SYSTEM_FORBIDDEN_PUBLIC_TERMS) {
        expect(pf.summary).not.toContain(term);
      }
    }
  });

  it('「秘传玄功」与「库藏灵丹」赏格原子预留/兑现/过期全额归还，且救命丹药可打动带伤宿主接令', () => {
    const w0 = createInitialWorld(20261123);
    const cand = w0.recruitment.candidates.find(
      (c) => c.requirement.minSeatTier === 'outer' && c.hasAlchemyFire && c.hasSwordStance,
    )!;
    const s1 = advance(w0, 1, [
      { commandId: 'inv-hook', type: 'recruitment.invite', candidateId: cand.id, seatTier: 'outer' },
    ]).state;
    const hostId = s1.members.find((m) => m.name === cand.name)!.id;

    // 1. 悬赏《潮息归元经》全卷完成首炼 -> 达成后自动写入 knownMethods 并抬升每轮吐纳速率
    const rateBefore = getCultivationPerRound(s1.members.find((m) => m.id === hostId)!);
    const powBefore = computeMemberPowerScore(s1.members.find((m) => m.id === hostId)!);
    const afterMethod = advance(cloneState(s1), s1.tick + 6, [
      {
        commandId: 'issue-method-1',
        type: 'mission.issue',
        recipientId: hostId,
        targetType: 'first_alchemy',
        rewardKind: 'method_unlock',
        rewardMethodId: 'method_chaoxi_guiyuan',
      },
    ]);
    const hostAfterMethod = afterMethod.state.members.find((m) => m.id === hostId)!;
    expect(hostAfterMethod.knownMethods).toContain('method_chaoxi_guiyuan');
    expect(getCultivationPerRound(hostAfterMethod)).toBeGreaterThan(rateBefore);
    expect(computeMemberPowerScore(hostAfterMethod)).toBeGreaterThan(powBefore);

    // 2. 无伤宿主短期限未竟 -> 预留灵丹原数全额归还丹库
    const startPills = s1.inventory.pills.pill_ningling_1_low;
    const expiredPill = advance(cloneState(s1), s1.tick + 3, [
      {
        commandId: 'pill-expire-1',
        type: 'mission.issue',
        recipientId: hostId,
        targetType: 'first_arena_win',
        rewardKind: 'pill_grant',
        rewardItemId: 'pill_ningling_1_low',
        deadlineTicks: 1,
      },
    ]);
    const expM = expiredPill.state.missions.find((m) => m.commandId === 'pill-expire-1')!;
    expect(expM.status).toBe('expired');
    expect(expiredPill.state.inventory.pills.pill_ningling_1_low).toBe(startPills);
    expect(
      expiredPill.state.reservations.find((r) => r.missionId === expM.id)?.status,
    ).toBe('released');

    // 3. 带伤宿主面对常规修为令 -> 心存顾虑；改赐库藏灵丹「一阶下品凝灵丹」 -> 欣然破例接令并打赢兑现服丹
    const injured = cloneState(s1);
    const hInj = injured.members.find((m) => m.id === hostId)!;
    hInj.injuries.push('旧伤微损');
    hInj.hp = 60;

    const previewReluctant = evaluateMissionHookPreview(injured, hInj, 'first_arena_win', 'cultivation_rounds');
    const previewEager = evaluateMissionHookPreview(injured, hInj, 'first_arena_win', 'pill_grant', {
      rewardItemId: 'pill_ningling_1_low',
    });
    expect(previewReluctant.enthusiasm).toBe('reluctant');
    expect(previewEager.enthusiasm).toBe('eager');

    // 正常期限打赢切磋 -> 灵丹自专属预留当场兑现服下疗伤
    const wonPill = advance(cloneState(injured), injured.tick + 6, [
      {
        commandId: 'pill-win-1',
        type: 'mission.issue',
        recipientId: hostId,
        targetType: 'first_arena_win',
        rewardKind: 'pill_grant',
        rewardItemId: 'pill_ningling_1_low',
        deadlineTicks: 8,
      },
    ]);
    const wonMission = wonPill.state.missions.find((m) => m.commandId === 'pill-win-1')!;
    expect(wonMission.status).toBe('completed');
    expect(wonPill.state.inventory.pills.pill_ningling_1_low).toBe(startPills - 1);
    expect(wonPill.state.reservations.find((r) => r.missionId === wonMission.id)?.status).toBe('consumed');
    expect(wonPill.state.members.find((m) => m.id === hostId)!.injuries.length).toBe(0);
  });

  it('tick >= 12 起周期触发山门天时异象，随机分片推进与单次推进哈希严格一致', () => {
    const base = createInitialWorld(20261123);
    const single = advance(cloneState(base), 70, []).state;

    let chunked = cloneState(base);
    for (const bound of [5, 11, 12, 20, 28, 44, 59, 70]) {
      chunked = advance(chunked, bound, []).state;
    }

    expect(hashCanonical(chunked)).toBe(hashCanonical(single));
    const phenomFacts = single.facts.filter((f) => f.type === 'world.phenomenon');
    expect(phenomFacts.length).toBeGreaterThanOrEqual(3);
    for (const pf of phenomFacts) {
      expect(pf.visibility).toBe('public');
      for (const term of SYSTEM_FORBIDDEN_PUBLIC_TERMS) {
        expect(pf.publicSummary ?? '').not.toContain(term);
      }
    }
  });
});
