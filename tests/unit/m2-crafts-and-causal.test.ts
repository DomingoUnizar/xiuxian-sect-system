import { describe, expect, it } from 'vitest';
import { runAlchemyAttempt } from '../../src/sim/alchemy';
import { SYSTEM_FORBIDDEN_PUBLIC_TERMS } from '../../src/sim/constants';
import { advance, cloneState } from '../../src/sim/engine';
import { hashCanonical } from '../../src/sim/hash';
import { projectHostView, projectPublicView } from '../../src/sim/projections';
import { createClockAnchor } from '../../src/sim/time';
import type { SaveEnvelope, WorldState } from '../../src/sim/types';
import { createInitialWorld } from '../../src/sim/worldgen';
import { SectDatabase } from '../../src/storage/db';
import { computeSaveChecksum, SaveRepository } from '../../src/storage/repository';

function recruitDualDisciple(seed = 20261123) {
  const w0 = createInitialWorld(seed);
  const dual = w0.recruitment.candidates.find(
    (c) => c.requirement.minSeatTier === 'outer' && c.hasAlchemyFire && c.hasSwordStance,
  )!;
  const res = advance(w0, 1, [
    { commandId: 'm2-inv-dual', type: 'recruitment.invite', candidateId: dual.id, seatTier: 'outer' },
  ]);
  return { state: res.state, discipleId: res.receipts[0].memberId! };
}

function advanceThroughM2Heritages(startState: WorldState, discipleId: string) {
  // 1. 首炼 + 承传分火提清 -> +2 根基 (解锁 standing_bounty)
  const s1 = advance(startState, startState.tick + 6, [
    { commandId: 'm2-h1', type: 'mission.issue', recipientId: discipleId, targetType: 'first_alchemy' },
  ]).state;
  const s2 = advance(s1, s1.tick + 8, [
    {
      commandId: 'm2-h2',
      type: 'mission.issue',
      recipientId: discipleId,
      targetType: 'followup_heritage_fenhuo',
    },
  ]).state;
  expect(s2.foundationPoints).toBe(2);
  expect(s2.unlockedPermissions).toContain('standing_bounty');

  // 2. 弟子学习「接锋蓄水纹」锻铸「储水回锋剑」（并预封隐藏机缘） -> +3 根基 (共 5，解锁 rule_grant)
  const s3 = advance(s2, s2.tick + 6, [
    {
      commandId: 'm2-h3',
      type: 'mission.issue',
      recipientId: discipleId,
      targetType: 'craft_forging_sword',
      includeHiddenReward: true,
    },
  ]).state;
  expect(s3.foundationPoints).toBe(5);
  expect(s3.unlockedPermissions).toContain('rule_grant');

  // 3. 弟子学习「循铃御兽诀」携灵兽探泉采露 -> +4 根基 (共 9，解锁 multi_causal)
  const s4 = advance(s3, s3.tick + 6, [
    {
      commandId: 'm2-h4',
      type: 'mission.issue',
      recipientId: discipleId,
      targetType: 'craft_beast_gather',
    },
  ]).state;
  expect(s4.foundationPoints).toBe(9);
  expect(s4.unlockedPermissions).toContain('multi_causal');
  return s4;
}

describe('M2 修仙百艺联动、规则赐予、隐藏奖励、多人因果与 v1->v2 存档升级', () => {
  it('同一种潮纹玉因手法不同产剑或产炉胆，并与灵兽带露玉髓花合炼出二阶极品护脉丹', () => {
    const { state: s0, discipleId } = recruitDualDisciple(20261123);
    const startJade = s0.inventory.materials?.mat_chaowen_jade ?? 0;

    // 路A：以「接锋蓄水纹」消耗 1 潮纹玉锻出「储水回锋剑」，自动交由同门佩戴
    const afterSword = advance(s0, s0.tick + 6, [
      {
        commandId: 'forge-sword-1',
        type: 'mission.issue',
        recipientId: discipleId,
        targetType: 'craft_forging_sword',
      },
    ]).state;
    expect(afterSword.inventory.materials?.mat_chaowen_jade).toBe(startJade - 1);
    const equippedPeer = afterSword.members.find((m) => m.equippedWeapon?.specialTrait === 'water_tide');
    expect(equippedPeer).toBeTruthy();

    // 路B：再消耗 1 潮纹玉改走「温炉控潮纹」锻成「潮纹温脉炉胆」，嵌装凡炉
    const afterCore = advance(afterSword, afterSword.tick + 6, [
      {
        commandId: 'forge-core-1',
        type: 'mission.issue',
        recipientId: discipleId,
        targetType: 'craft_forging_core',
      },
    ]).state;
    expect(afterCore.inventory.furnaceHasWarmCore).toBe(true);
    expect(afterCore.inventory.materials?.mat_chaowen_jade).toBe(startJade - 2);

    // 路C：同门携带所锻「储水回锋剑」登台赢下切磋，剑格蓄潮破防写入战报
    const swordBearer = afterCore.members.find((m) => m.equippedWeapon?.specialTrait === 'water_tide')!;
    const targetForBearer = swordBearer.hasWonFirstArena ? 'followup_arena_rematch' : 'first_arena_win';
    const afterDuel = advance(afterCore, afterCore.tick + 6, [
      {
        commandId: 'peer-duel-tide',
        type: 'mission.issue',
        recipientId: swordBearer.id,
        targetType: targetForBearer,
      },
    ]).state;
    const tideBattle = Object.values(afterDuel.battleFacts).find(
      (bf) => bf.actorIds.includes(swordBearer.id) && bf.detailedReport.includes('蓄潮'),
    );
    expect(tideBattle).toBeTruthy();

    // 路D：凭已嵌装的「潮纹温脉炉胆」+ 灵兽衔回的「带露玉髓花」，长老开二阶炉炼出「二阶极品护脉丹」
    const elder = afterDuel.members.find((m) => m.id === 'member_alchemy_elder')!;
    const alcRes = runAlchemyAttempt(afterDuel, elder, 'recipe_humai', { useFenhuoMethod: true });
    expect(alcRes?.success).toBe(true);
    expect(alcRes?.producedPillId).toBe('pill_humai_2_supreme');
    expect(afterDuel.inventory.pills.pill_humai_2_supreme).toBeGreaterThanOrEqual(1);
    expect(alcRes?.alchemyFact.detailedReport).toContain('潮纹温脉炉胆');
  });

  it('v1 旧存档通过原校验和后无损升级为 Schema v2', async () => {
    const db = new SectDatabase(`test-m2-migrate-${Date.now()}`);
    const repo = new SaveRepository(db);

    const v2Fresh = createInitialWorld(20261123);
    // 构造剥离全部 M2 字段的原版 Schema v1 快照与校验和
    const v1Snapshot = cloneState(v2Fresh) as unknown as Record<string, unknown>;
    v1Snapshot.schemaVersion = 1;
    v1Snapshot.rulesVersion = 'm1-rules-1.0.0';
    v1Snapshot.contentVersion = 'm1-content-1.0.0';
    delete v1Snapshot.forgingFacts;
    delete v1Snapshot.beastFacts;
    delete v1Snapshot.spiritBeasts;
    delete v1Snapshot.tournaments;
    const inv = v1Snapshot.inventory as Record<string, unknown>;
    delete inv.materials;
    delete inv.furnaceHasWarmCore;
    for (const m of v1Snapshot.members as Array<Record<string, unknown>>) {
      delete m.grantedAbilities;
      delete m.bondedBeastId;
    }

    const clockAnchor = createClockAnchor(1_700_000_000_000, 3);
    const v1Core = {
      saveId: 'legacy-v1-export',
      schemaVersion: 1,
      rulesVersion: 'm1-rules-1.0.0',
      contentVersion: 'm1-content-1.0.0',
      rngVersion: v2Fresh.rngVersion,
      revision: 4,
      clockAnchor,
      seed: 20261123,
      snapshot: v1Snapshot as unknown as WorldState,
    };
    const v1Envelope: SaveEnvelope = {
      ...v1Core,
      writerEpoch: 1,
      checksum: computeSaveChecksum(v1Core),
    };

    const imported = await repo.importEnvelope(v1Envelope, 'slot-migrated');
    expect(imported.schemaVersion).toBe(2);
    expect(imported.snapshot.schemaVersion).toBe(2);
    expect(imported.snapshot.inventory.materials?.mat_chaowen_jade).toBe(3);
    expect(imported.snapshot.spiritBeasts?.length).toBeGreaterThanOrEqual(2);
    expect(imported.snapshot.forgingFacts).toEqual({});
    expect(imported.snapshot.tournaments).toEqual([]);
    expect(imported.snapshot.members.every((m) => Array.isArray(m.grantedAbilities))).toBe(true);
    await db.delete();
  });

  it('权限爬升 (2->5->9)、规则赐予神通与预先封定隐藏奖励（触发/到期退款/不重领）成立', () => {
    const { state: s0, discipleId } = recruitDualDisciple(20261123);
    const progressed = advanceThroughM2Heritages(s0, discipleId);

    // 1. 在第 2 步「锻铸蓄水剑」上封定的隐藏机缘：大师兄（已自动领佩储水回锋剑）赴擂获胜即触发一次
    const swordMission = progressed.missions.find((m) => m.targetType === 'craft_forging_sword')!;
    expect(swordMission.primarySettled).toBe(true);
    expect(swordMission.hiddenReward).toBeTruthy();
    expect(swordMission.hiddenSettled).toBe(false);
    expect(progressed.daoyuanReserved).toBe(4);

    const swordBearer = progressed.members.find((m) => m.equippedWeapon?.specialTrait === 'water_tide')!;
    const afterTrigger = advance(progressed, progressed.tick + 6, [
      {
        commandId: 'trigger-hidden-duel',
        type: 'mission.issue',
        recipientId: swordBearer.id,
        targetType: swordBearer.hasWonFirstArena ? 'followup_arena_rematch' : 'first_arena_win',
      },
    ]).state;
    expect(afterTrigger.missions.find((m) => m.id === swordMission.id)?.hiddenSettled).toBe(true);
    // 并验证炼丹路径预封的「丹成渡人」隐藏机缘同样在同门服丹时仅兑现一笔
    const branchAlcHidden = advance(s0, s0.tick + 6, [
      {
        commandId: 'alc-with-hidden',
        type: 'mission.issue',
        recipientId: discipleId,
        targetType: 'first_alchemy',
        includeHiddenReward: true,
      },
    ]).state;
    const alcM = branchAlcHidden.missions.find((m) => m.commandId === 'alc-with-hidden')!;
    expect(alcM.primarySettled).toBe(true);
    expect(alcM.hiddenSettled).toBe(false);
    const cultBeforeHidden = branchAlcHidden.members.find((m) => m.id === discipleId)!.cultivation;

    const afterConsume = advance(branchAlcHidden, branchAlcHidden.tick, [
      {
        commandId: 'peer-consume-1',
        type: 'member.consume_pill',
        memberId: 'member_senior_disciple',
        pillTemplateId: 'pill_ningling_1_low',
      },
    ]).state;
    const alcMAfter = afterConsume.missions.find((m) => m.id === alcM.id)!;
    expect(alcMAfter.hiddenSettled).toBe(true);
    expect(afterConsume.daoyuanReserved).toBe(0);
    expect(afterConsume.members.find((m) => m.id === discipleId)!.cultivation).toBeGreaterThan(cultBeforeHidden);

    // 超过 24 刻未触发的隐藏机缘必须释出 4 道源预留
    const daoyuanBeforeExpire = branchAlcHidden.daoyuanAvailable;
    const expiredHidden = advance(branchAlcHidden, branchAlcHidden.tick + 26, []).state;
    const expM = expiredHidden.missions.find((m) => m.id === alcM.id)!;
    expect(expM.hiddenReleased).toBe(true);
    expect(expM.hiddenSettled).toBe(false);
    expect(expiredHidden.daoyuanReserved).toBe(0);
    expect(expiredHidden.daoyuanAvailable).toBe(daoyuanBeforeExpire + 4);

    // 2. 5 点根基「规则赐予」直接赐予永久神通「留一息火」与「灵犀血脉觉醒」并兑现真实效用
    const daoyuanBeforeGrant = progressed.daoyuanAvailable;
    const granted = advance(progressed, progressed.tick, [
      {
        commandId: 'grant-fire-1',
        type: 'system.grant_ability',
        recipientId: discipleId,
        abilityId: 'ability_keep_fire',
      },
      {
        commandId: 'grant-fire-1',
        type: 'system.grant_ability',
        recipientId: discipleId,
        abilityId: 'ability_keep_fire',
      },
      {
        commandId: 'grant-beast-1',
        type: 'system.grant_ability',
        recipientId: discipleId,
        abilityId: 'ability_beast_awakening',
      },
    ]).state;
    expect(granted.daoyuanAvailable).toBe(daoyuanBeforeGrant - 20); // 10 + 10 (重复 commandId 只扣一次)
    expect(granted.members.find((m) => m.id === discipleId)?.grantedAbilities).toEqual([
      'ability_keep_fire',
      'ability_beast_awakening',
    ]);
    expect(granted.spiritBeasts?.some((b) => b.awakened)).toBe(true);

    // 血脉觉醒后探泉双倍收获
    const jadeBeforeBeast = granted.inventory.materials?.mat_chaowen_jade ?? 0;
    const afterAwakenedBeast = advance(granted, granted.tick + 6, [
      { commandId: 'awakened-beast-run', type: 'mission.issue', recipientId: discipleId, targetType: 'craft_beast_gather' },
    ]).state;
    expect(afterAwakenedBeast.inventory.materials?.mat_chaowen_jade).toBe(jadeBeforeBeast + 2);
  });

  it('9 点根基「多人因果」大比：双分支分别结算、互不泄密、换种差异与离在线分片等价', () => {
    const { state: s0, discipleId } = recruitDualDisciple(20261123);
    const unlockedState = advanceThroughM2Heritages(s0, discipleId);

    // A 支：让弟子甲破关，让更具战力优势且配「绝境爆发」的乙夺魁，长老护擂
    const branchWin = cloneState(unlockedState);
    branchWin.daoyuanAvailable += 30;
    const prepWin = advance(branchWin, branchWin.tick, [
      {
        commandId: 'grant-burst-b',
        type: 'system.grant_ability',
        recipientId: 'member_senior_disciple',
        abilityId: 'ability_desperate_burst',
      },
    ]).state;

    const settledWin = advance(prepWin, prepWin.tick + 6, [
      {
        commandId: 'tourn-case-a',
        type: 'multi_causal.launch_tournament',
        breakthroughHostId: discipleId,
        championHostId: 'member_senior_disciple',
        guardianElderId: 'member_alchemy_elder',
      },
    ]).state;

    const tournA = settledWin.tournaments![0];
    expect(tournA.phase).toBe('settled');
    expect(tournA.breakthroughSucceeded).toBe(true);
    expect(tournA.winnerId).toBe('member_senior_disciple');
    expect(tournA.bothSafe).toBe(true);

    const mBreakA = settledWin.missions.find((m) => m.id === tournA.breakthroughMissionId)!;
    const mChampB = settledWin.missions.find((m) => m.id === tournA.championMissionId)!;
    const mGuard = settledWin.missions.find((m) => m.id === tournA.guardMissionId)!;
    expect(mBreakA.status).toBe('completed');
    expect(mChampB.status).toBe('completed');
    expect(mGuard.status).toBe('completed');

    // 三视角绝对隔离核对：甲乙长老互不见对方私令，公开视角零系统禁用词
    const viewA = projectHostView(settledWin, discipleId)!;
    const viewB = projectHostView(settledWin, 'member_senior_disciple')!;
    const viewElder = projectHostView(settledWin, 'member_alchemy_elder')!;
    const viewPublic = projectPublicView(settledWin);

    expect(viewA.privateMissions.some((m) => m.id === tournA.championMissionId || m.id === tournA.guardMissionId)).toBe(false);
    expect(viewB.privateMissions.some((m) => m.id === tournA.breakthroughMissionId || m.id === tournA.guardMissionId)).toBe(false);
    expect(viewElder.privateMissions.some((m) => m.id === tournA.breakthroughMissionId || m.id === tournA.championMissionId)).toBe(false);

    for (const pf of viewPublic.publicFacts) {
      for (const bad of SYSTEM_FORBIDDEN_PUBLIC_TERMS) {
        expect(pf.summary).not.toContain(bad);
      }
    }

    // B 支：反过来让战力更强的大师兄做甲、弟子做乙 -> 甲破关拿赏且决赛反胜，乙夺魁任务失败退款，甲长老仍已到账
    const branchLoseB = cloneState(unlockedState);
    branchLoseB.daoyuanAvailable += 30;
    const dMember = branchLoseB.members.find((m) => m.id === discipleId)!;
    dMember.cultivation = 60;
    dMember.realmLayer = 1;
    const senior = branchLoseB.members.find((m) => m.id === 'member_senior_disciple')!;
    senior.cultivation = 180;
    senior.realmLayer = 6;
    const settledReverse = advance(branchLoseB, branchLoseB.tick + 6, [
      {
        commandId: 'tourn-case-b',
        type: 'multi_causal.launch_tournament',
        breakthroughHostId: 'member_senior_disciple',
        championHostId: discipleId,
        guardianElderId: 'member_alchemy_elder',
      },
    ]).state;
    const tournB = settledReverse.tournaments![0];
    expect(tournB.breakthroughSucceeded).toBe(true);
    expect(tournB.winnerId).toBe('member_senior_disciple');
    expect(settledReverse.missions.find((m) => m.id === tournB.breakthroughMissionId)?.status).toBe('completed');
    expect(settledReverse.missions.find((m) => m.id === tournB.championMissionId)?.status).toBe('failed');
    expect(settledReverse.missions.find((m) => m.id === tournB.guardMissionId)?.status).toBe('completed');

    // 换种子差异检查 + 离在线分片一致性哈希检查
    const seed2 = recruitDualDisciple(88888888);
    expect(seed2.state.sectName).not.toBe('');
    expect(seed2.state.members[0].name).not.toBe(unlockedState.members[0].name);

    const endTick = prepWin.tick + 8;
    const cmdTourn = {
      commandId: 'tourn-hash-eq',
      type: 'multi_causal.launch_tournament' as const,
      breakthroughHostId: discipleId,
      championHostId: 'member_senior_disciple',
      guardianElderId: 'member_alchemy_elder',
    };
    const oneShot = advance(cloneState(prepWin), endTick, [cmdTourn]).state;
    let chunked = advance(cloneState(prepWin), prepWin.tick + 1, [cmdTourn]).state;
    chunked = advance(chunked, prepWin.tick + 3, []).state;
    chunked = advance(chunked, endTick, []).state;
    expect(hashCanonical(chunked)).toBe(hashCanonical(oneShot));
  });
});
