import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SYSTEM_FORBIDDEN_PUBLIC_TERMS } from '../../src/sim/constants';
import { applyCultivationDelta } from '../../src/sim/cultivation';
import { advance, cloneState } from '../../src/sim/engine';
import { computeMemberPowerScore } from '../../src/sim/power';
import { projectHostView, projectPublicView } from '../../src/sim/projections';
import type { SimCommand } from '../../src/sim/types';
import { createInitialWorld } from '../../src/sim/worldgen';

function getReadyHostState() {
  const w0 = createInitialWorld(20261123);
  const dual = w0.recruitment.candidates.find(
    (c) => c.requirement.minSeatTier === 'outer' && c.hasAlchemyFire && c.hasSwordStance,
  )!;
  const r = advance(w0, 1, [
    { commandId: 'inv-ready', type: 'recruitment.invite', candidateId: dual.id, seatTier: 'outer' },
  ]);
  return { state: r.state, hostId: r.receipts[0].memberId! };
}

describe('N2 预留释放、幂等发奖、三视角隐私与非负不变式', () => {
  it('宿主推辞、期限到期、挑战失利三种未成情形均完整归还预留', () => {
    // 1. 宿主带伤时派发擂上首胜 -> 自主推辞并立即释放 6 道源
    const { state: s1, hostId } = getReadyHostState();
    const injuredState = cloneState(s1);
    injuredState.members.find((m) => m.id === hostId)!.injuries.push('旧伤未愈');

    const declined = advance(injuredState, injuredState.tick + 2, [
      {
        commandId: 'm-decline',
        type: 'mission.issue',
        recipientId: hostId,
        targetType: 'first_arena_win',
        rewardKind: 'cultivation_rounds',
        rewardRounds: 10,
      },
    ]);
    expect(declined.state.missions.find((m) => m.commandId === 'm-decline')?.status).toBe('declined');
    expect(declined.state.daoyuanReserved).toBe(0);
    expect(declined.state.daoyuanAvailable).toBe(injuredState.daoyuanAvailable);

    // 2. 期限仅给 1 刻（赶不及完成开炉） -> 到期过期释放预留
    const expired = advance(s1, s1.tick + 2, [
      {
        commandId: 'm-expire',
        type: 'mission.issue',
        recipientId: hostId,
        targetType: 'first_alchemy',
        rewardKind: 'cultivation_rounds',
        rewardRounds: 10,
        deadlineTicks: 1,
      },
    ]);
    const expMission = expired.state.missions.find((m) => m.commandId === 'm-expire')!;
    expect(expMission.status).toBe('expired');
    expect(expired.state.daoyuanReserved).toBe(0);
    expect(expired.state.daoyuanAvailable).toBe(s1.daoyuanAvailable);

    // 3. 对手战力碾压导致挑战失利并到期 -> 标记 failed 且归还预留
    const hardState = cloneState(s1);
    hardState.arenaOpponents[0] = {
      ...hardState.arenaOpponents[0],
      powerScore: 150,
      maxHp: 200,
      attack: 45,
      defense: 20,
      evasion: 70,
    };
    const failed = advance(hardState, hardState.tick + 6, [
      {
        commandId: 'm-fail-duel',
        type: 'mission.issue',
        recipientId: hostId,
        targetType: 'first_arena_win',
        rewardKind: 'cultivation_rounds',
        rewardRounds: 10,
        deadlineTicks: 4,
      },
    ]);
    const failMission = failed.state.missions.find((m) => m.commandId === 'm-fail-duel')!;
    expect(failMission.status).toBe('failed');
    expect(failed.state.daoyuanReserved).toBe(0);
    expect(failed.state.daoyuanAvailable).toBe(hardState.daoyuanAvailable);
  });

  it('重复投递相同 commandId 与重复推演只扣一次预留、只发一笔奖励', () => {
    const { state, hostId } = getReadyHostState();
    const cmd: SimCommand = {
      commandId: 'dup-cmd-1',
      type: 'mission.issue',
      recipientId: hostId,
      targetType: 'first_alchemy',
      rewardKind: 'cultivation_rounds',
      rewardRounds: 10,
    };

    const r1 = advance(state, state.tick, [cmd, cmd, cmd]);
    const playerMissions = r1.state.missions.filter((m) => m.commandId === 'dup-cmd-1');
    expect(playerMissions.length).toBe(1);
    expect(r1.state.daoyuanReserved).toBe(6);

    const settled = advance(r1.state, r1.state.tick + 12, [cmd]);
    const grants = settled.state.ledger.filter(
      (l) => l.settlementId === playerMissions[0].id && l.kind === 'cultivation_grant',
    );
    expect(grants.length).toBe(1);
    expect(grants[0].delta).toBe(80);
  });

  it('三视角隐私绝对隔离：公开纪事零系统词，宿主B不泄露宿主A私令', () => {
    const { state, hostId } = getReadyHostState();
    const r = advance(state, state.tick + 8, [
      {
        commandId: 'priv-1',
        type: 'mission.issue',
        recipientId: hostId,
        targetType: 'first_alchemy',
        rewardKind: 'cultivation_rounds',
        rewardRounds: 10,
      },
    ]);

    const hostViewA = projectHostView(r.state, hostId)!;
    const hostViewOther = projectHostView(r.state, 'member_master')!;
    const publicView = projectPublicView(r.state);

    expect(hostViewA.privateMissions.some((m) => m.targetType === 'first_alchemy')).toBe(true);
    expect(hostViewOther.privateMissions.some((m) => m.recipientId === hostId)).toBe(false);
    expect(
      hostViewOther.visibleFacts.some(
        (f) => f.visibility === 'host_private' && f.recipientId === hostId,
      ),
    ).toBe(false);

    for (const pf of publicView.publicFacts) {
      for (const term of SYSTEM_FORBIDDEN_PUBLIC_TERMS) {
        expect(pf.summary).not.toContain(term);
      }
    }

    // 回归：宿主视角严禁出现空白文案卡片，系统接入事实应标为 system_only
    for (const vf of hostViewA.visibleFacts) {
      const text = vf.privateSummary ?? vf.publicSummary;
      expect(text && text.trim().length > 0).toBe(true);
    }
    expect(r.state.facts.find((f) => f.id === 'fact_2')?.visibility).toBe('system_only');
  });

  it('修为增长及突破炼气小关时战力单调不降', () => {
    const { state, hostId } = getReadyHostState();
    const member = cloneState(state).members.find((m) => m.id === hostId)!;
    let prevPower = computeMemberPowerScore(member);
    for (let i = 0; i < 12; i += 1) {
      applyCultivationDelta(member, 25);
      const nextPower = computeMemberPowerScore(member);
      expect(nextPower).toBeGreaterThanOrEqual(prevPower);
      prevPower = nextPower;
    }
  });

  it('随机命令序列下库存、道源可用额与预留额永远非负（fast-check）', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            ticks: fc.integer({ min: 1, max: 6 }),
            action: fc.constantFrom('alchemy', 'arena', 'focus_alc', 'focus_bal', 'auto_fill'),
          }),
          { minLength: 3, maxLength: 12 },
        ),
        (steps) => {
          let cur = createInitialWorld(20261123);
          let seq = 1;
          for (const st of steps) {
            const activeDisciple = cur.members.find(
              (m) => m.role === 'disciple' && m.status === 'active' && m.hasAlchemyFire,
            );
            const cmds: SimCommand[] = [];
            if (st.action === 'auto_fill') {
              cmds.push({ commandId: `fc-${seq++}`, type: 'recruitment.auto_fill' });
            } else if (st.action === 'focus_alc') {
              cmds.push({ commandId: `fc-${seq++}`, type: 'sect.set_focus', focus: 'alchemy' });
            } else if (st.action === 'focus_bal') {
              cmds.push({ commandId: `fc-${seq++}`, type: 'sect.set_focus', focus: 'balanced' });
            } else if (st.action === 'alchemy' && activeDisciple) {
              cmds.push({
                commandId: `fc-${seq++}`,
                type: 'mission.issue',
                recipientId: activeDisciple.id,
                targetType: 'first_alchemy',
              });
            } else if (st.action === 'arena' && activeDisciple) {
              cmds.push({
                commandId: `fc-${seq++}`,
                type: 'mission.issue',
                recipientId: activeDisciple.id,
                targetType: 'first_arena_win',
              });
            }
            cur = advance(cur, cur.tick + st.ticks, cmds).state;
            expect(cur.daoyuanAvailable).toBeGreaterThanOrEqual(0);
            expect(cur.daoyuanReserved).toBeGreaterThanOrEqual(0);
            for (const q of Object.values(cur.inventory.herbs)) expect(q).toBeGreaterThanOrEqual(0);
            for (const q of Object.values(cur.inventory.pills)) expect(q).toBeGreaterThanOrEqual(0);
            for (const q of Object.values(cur.inventory.talismans)) expect(q).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});
