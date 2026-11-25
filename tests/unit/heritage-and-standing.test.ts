import { describe, expect, it } from 'vitest';
import { runAlchemyAttempt } from '../../src/sim/alchemy';
import { advance } from '../../src/sim/engine';
import { createInitialWorld } from '../../src/sim/worldgen';

describe('N3 道统首成、权限成长与常开悬赏', () => {
  it('单人首次成丹不加根基；创法者本人开炉不触发传承；后学独立复现新法才首成并解锁自动悬赏', () => {
    const w0 = createInitialWorld(20261123);
    const dualCand = w0.recruitment.candidates.find(
      (c) => c.requirement.minSeatTier === 'outer' && c.hasAlchemyFire && c.hasSwordStance,
    )!;

    // 1. 招入新人（起初不会分火提清法）
    const afterJoin = advance(w0, 1, [
      { commandId: 'inv-h1', type: 'recruitment.invite', candidateId: dualCand.id, seatTier: 'outer' },
    ]);
    const discipleId = afterJoin.receipts[0].memberId!;
    const discipleAtStart = afterJoin.state.members.find((m) => m.id === discipleId)!;
    expect(discipleAtStart.knownMethods).not.toContain('method_fenhuo_tiqing');
    expect(
      afterJoin.state.members.find((m) => m.id === 'member_alchemy_elder')?.knownMethods,
    ).toContain('method_fenhuo_tiqing');

    // 2. 创法者（丹堂长老）自己使用分火提清法炼丹 -> 不会记为传承首成
    const elderSolo = runAlchemyAttempt(
      afterJoin.state,
      afterJoin.state.members.find((m) => m.id === 'member_alchemy_elder')!,
      'recipe_humai',
      { useFenhuoMethod: true },
    );
    expect(elderSolo?.success).toBe(true);
    expect(afterJoin.state.foundationPoints).toBe(0);

    // 3. 弟子先完成「首炼灵丹」 -> 根基仍为 0（验证单人首炼不涨根基）
    const afterFirst = advance(afterJoin.state, 8, [
      {
        commandId: 'first-alc-1',
        type: 'mission.issue',
        recipientId: discipleId,
        targetType: 'first_alchemy',
      },
    ]);
    expect(afterFirst.state.members.find((m) => m.id === discipleId)!.hasCompletedFirstAlchemy).toBe(true);
    expect(afterFirst.state.foundationPoints).toBe(0);
    expect(afterFirst.state.unlockedPermissions).not.toContain('standing_bounty');

    // 4. 在开放权限前尝试建立常开悬赏 -> 拒绝
    const premature = advance(afterFirst.state, afterFirst.state.tick, [
      {
        commandId: 'premature-standing',
        type: 'standing_bounty.create',
        title: '过早悬赏',
        triggerCondition: 'new_disciple_first_arena_win',
        rewardKind: 'talisman_escape',
      },
    ]);
    expect(premature.receipts[0].ok).toBe(false);

    // 5. 派发「承传分火提清」：后学受教并独立使出分火提清法凝丹 -> 首成 +2 根基、+12 道源、解锁自动悬赏
    const afterHeritage = advance(premature.state, premature.state.tick + 10, [
      {
        commandId: 'heritage-task-1',
        type: 'mission.issue',
        recipientId: discipleId,
        targetType: 'followup_heritage_fenhuo',
      },
    ]);
    expect(afterHeritage.state.heritages.length).toBe(1);
    expect(afterHeritage.state.heritages[0].successorId).toBe(discipleId);
    expect(afterHeritage.state.foundationPoints).toBe(2);
    expect(afterHeritage.state.unlockedPermissions).toContain('standing_bounty');
    expect(afterHeritage.state.facts.some((f) => f.type === 'system.advanced')).toBe(true);

    // 6. 建立常开悬赏「新入门者首次赢下同境擂，赏遁符一张」，再开启第2届招进新人 -> 新人自动收令并兑现进个人行囊
    const withStanding = advance(afterHeritage.state, afterHeritage.state.tick, [
      {
        commandId: 'create-standing-1',
        type: 'standing_bounty.create',
        title: '新人擂台首胜赏遁符',
        triggerCondition: 'new_disciple_first_arena_win',
        rewardKind: 'talisman_escape',
      },
      {
        commandId: 'open-gen-2',
        type: 'recruitment.open_session',
        regionId: 'beihuang',
      },
    ]);
    expect(withStanding.receipts[0].ok).toBe(true);
    const secondNewcomer = withStanding.state.recruitment.candidates.find(
      (c) => c.requirement.minSeatTier === 'outer',
    )!;
    const afterNewcomer = advance(withStanding.state, withStanding.state.tick + 10, [
      {
        commandId: 'inv-gen2',
        type: 'recruitment.invite',
        candidateId: secondNewcomer.id,
        seatTier: 'outer',
      },
    ]);
    const newcomerId = afterNewcomer.receipts[0].memberId!;
    const standingMissions = afterNewcomer.state.missions.filter(
      (m) => m.recipientId === newcomerId && m.source === 'standing_bounty',
    );
    expect(standingMissions.length).toBe(1);
    expect(standingMissions[0].status).toBe('completed');
    const newcomer = afterNewcomer.state.members.find((m) => m.id === newcomerId)!;
    expect(newcomer.pouchTalismans).toBe(1);
  });
});
