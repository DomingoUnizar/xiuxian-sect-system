import { describe, expect, it } from 'vitest';
import { advance, cloneState } from '../../src/sim/engine';
import { hashCanonical } from '../../src/sim/hash';
import { runAlchemyAttempt } from '../../src/sim/alchemy';
import type { SimCommand } from '../../src/sim/types';
import { createInitialWorld } from '../../src/sim/worldgen';

function createStartWithDualCandidate() {
  const w0 = createInitialWorld(20261123);
  const dualCand = w0.recruitment.candidates.find(
    (c) => c.requirement.minSeatTier === 'outer' && c.hasAlchemyFire && c.hasSwordStance,
  )!;
  const joined = advance(w0, 1, [
    { commandId: 'aud-dual', type: 'recruitment.audition', candidateId: dualCand.id },
    { commandId: 'inv-dual', type: 'recruitment.invite', candidateId: dualCand.id, seatTier: 'outer' },
  ]);
  const hostId = joined.receipts[1].memberId!;
  return { startState: joined.state, hostId };
}

describe('N2 同起点双支对照（首炼灵丹 vs 擂上首胜）', () => {
  it('同一名宿主、同一份十轮修为、仅换任务目标，按真实规则跑出截然不同的宗门成果', () => {
    const { startState, hostId } = createStartWithDualCandidate();
    const startHost = startState.members.find((m) => m.id === hostId)!;
    const startCultivation = startHost.cultivation;
    const startHerbs = { ...startState.inventory.herbs };

    const cmdA = {
      commandId: 'bounty-ab-1',
      type: 'mission.issue' as const,
      recipientId: hostId,
      targetType: 'first_alchemy' as const,
      rewardKind: 'cultivation_rounds' as const,
      rewardRounds: 10,
      deadlineTicks: 10,
    };
    const cmdB = {
      ...cmdA,
      targetType: 'first_arena_win' as const,
    };

    // 屏蔽 targetType 后共同输入哈希必须完全一致
    const maskTarget = (c: Extract<SimCommand, { type: 'mission.issue' }>) => ({ ...c, targetType: 'MASKED' });
    expect(hashCanonical(maskTarget(cmdA))).toBe(hashCanonical(maskTarget(cmdB)));

    const endTick = startState.tick + 8;
    const branchA = advance(cloneState(startState), endTick, [cmdA]);
    const branchB = advance(cloneState(startState), endTick, [cmdB]);

    const hostA = branchA.state.members.find((m) => m.id === hostId)!;
    const hostB = branchB.state.members.find((m) => m.id === hostId)!;

    // 1. A 支真实成丹：药材实耗，成丹入库，开启续炼与传承机会
    expect(hostA.hasCompletedFirstAlchemy).toBe(true);
    expect(hostA.hasWonFirstArena).toBe(false);
    expect(branchA.state.inventory.herbs.herb_ningling).toBeLessThan(startHerbs.herb_ningling);
    const totalPillsA = Object.values(branchA.state.inventory.pills).reduce((s, x) => s + x, 0);
    const totalPillsStart = Object.values(startState.inventory.pills).reduce((s, x) => s + x, 0);
    expect(totalPillsA).toBeGreaterThan(totalPillsStart);
    expect(Object.values(branchA.state.alchemyFacts).some((af) => af.actorId === hostId && af.success)).toBe(true);

    // 2. B 支真实胜擂：未耗炼丹草药，产出战报，开放复赛挑战席位并涨声望
    expect(hostB.hasWonFirstArena).toBe(true);
    expect(hostB.unlockedArenaRematch).toBe(true);
    expect(hostB.hasCompletedFirstAlchemy).toBe(false);
    expect(branchB.state.inventory.herbs.herb_ningling).toBe(startHerbs.herb_ningling);
    expect(branchB.state.sectReputation).toBeGreaterThan(startState.sectReputation);
    expect(Object.values(branchB.state.battleFacts).some((bf) => bf.actorIds.includes(hostId))).toBe(true);

    // 3. 两边十轮修为灌注增量严格等于 +80 缕，且与常规修炼分开入账
    const grantA = branchA.state.ledger.filter(
      (l) => l.recipientId === hostId && l.kind === 'cultivation_grant' && l.settlementId === branchA.receipts[0].missionId,
    );
    const grantB = branchB.state.ledger.filter(
      (l) => l.recipientId === hostId && l.kind === 'cultivation_grant' && l.settlementId === branchB.receipts[0].missionId,
    );
    expect(grantA.length).toBe(1);
    expect(grantB.length).toBe(1);
    expect(grantA[0].delta).toBe(80);
    expect(grantB[0].delta).toBe(80);
    expect(hostA.cultivation).toBeGreaterThanOrEqual(startCultivation + 80);
    expect(hostB.cultivation).toBeGreaterThanOrEqual(startCultivation + 80);
  });

  it('保留真实失败样本：护脉丹无分火手法直接开炉或带伤挑战强敌会真实失败', () => {
    const { startState, hostId } = createStartWithDualCandidate();
    const s = cloneState(startState);
    const host = s.members.find((m) => m.id === hostId)!;
    // 赋予伤势，尝试炼制二阶护脉丹应产生真实失败 AlchemyFact 且不入库新护脉丹
    host.injuries.push('炉火反冲轻伤');
    const attempt = runAlchemyAttempt(s, host, 'recipe_humai');
    expect(attempt).not.toBeNull();
    expect(attempt!.success).toBe(false);
    expect(attempt!.alchemyFact.failureReason).toBeTruthy();
    expect(s.inventory.pills.pill_humai_2_mid ?? 0).toBe(0);
  });
});
