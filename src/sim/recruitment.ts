import { getRegionById } from '../content/validate';
import { resolveEntityTraits } from './destinyTraits';
import { appendFact, nextEntityId } from './facts';
import type { Candidate, Member, Mission, WorldState } from './types';
import { generateCandidatesForSession } from './worldgen';

function seatSatisfiesRequirement(
  offered: 'outer' | 'alchemy_hall' | 'sword_pavilion',
  required: 'outer' | 'alchemy_hall' | 'sword_pavilion',
): boolean {
  if (required === 'outer') {
    return true;
  }
  return offered === required;
}

function getSeatLabel(seatTier: 'outer' | 'alchemy_hall' | 'sword_pavilion'): string {
  if (seatTier === 'alchemy_hall') return '丹堂师承席';
  if (seatTier === 'sword_pavilion') return '试剑台练剑席';
  return '外门正式席';
}

export function openRecruitmentSession(
  state: WorldState,
  regionId: string,
): { ok: boolean; message: string; factIds: string[] } {
  const region = getRegionById(regionId);
  if (!region) {
    return { ok: false, message: `未知招募地域 ${regionId}`, factIds: [] };
  }
  const nextGen = state.recruitment.generation + 1;
  const sessionId = `recruit_gen_${nextGen}`;
  const veinLevel = state.sectSpiritVeinLevel ?? 1;
  const seatCount = Math.min(4, 2 + Math.max(0, veinLevel - 1));
  const candidates = generateCandidatesForSession(
    state.seed,
    nextGen,
    regionId,
    sessionId,
    state.sectReputation,
    state.members.map((m) => m.name),
    veinLevel,
  );
  state.recruitment = {
    id: sessionId,
    generation: nextGen,
    regionId,
    totalSeats: seatCount,
    remainingSeats: seatCount,
    openedAtTick: state.tick,
    candidates,
  };
  const fact = appendFact(state, {
    type: 'recruitment.session_opened',
    visibility: 'public',
    recipientId: null,
    actorIds: ['member_recruit_elder'],
    publicSummary: `第 ${nextGen} 届招贤启事发往「${region.name}」，宗门预备 ${seatCount} 个正取席位。`,
    privateSummary: null,
    systemSummary: `第 ${nextGen} 届招贤已开启（${region.name}），本批候选名帖 ${candidates.length} 份已生成并锁入当前档。`,
  });
  return { ok: true, message: `已开启第 ${nextGen} 届招贤（${region.name}）。`, factIds: [fact.id] };
}

export function auditionCandidate(
  state: WorldState,
  candidateId: string,
): { ok: boolean; message: string; factIds: string[] } {
  const cand = state.recruitment.candidates.find((c) => c.id === candidateId);
  if (!cand) {
    return { ok: false, message: `本届名帖中未见候选 ${candidateId}`, factIds: [] };
  }
  if (cand.auditioned) {
    return { ok: true, message: `${cand.name} 已经完成试艺，底细如实显露。`, factIds: [] };
  }
  cand.auditioned = true;
  const skillNotes: string[] = [];
  if (cand.hasAlchemyFire) skillNotes.push('已会引火运炉');
  if (cand.hasSwordStance) skillNotes.push('熟演青松剑势');
  if (skillNotes.length === 0) skillNotes.push('暂未定型专艺');

  const fact = appendFact(state, {
    type: 'recruitment.auditioned',
    visibility: 'public',
    recipientId: null,
    actorIds: ['member_recruit_elder'],
    publicSummary: `山门试艺核验了「${cand.name}」既有根底：${cand.spiritRoot.grade}${cand.spiritRoot.elements.join('')}灵根，${skillNotes.join('、')}。`,
    privateSummary: null,
    systemSummary: `试艺揭露「${cand.name}」先天与已有本领（仅显露未改动数值）。未入门前仍只见公开邀帖。`,
  });
  return { ok: true, message: `${cand.name} 试艺完成。`, factIds: [fact.id] };
}

export function createStarterPrivateMission(state: WorldState, member: Member): Mission {
  const missionId = nextEntityId(state, 'mission');
  const perRound = Math.min(member.caveSupplyPerRound, member.meridianCapPerRound, member.manualRatePerRound);
  const rounds = 3;
  const mission: Mission = {
    id: missionId,
    commandId: `auto-induction:${member.id}`,
    targetType: 'daily_cultivate',
    title: '入门固本',
    description: '初入山门，先在分配洞府静心吐纳三轮，稳住气海运转。',
    source: 'auto_daily',
    recipientId: member.id,
    issuedAtTick: state.tick,
    deadlineTick: state.tick + 6,
    status: 'accepted',
    decisionReason: '新入山门即受秘传启蒙，当即欣然照行。',
    primaryReward: {
      slot: 'primary',
      kind: 'cultivation_rounds',
      label: `三轮修为固本（${rounds * perRound} 缕）`,
      rounds,
      daoyuanCost: 0,
    },
    primarySettled: false,
    hiddenSettled: false,
    hiddenReleased: false,
    settledAtTick: null,
    relatedFactIds: [],
  };
  state.missions.push(mission);
  return mission;
}

export function inviteCandidate(
  state: WorldState,
  candidateId: string,
  seatTier: 'outer' | 'alchemy_hall' | 'sword_pavilion',
  commandId: string,
): { ok: boolean; accepted: boolean; message: string; memberId?: string; factIds: string[] } {
  const cand = state.recruitment.candidates.find((c) => c.id === candidateId);
  if (!cand) {
    return { ok: false, accepted: false, message: `未找到候选 ${candidateId}`, factIds: [] };
  }
  if (cand.outcome !== 'pending') {
    return {
      ok: false,
      accepted: cand.outcome === 'accepted',
      message: `${cand.name} 本届去留已定（${cand.outcome === 'accepted' ? '已入宗' : '已谢绝'}）。`,
      memberId: cand.joinedMemberId ?? undefined,
      factIds: [],
    };
  }
  if (state.recruitment.remainingSeats <= 0) {
    return { ok: false, accepted: false, message: '本届招贤正取席位已满。', factIds: [] };
  }

  const offeredLabel = getSeatLabel(seatTier);
  const inviteFact = appendFact(state, {
    type: 'recruitment.invited',
    visibility: 'public',
    recipientId: null,
    actorIds: ['member_recruit_elder'],
    publicSummary: `宗门以「${offeredLabel}」向 ${cand.name} 发出正式入门帖。`,
    privateSummary: null,
    systemSummary: `向未入门候选 ${cand.name} 发出公开邀请（${offeredLabel}）；此时尚未建立任何系统绑定。`,
  });

  if (!seatSatisfiesRequirement(seatTier, cand.requirement.minSeatTier)) {
    cand.outcome = 'declined';
    cand.decisionReason = `来客所求为「${cand.requirement.label}」，宗门只许了「${offeredLabel}」，遂拱手婉拒。`;
    const declineFact = appendFact(state, {
      type: 'recruitment.declined',
      visibility: 'public',
      recipientId: null,
      actorIds: [],
      causeIds: [inviteFact.id],
      publicSummary: `${cand.name} 见所许席位与己愿不合，礼貌谢绝了此次拜师之邀。`,
      privateSummary: null,
      systemSummary: `候选 ${cand.name} 拒绝入门（原因：${cand.decisionReason}），席位未扣减、未建立绑定。`,
    });
    return {
      ok: true,
      accepted: false,
      message: cand.decisionReason,
      factIds: [inviteFact.id, declineFact.id],
    };
  }

  const memberId = nextEntityId(state, 'member');
  const bindingId = nextEntityId(state, 'bind');

  const newMember: Member = {
    id: memberId,
    name: cand.name,
    role: 'disciple',
    status: 'active',
    portraitId: cand.portraitId,
    originRegionId: cand.originRegionId,
    background: cand.background,
    ageYears: cand.ageYears,
    lifespanYears: cand.lifespanYears,
    realm: cand.realm,
    realmLayer: cand.realmLayer,
    cultivation: cand.cultivation,
    cultivationCap: 150,
    foundation: 6,
    caveSupplyPerRound: cand.caveSupplyPerRound,
    meridianCapPerRound: cand.meridianCapPerRound,
    manualRatePerRound: cand.manualRatePerRound,
    hp: 84,
    maxHp: 84,
    qi: 68,
    maxQi: 68,
    pillToxicity: 0,
    spiritRoot: {
      elements: [...cand.spiritRoot.elements],
      grade: cand.spiritRoot.grade,
    },
    aptitude: { ...cand.aptitude },
    personality: cand.personality,
    personalGoal: cand.personalGoal,
    craftRank: { ...cand.craftRank },
    knownMethods: [...cand.knownMethods],
    hasAlchemyFire: cand.hasAlchemyFire,
    hasCompletedFirstAlchemy: false,
    hasWonFirstArena: false,
    unlockedArenaRematch: false,
    equippedWeapon: cand.hasSwordStance
      ? {
          id: nextEntityId(state, 'wpn'),
          templateId: 'weapon_iron_sword',
          name: '随身青铁剑',
          tier: '凡阶',
          quality: '下品',
          iconPath: 'assets/weapons/sword_t01_002.png',
          durability: 30,
          maxDurability: 30,
          attackBonus: 6,
          defenseBonus: 2,
        }
      : undefined,
    pouchPills: {},
    pouchTalismans: 0,
    grantedAbilities: [],
    bondedBeastId: null,
    binding: {
      bound: true,
      bindingId,
      boundAtTick: state.tick,
      secrecyIntact: true,
    },
    currentActivity: null,
    injuries: [],
    notes: [`第 ${state.recruitment.generation} 届以「${offeredLabel}」自愿入门`],
    destinyTraits: cand.destinyTraits ?? resolveEntityTraits(state.seed, cand.id, cand.spiritRoot.grade),
  };

  cand.outcome = 'accepted';
  cand.decisionReason = `应「${offeredLabel}」之约，愿拜入${state.sectName}门下。`;
  cand.joinedMemberId = memberId;
  state.recruitment.remainingSeats -= 1;
  state.members.push(newMember);

  const joinFact = appendFact(state, {
    type: 'member.joined',
    visibility: 'host_private',
    recipientId: memberId,
    actorIds: [memberId],
    causeIds: [inviteFact.id],
    publicSummary: `${newMember.name} 接下「${offeredLabel}」拜帖，行拜师礼正式入宗。`,
    privateSummary: `【叮！系统绑定已成立】${newMember.name}，你已正式入籍${state.sectName}。此声提示仅你本人可见，不可向师长同门泄露半分。`,
    systemSummary: `${newMember.name} 正式入宗，入宗当刻即已建立唯一秘密绑定 (${bindingId})。`,
    cueTier: 'notable',
  });

  // 同时补充一条公开入门纪事，使宗门公开页独立可读而绝不泄露绑定事实
  const publicJoinFact = appendFact(state, {
    type: 'member.joined',
    visibility: 'public',
    recipientId: null,
    actorIds: [memberId],
    causeIds: [inviteFact.id],
    publicSummary: `${newMember.name} 正式拜入${state.sectName}（${offeredLabel}），获分入门洞府与铭牌。`,
    privateSummary: null,
    systemSummary: `公开纪事已登记 ${newMember.name} 入宗礼成。`,
  });

  // 新人一入门即收到只对自己可见的私令
  const starterMission = createStarterPrivateMission(state, newMember);
  const starterFact = appendFact(state, {
    type: 'mission.issued',
    visibility: 'host_private',
    recipientId: memberId,
    actorIds: [memberId],
    missionId: starterMission.id,
    causeIds: [joinFact.id],
    publicSummary: null,
    privateSummary: `【叮！系统发布任务「${starterMission.title}」】${starterMission.description} 奖励：${starterMission.primaryReward.label}。`,
    systemSummary: `新人 ${newMember.name} 入门瞬间已获发首道私密入门令「${starterMission.title}」。`,
    cueTier: 'notable',
  });
  starterMission.relatedFactIds.push(starterFact.id);

  // 触发常开悬赏检查将在 missions/scheduler 挂接后由 hook 处理，或者由 engine 调度
  void commandId;

  return {
    ok: true,
    accepted: true,
    message: `${newMember.name} 已自愿入宗并完成秘密绑定。`,
    memberId,
    factIds: [inviteFact.id, joinFact.id, publicJoinFact.id, starterFact.id],
  };
}

export function autoFillRecruitment(
  state: WorldState,
  commandId: string,
): { ok: boolean; message: string; factIds: string[] } {
  const factIds: string[] = [];
  let filled = 0;

  while (state.recruitment.remainingSeats > 0) {
    const pending = state.recruitment.candidates.filter((c) => c.outcome === 'pending');
    if (pending.length === 0) {
      break;
    }
    pending.sort((a, b) => {
      if (state.sectFocus === 'alchemy') {
        const scoreA = (a.hasAlchemyFire ? 2 : 0) + a.craftRank.alchemy;
        const scoreB = (b.hasAlchemyFire ? 2 : 0) + b.craftRank.alchemy;
        if (scoreA !== scoreB) return scoreB - scoreA;
      } else if (state.sectFocus === 'combat') {
        const scoreA = (a.hasSwordStance ? 2 : 0) + a.aptitude.bone;
        const scoreB = (b.hasSwordStance ? 2 : 0) + b.aptitude.bone;
        if (scoreA !== scoreB) return scoreB - scoreA;
      }
      return a.id.localeCompare(b.id);
    });
    const chosen = pending[0];
    if (!chosen.auditioned) {
      const aud = auditionCandidate(state, chosen.id);
      factIds.push(...aud.factIds);
    }
    const res = inviteCandidate(state, chosen.id, chosen.requirement.minSeatTier, `${commandId}:fill:${chosen.id}`);
    factIds.push(...res.factIds);
    if (res.accepted) {
      filled += 1;
    }
  }

  return {
    ok: true,
    message: filled > 0 ? `招生长老已依宗门所长补齐 ${filled} 名门人。` : '当前已无可补席位或适龄人选。',
    factIds,
  };
}

export function departMember(
  state: WorldState,
  memberId: string,
  reason = '拜别山门下山历练',
): { ok: boolean; message: string; factIds: string[] } {
  const member = state.members.find((m) => m.id === memberId);
  if (!member) {
    return { ok: false, message: `未见门人 ${memberId}`, factIds: [] };
  }
  if (member.role === 'sect_master') {
    return { ok: false, message: '宗主坐镇山门，不可轻言退宗。', factIds: [] };
  }
  if (member.status === 'departed' || member.status === 'dead') {
    return { ok: false, message: `${member.name} 当前已不在籍。`, factIds: [] };
  }
  member.status = 'departed';
  member.currentActivity = null;
  member.notes.push(`第 ${state.tick} 刻正式退宗：${reason}`);

  // 停收新私令；未完私令做失效释出（由调度器/任务层兜底或直接标记）
  const fact = appendFact(state, {
    type: 'member.departed',
    visibility: 'public',
    recipientId: null,
    actorIds: [member.id],
    publicSummary: `${member.name} 向宗主与诸长老行礼拜别，正式退宗离山（${reason}）。`,
    privateSummary: null,
    systemSummary: `${member.name} 已退宗，系统已停止向其发放任何新私令，既有经历与保密规则仍旧生效。`,
  });
  return { ok: true, message: `${member.name} 已正式退宗。`, factIds: [fact.id] };
}

export function rejoinMember(
  state: WorldState,
  memberId: string,
): { ok: boolean; message: string; factIds: string[] } {
  const member = state.members.find((m) => m.id === memberId);
  if (!member) {
    return { ok: false, message: `未见旧人 ${memberId}`, factIds: [] };
  }
  if (member.status !== 'departed') {
    return { ok: false, message: `${member.name} 并非退宗离山之身。`, factIds: [] };
  }
  member.status = 'active';
  member.notes.push(`第 ${state.tick} 刻重入山门，沿用原身份与历练记录`);

  const fact = appendFact(state, {
    type: 'member.rejoined',
    visibility: 'public',
    recipientId: null,
    actorIds: [member.id],
    publicSummary: `${member.name} 重归${state.sectName}山门，续接旧日同门名册。`,
    privateSummary: null,
    systemSummary: `${member.name} 已重入在籍名单（沿用原ID ${member.id} 与原有绑定 ${member.binding.bindingId}）。`,
  });
  return { ok: true, message: `${member.name} 已重归山门。`, factIds: [fact.id] };
}
