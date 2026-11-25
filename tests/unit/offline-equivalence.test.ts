import { describe, expect, it } from 'vitest';
import { runCombatEncounter } from '../../src/sim/combat';
import { EIGHT_HOURS_TICKS } from '../../src/sim/constants';
import { advance, cloneState } from '../../src/sim/engine';
import { hashCanonical } from '../../src/sim/hash';
import { computeElapsedTicks, createClockAnchor } from '../../src/sim/time';
import type { SimCommand } from '../../src/sim/types';
import { createInitialWorld } from '../../src/sim/worldgen';

describe('N3 离在线等价、崩溃续算、八小时补算性能与险境结果', () => {
  it('一次推进 vs 随机分片推进 vs 模拟中途崩溃续算，最终状态与随机游标哈希完全一致', () => {
    const base = createInitialWorld(20261123);
    const dualCand = base.recruitment.candidates.find(
      (c) => c.requirement.minSeatTier === 'outer' && c.hasAlchemyFire && c.hasSwordStance,
    )!;
    const inducted = advance(base, 1, [
      { commandId: 'eq-inv', type: 'recruitment.invite', candidateId: dualCand.id, seatTier: 'outer' },
    ]);
    const hostId = inducted.receipts[0].memberId!;

    const cmdsAtStart: SimCommand[] = [
      {
        commandId: 'eq-bounty',
        type: 'mission.issue',
        recipientId: hostId,
        targetType: 'first_alchemy',
      },
    ];
    const targetEndTick = 120;

    // 方式 A：一次性推进至 120 刻
    const singleShot = advance(cloneState(inducted.state), targetEndTick, cmdsAtStart);

    // 方式 B：非均匀随机分片推进至 120 刻
    const chunkBoundaries = [7, 19, 31, 48, 77, 103, 120];
    let chunkedState = advance(cloneState(inducted.state), inducted.state.tick, cmdsAtStart).state;
    for (const bound of chunkBoundaries) {
      chunkedState = advance(chunkedState, bound, []).state;
    }

    // 方式 C：模拟写入前崩溃并从第 31 刻已持久快照续算至 120 刻
    let crashedSaved = advance(cloneState(inducted.state), 31, cmdsAtStart).state;
    const recoveredState = advance(cloneState(crashedSaved), 120, []).state;

    expect(hashCanonical(chunkedState)).toBe(hashCanonical(singleShot.state));
    expect(hashCanonical(recoveredState)).toBe(hashCanonical(singleShot.state));
  });

  it('8 小时离线补算（5760 刻）与分片补算完全等价，且耗时远低于 2 秒', () => {
    const base = createInitialWorld(20261123);
    const dualCand = base.recruitment.candidates.find(
      (c) => c.requirement.minSeatTier === 'outer' && c.hasAlchemyFire && c.hasSwordStance,
    )!;
    const start = advance(base, 2, [
      { commandId: '8h-inv', type: 'recruitment.invite', candidateId: dualCand.id, seatTier: 'outer' },
      { commandId: '8h-auto', type: 'recruitment.auto_fill' },
    ]).state;

    const startWall = performance.now();
    const fullRun = advance(cloneState(start), start.tick + EIGHT_HOURS_TICKS, []);
    const elapsedMs = performance.now() - startWall;

    // 分成 48 刻一片重跑一次，核对大跨度分片等价
    let chunked = cloneState(start);
    const end = start.tick + EIGHT_HOURS_TICKS;
    while (chunked.tick < end) {
      chunked = advance(chunked, Math.min(end, chunked.tick + 48), []).state;
    }

    expect(elapsedMs).toBeLessThan(2000);
    expect(hashCanonical(chunked)).toBe(hashCanonical(fullRun.state));
  });

  it('系统时钟倒拨时以既有水位为下界不回退，超长跨度给出提示', () => {
    const anchor = createClockAnchor(1_700_000_100_000, 12);
    const backward = computeElapsedTicks(anchor, 1_700_000_050_000);
    expect(backward.ticksToAdvance).toBe(0);
    expect(backward.effectiveNowMs).toBe(anchor.lastWallClockMs);
    expect(backward.warning).toBeTruthy();

    const hugeJump = computeElapsedTicks(anchor, 1_700_000_100_000 + 24 * 60 * 60 * 1000);
    expect(hugeJump.warning).toBeTruthy();
    expect(hugeJump.ticksToAdvance).toBeGreaterThan(EIGHT_HOURS_TICKS);
  });

  it('严重失败或特殊险境：依次验证遁符脱身、法器护主、同门救援与无援战死留痕', () => {
    // 1. 宿主携遁符在极高险境落败 -> 消耗遁符脱身存活
    const w1 = createInitialWorld(20261123);
    const cand = w1.recruitment.candidates.find((c) => c.hasSwordStance)!;
    const advRes = advance(w1, 1, [
      { commandId: 'haz-1', type: 'recruitment.invite', candidateId: cand.id, seatTier: cand.requirement.minSeatTier },
    ]);
    const s1 = advRes.state;
    const discId = advRes.receipts[0].memberId!;
    const disc1 = s1.members.find((m) => m.id === discId)!;
    disc1.pouchTalismans = 1;
    disc1.hp = 30;
    const resTalisman = runCombatEncounter(s1, disc1, { mode: 'wild_expedition', hazardModifier: 35 });
    expect(resTalisman.hostDied).toBe(false);
    expect(resTalisman.battleFact.deltas.talismanConsumed).toBe(1);
    expect(disc1.pouchTalismans).toBe(0);

    // 2. 无遁符但佩剑完好 -> 法器护主减损耐久
    s1.inventory.talismans.talisman_escape = 0;
    disc1.pouchTalismans = 0;
    disc1.hp = 26;
    const beforeDur = disc1.equippedWeapon!.durability;
    const resWeapon = runCombatEncounter(s1, disc1, { mode: 'wild_expedition', hazardModifier: 35 });
    expect(resWeapon.hostDied).toBe(false);
    expect(resWeapon.battleFact.deltas.weaponProtected).toBe(true);
    expect(disc1.equippedWeapon!.durability).toBeLessThan(beforeDur);

    // 3. 无遁符且法器耐久耗尽，但有大师兄在籍且险境未绝 -> 同门出手救援
    disc1.equippedWeapon!.durability = 0;
    disc1.hp = 22;
    const resRescue = runCombatEncounter(s1, disc1, { mode: 'wild_expedition', hazardModifier: 35 });
    expect(resRescue.hostDied).toBe(false);
    expect(resRescue.battleFact.deltas.rescuedBy).toBeTruthy();

    // 4. 无遁符、法器耗尽、无同门可援且险境极深 -> 真实战死并留痕 member.died
    disc1.hp = 20;
    const resDead = runCombatEncounter(s1, disc1, { mode: 'wild_expedition', hazardModifier: 45 });
    expect(resDead.hostDied).toBe(true);
    expect(disc1.status).toBe('dead');
    expect(resDead.battleFact.deltas.deathCause).toBeTruthy();
    expect(s1.facts.some((f) => f.type === 'member.died' && f.actorIds.includes(disc1.id))).toBe(true);
  });
});
