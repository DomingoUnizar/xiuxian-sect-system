import { describe, expect, it } from 'vitest';
import { advance } from '../../src/sim/engine';
import { projectHostView, projectPublicView } from '../../src/sim/projections';
import { createInitialWorld } from '../../src/sim/worldgen';

describe('N1 招贤、试艺、自愿入宗与秘密绑定边界', () => {
  it('不同种子产生不同的人选与来历，同一届重启或仅推进时间保持原候选不刷新', () => {
    const w1 = createInitialWorld(20261123);
    const w2 = createInitialWorld(98765432);

    expect(w1.recruitment.candidates.map((c) => c.name)).not.toEqual(
      w2.recruitment.candidates.map((c) => c.name),
    );

    const afterIdle = advance(w1, 10, []);
    expect(afterIdle.state.recruitment.candidates).toEqual(w1.recruitment.candidates);
  });

  it('试艺只揭示已有资质与技能，不改写任何先天数值', () => {
    const w0 = createInitialWorld(20261123);
    const target = w0.recruitment.candidates[0];
    const res = advance(w0, 1, [
      { commandId: 'aud-1', type: 'recruitment.audition', candidateId: target.id },
    ]);
    const after = res.state.recruitment.candidates[0];
    expect(after.auditioned).toBe(true);
    expect(after.spiritRoot).toEqual(target.spiritRoot);
    expect(after.aptitude).toEqual(target.aptitude);
    expect(after.knownMethods).toEqual(target.knownMethods);
  });

  it('未入门候选不可接私令；条件不合会婉拒；自愿入宗当场原子绑定且立收私有入门令', () => {
    const w0 = createInitialWorld(20261123);
    const alchemyReqCand = w0.recruitment.candidates.find(
      (c) => c.requirement.minSeatTier === 'alchemy_hall',
    )!;
    const outerFriendlyCand = w0.recruitment.candidates.find(
      (c) => c.requirement.minSeatTier === 'outer' && c.hasAlchemyFire && c.hasSwordStance,
    )!;

    // 1. 尝试对未入门候选直接派令必须被拒绝
    const badIssue = advance(w0, 1, [
      {
        commandId: 'bad-issue-1',
        type: 'mission.issue',
        recipientId: outerFriendlyCand.id,
        targetType: 'first_alchemy',
      },
    ]);
    expect(badIssue.receipts[0].ok).toBe(false);

    // 2. 用不匹配的普通外门席邀请要求丹堂师承的学徒 -> 自愿谢绝
    const declinedRes = advance(badIssue.state, 2, [
      {
        commandId: 'inv-decline',
        type: 'recruitment.invite',
        candidateId: alchemyReqCand.id,
        seatTier: 'outer',
      },
    ]);
    const declinedCand = declinedRes.state.recruitment.candidates.find(
      (c) => c.id === alchemyReqCand.id,
    )!;
    expect(declinedCand.outcome).toBe('declined');
    expect(declinedRes.state.recruitment.remainingSeats).toBe(2);

    // 3. 邀请符合条件的双栖新秀 -> 正式入门并建立绑定 + 立收私令（其他人和公开纪事均不可见）
    const joinedRes = advance(declinedRes.state, 3, [
      {
        commandId: 'inv-accept',
        type: 'recruitment.invite',
        candidateId: outerFriendlyCand.id,
        seatTier: 'outer',
      },
    ]);
    const memberId = joinedRes.receipts[0].memberId!;
    expect(memberId).toBeTruthy();

    const member = joinedRes.state.members.find((m) => m.id === memberId)!;
    expect(member.binding.bound).toBe(true);
    expect(member.portraitId).toBe(outerFriendlyCand.portraitId);

    const newHostView = projectHostView(joinedRes.state, memberId)!;
    const elderHostView = projectHostView(joinedRes.state, 'member_master')!;
    const publicView = projectPublicView(joinedRes.state);

    expect(newHostView.privateMissions.length).toBe(1);
    expect(elderHostView.privateMissions.some((m) => m.recipientId === memberId)).toBe(false);
    expect(publicView.publicFacts.some((f) => f.summary.includes('系统') || f.summary.includes('【叮'))).toBe(false);
  });

  it('退宗者停收新令且保留保密约束，重入山门沿用原身份与原绑定', () => {
    const w0 = createInitialWorld(20261123);
    // 初始已有退宗旧人 member_departed_01
    const issueToDeparted = advance(w0, 1, [
      {
        commandId: 'bad-departed',
        type: 'mission.issue',
        recipientId: 'member_departed_01',
        targetType: 'first_alchemy',
      },
    ]);
    expect(issueToDeparted.receipts[0].ok).toBe(false);

    // 重入山门应恢复 active 且保留原 ID 和原绑定号
    const rejoined = advance(issueToDeparted.state, 2, [
      {
        commandId: 'rejoin-1',
        type: 'member.rejoin',
        memberId: 'member_departed_01',
      },
    ]);
    const m = rejoined.state.members.find((x) => x.id === 'member_departed_01')!;
    expect(m.status).toBe('active');
    expect(m.binding.bindingId).toBe('bind_0_departed');
  });
});
