const JOB_TEMPLATE_IDS = Object.freeze({
  SINGLE_SHIFT_MANUAL: "single_shift_manual"
});

const JOB_TEMPLATES = Object.freeze({
  [JOB_TEMPLATE_IDS.SINGLE_SHIFT_MANUAL]: Object.freeze({
    id: JOB_TEMPLATE_IDS.SINGLE_SHIFT_MANUAL,
    kind: "single_shift_manual"
  })
});

const JOB_BINDINGS = Object.freeze([
  Object.freeze({ sourceMapId: "industrial_split", sourceActionId: "take_temp_manifest_shift", jobId: "inventory_check_short_job" }),
  Object.freeze({ sourceMapId: "industrial_warehouse_gate", sourceActionId: "warehouse_subsidy_tag_shift", jobId: "relabel_short_job" }),
  Object.freeze({ sourceMapId: "steelcross_port", sourceActionId: "theseus_luggage_shift", jobId: "theseus_luggage_shift" }),
  Object.freeze({ sourceMapId: "steelcross_port_theseus_crew_intro", sourceActionId: "theseus_crew_odd_job_placeholder", jobId: "theseus_luggage_shift" })
]);

const JOB_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "inventory_check_short_job",
    templateId: JOB_TEMPLATE_IDS.SINGLE_SHIFT_MANUAL,
    availabilityPolicyId: "industrial_dispatch_manifest",
    durationMinutes: 90,
    rewardPolicyId: "industrial_manifest_shift_pay",
    outcomePolicyId: "odd_job_baseline",
    presentationId: "inventory_check_short_job",
    settlementActionText: "回窗口交单",
    thermal: Object.freeze({ exposureMultiplier: 0.46, activity: "light_work" })
  }),
  Object.freeze({
    id: "relabel_short_job",
    templateId: JOB_TEMPLATE_IDS.SINGLE_SHIFT_MANUAL,
    availabilityPolicyId: "industrial_dispatch_subsidy_tag",
    durationMinutes: 45,
    rewardPolicyId: "industrial_relabel_shift_pay",
    outcomePolicyId: "odd_job_baseline",
    presentationId: "relabel_short_job",
    settlementActionText: "回窗口交单",
    thermal: Object.freeze({ exposureMultiplier: 0.58, activity: "light_work" })
  }),
  Object.freeze({
    id: "theseus_luggage_shift",
    templateId: JOB_TEMPLATE_IDS.SINGLE_SHIFT_MANUAL,
    availabilityPolicyId: "theseus_window_open",
    durationMinutes: 60,
    rewardPolicyId: "theseus_luggage_shift_pay",
    outcomePolicyId: "odd_job_baseline",
    presentationId: "theseus_luggage_shift",
    settlementActionText: "回港口交单",
    thermal: Object.freeze({ exposureMultiplier: 0.52, activity: "light_work" })
  })
]);

const ZERO_FUTURE_STATS = Object.freeze({
  socialExperience: 0,
  oddJobExperience: 0,
  industrialFamiliarity: 0,
  foremanTrust: 0
});

const JOB_OUTCOME_POLICIES = Object.freeze({
  odd_job_baseline: Object.freeze({
    id: "odd_job_baseline",
    futureStatDeltas: ZERO_FUTURE_STATS,
    bonusRewards: Object.freeze([])
  })
});

const JOB_REWARD_POLICIES = Object.freeze({
  industrial_manifest_shift_pay: Object.freeze({ id: "industrial_manifest_shift_pay", kind: "fixed_money", money: 36 }),
  industrial_relabel_shift_pay: Object.freeze({ id: "industrial_relabel_shift_pay", kind: "fixed_money", money: 28 }),
  theseus_luggage_shift_pay: Object.freeze({ id: "theseus_luggage_shift_pay", kind: "fixed_money", money: 63 })
});

const JOB_PRESENTATION_PAYLOADS = Object.freeze({
  inventory_check_short_job: Object.freeze({
    id: "inventory_check_short_job",
    title: "箱单核对短工",
    tone: "industrial_manifest",
    briefing: Object.freeze({
      leadLabel: "工头交代",
      body: Object.freeze({
        firstRun: "窗口里的人把一叠潮软的纸单推出来，先抬眼看了你一眼。\n\n\"会看编号吧？按箱号一排排核，对错位的贴签当场改，糊掉的编号重新誊写。做完交回来记账。\"",
        repeatRun: "老样子。按箱号核，对不上就改，糊了就重抄。做完交回来。"
      }),
      detail: Object.freeze({
        buttonText: "这活具体怎么做？",
        replyText: "先看箱号，再看贴签和堆位。对不上就改，字看不清就重抄，别留着给下一轮添麻烦。",
        showOnRepeat: false
      }),
      pay: Object.freeze({
        buttonText: "工钱怎么算？",
        replyText: "这一轮按短工记，做完划单入账。",
        showOnRepeat: false
      }),
      accept: Object.freeze({
        firstRun: "听明白了，接",
        repeatRun: "听明白了，接"
      }),
      cancel: Object.freeze({
        firstRun: "算了",
        repeatRun: "算了"
      })
    }),
    executing: Object.freeze({
      leadLabel: "执行段",
      body: Object.freeze([
        "你领到一叠潮软的纸单，跟着编号核对几排箱子。",
        "贴错的签要当场重贴，字迹糊掉的要重新誊写。",
        "纸单受潮发软，手套在风里越戴越硬，翻页和按签都变慢。",
        "你把划满记号的单子整理好，递回签到窗。"
      ])
    }),
    settlement: Object.freeze({
      leadLabel: "回窗结算",
      body: Object.freeze({
        firstRun: "窗口里的人把单子翻了两页，在结算栏划了一笔。\n\n\"行，记上了。下一轮还在板子上看。\"",
        repeatRun: "窗口里的人扫了一眼单子，在结算栏划了一笔。\n\n\"记上了。下一个。\""
      }),
      confirmText: "确认交单"
    })
  }),
  relabel_short_job: Object.freeze({
    id: "relabel_short_job",
    title: "补贴标签短工",
    tone: "industrial_tag",
    briefing: Object.freeze({
      leadLabel: "工头交代",
      body: Object.freeze({
        firstRun: "窗口里的人把一小叠标签和记号笔推过来。\n\n\"按箱号找位置，旧签翘边的撕掉重贴，模糊的重写。别贴歪，别压住原编号。\"",
        repeatRun: "补标签一轮。对号、压边、写清，做完交回来。"
      }),
      detail: Object.freeze({
        buttonText: "这活具体怎么做？",
        replyText: "先对箱号，再对堆位，旧签坏了就换新的。风大时贴慢点，边角压实，别过一会儿又翘起来。",
        showOnRepeat: false
      }),
      pay: Object.freeze({
        buttonText: "工钱怎么算？",
        replyText: "还是短工记账，做完交回来。",
        showOnRepeat: false
      }),
      accept: Object.freeze({
        firstRun: "知道了，接",
        repeatRun: "知道了，接"
      }),
      cancel: Object.freeze({
        firstRun: "算了",
        repeatRun: "算了"
      })
    }),
    executing: Object.freeze({
      leadLabel: "执行段",
      body: Object.freeze([
        "你按箱号一排排找过去，把翘边和错位的贴签重新对准。",
        "胶边冻得发硬，按下去总慢半拍；风从货箱之间穿过，标签边角老想翻起来。",
        "模糊的编号得重新誊写，手套越戴越硬，撕旧签和压新签都不顺手。",
        "你把剩下的标签和记号笔收回去，回到签到窗前。"
      ])
    }),
    settlement: Object.freeze({
      leadLabel: "回窗结算",
      body: Object.freeze({
        firstRun: "窗口里的人看了看你交回的记录和剩余标签，在结算栏划了一笔。\n\n\"行，够了。钱给你记上。\"",
        repeatRun: "窗口里的人扫了眼交回的东西，抬手划单。\n\n\"记上了。\""
      }),
      confirmText: "确认交单"
    })
  }),
  theseus_luggage_shift: Object.freeze({
    id: "theseus_luggage_shift",
    title: "忒修斯号码头杂务",
    tone: "session_job",
    briefing: Object.freeze({
      leadLabel: "临时杂务",
      body: Object.freeze({
        firstRun: "值班的人上下看了你一眼，确认你不像是来添乱的，才朝跳板和候船线那边偏了偏头。\n\n\"今天缺的不是正式船员，是肯出力气的人。帮客人提提行李，顺手把几件挡路的箱包和杂物挪开，来回跑一阵就行。\"\n\n\"活不体面，也不轻松，但不用记名，不碰名单，不碰安检。干满这一轮，现金结。\"",
        repeatRun: "值班的人上下看了你一眼，确认你不像是来添乱的，才朝跳板和候船线那边偏了偏头。\n\n\"今天缺的不是正式船员，是肯出力气的人。帮客人提提行李，顺手把几件挡路的箱包和杂物挪开，来回跑一阵就行。\"\n\n\"活不体面，也不轻松，但不用记名，不碰名单，不碰安检。干满这一轮，现金结。\""
      }),
      detail: Object.freeze({
        buttonText: "具体要干什么？",
        replyText: "\"大件小件都得搭把手。有人提不动的箱子你帮着扛，有人拖不动的包你帮着送。跳板口、候船线、船边临时堆着的东西，看见碍事的就挪开，别堵路。\"\n\n\"说白了，就是一直走、一直搬、一直给人腾地方。没什么花样，就是累。\"",
        showOnRepeat: false
      }),
      pay: Object.freeze({
        buttonText: "钱怎么算？",
        replyText: "\"这一轮按一小时算。干完给你六十八，现结。\"",
        showOnRepeat: false
      }),
      accept: Object.freeze({
        firstRun: "接这轮活",
        repeatRun: "接这轮活"
      }),
      cancel: Object.freeze({
        firstRun: "算了",
        repeatRun: "算了"
      })
    }),
    executing: Object.freeze({
      leadLabel: "开始干活",
      body: Object.freeze([
        "你先替一个抱着两只大包的乘客把行李送到跳板口，转头又去帮人把卡在通道边的硬箱挪开。来回跑了几趟，肩膀和手臂都开始发酸，但码头边这类活本来就没什么好挑的。"
      ])
    }),
    settlement: Object.freeze({
      leadLabel: "回港结算",
      body: Object.freeze({
        firstRun: "你把最后一件碍事的箱包挪到边上，回来报数。值班的人扫了你一眼，又看了看已经腾开的通道。\n\n\"行，够了。今天这轮算你一份。\"",
        repeatRun: "你把最后一件碍事的箱包挪到边上，回来报数。值班的人扫了你一眼，又看了看已经腾开的通道。\n\n\"行，够了。今天这轮算你一份。\""
      }),
      confirmText: "确认领钱"
    })
  })
});

const JOB_DEFINITION_BY_ID = new Map(JOB_DEFINITIONS.map((row) => [row.id, row]));
const JOB_BINDING_BY_JOB_ID = new Map(JOB_BINDINGS.map((row) => [row.jobId, row]));

function normalizeId(value) {
  return String(value || "").trim();
}

function toMoneyValue(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
}

function cloneBonusRewards(rewards) {
  return Array.isArray(rewards) ? rewards.map((row) => ({ ...row })) : [];
}

function cloneFutureStatDeltas(deltas) {
  return deltas && typeof deltas === "object" ? { ...deltas } : {};
}

function getBodyByRun(bodySpec, isFirstRun) {
  if (typeof bodySpec === "string") return bodySpec.trim();
  if (!bodySpec || typeof bodySpec !== "object") return "";
  return String(isFirstRun ? bodySpec.firstRun : bodySpec.repeatRun).trim();
}

function getLabelByRun(labelSpec, isFirstRun) {
  if (typeof labelSpec === "string") return labelSpec.trim();
  if (!labelSpec || typeof labelSpec !== "object") return "";
  return String(isFirstRun ? labelSpec.firstRun : labelSpec.repeatRun).trim();
}

function buildRuntimeJobDefinition(definition) {
  if (!definition) return null;

  const binding = JOB_BINDING_BY_JOB_ID.get(definition.id) || null;
  const template = JOB_TEMPLATES[normalizeId(definition.templateId)] || null;
  const rewardPolicy = JOB_REWARD_POLICIES[normalizeId(definition.rewardPolicyId)] || null;
  const outcomePolicy = JOB_OUTCOME_POLICIES[normalizeId(definition.outcomePolicyId)] || null;
  const presentationPayload = JOB_PRESENTATION_PAYLOADS[normalizeId(definition.presentationId)] || null;
  const rewardMoney = toMoneyValue(rewardPolicy?.money);

  return {
    ...definition,
    jobId: definition.id,
    sourceMapId: normalizeId(binding?.sourceMapId),
    sourceActionId: normalizeId(binding?.sourceActionId),
    displayName: String(presentationPayload?.title || definition.id),
    presentationTone: String(presentationPayload?.tone || "session_job"),
    timeCostMinutes: Math.max(0, Math.floor(Number(definition.durationMinutes) || 0)),
    rewardMoney,
    futureStatDeltas: cloneFutureStatDeltas(outcomePolicy?.futureStatDeltas),
    bonusRewards: cloneBonusRewards(outcomePolicy?.bonusRewards),
    availabilityPolicyKey: normalizeId(definition.availabilityPolicyId),
    template,
    rewardPolicy,
    outcomePolicy,
    presentationPayload
  };
}

export function getJobTemplateById(templateId) {
  return JOB_TEMPLATES[normalizeId(templateId)] || null;
}

export function getJobBindingBySourceActionId(actionId, sourceMapId = "") {
  const normalizedActionId = normalizeId(actionId);
  const normalizedMapId = normalizeId(sourceMapId);
  if (!normalizedActionId) return null;

  const exactMatch = JOB_BINDINGS.find((row) => (
    row.sourceActionId === normalizedActionId
    && (!normalizedMapId || row.sourceMapId === normalizedMapId)
  ));
  if (exactMatch) return exactMatch;

  if (normalizedMapId) return null;
  return JOB_BINDINGS.find((row) => row.sourceActionId === normalizedActionId) || null;
}

export function getJobRewardPolicyById(policyId) {
  return JOB_REWARD_POLICIES[normalizeId(policyId)] || null;
}

export function getJobOutcomePolicyById(policyId) {
  return JOB_OUTCOME_POLICIES[normalizeId(policyId)] || null;
}

export function getJobPresentationPayloadById(presentationId) {
  return JOB_PRESENTATION_PAYLOADS[normalizeId(presentationId)] || null;
}

export function getJobPresentationPayload(jobDefinition) {
  if (jobDefinition?.presentationPayload && typeof jobDefinition.presentationPayload === "object") {
    return jobDefinition.presentationPayload;
  }
  return getJobPresentationPayloadById(jobDefinition?.presentationId);
}

export function getJobRewardSummaryText(jobDefinition) {
  const rewardPolicy = jobDefinition?.rewardPolicy || getJobRewardPolicyById(jobDefinition?.rewardPolicyId);
  const rewardMoney = toMoneyValue(jobDefinition?.resolvedRewardMoney ?? rewardPolicy?.money);
  return rewardMoney > 0 ? `结算：+${rewardMoney}` : "";
}

export function getAllJobDefinitions() {
  return JOB_DEFINITIONS.map((row) => buildRuntimeJobDefinition(row));
}

export function getJobDefinitionById(jobId) {
  const definition = JOB_DEFINITION_BY_ID.get(normalizeId(jobId));
  return buildRuntimeJobDefinition(definition);
}

export function getJobDefinitionBySourceActionId(actionId, sourceMapId = "") {
  const binding = getJobBindingBySourceActionId(actionId, sourceMapId);
  return binding ? getJobDefinitionById(binding.jobId) : null;
}

export function isJobSourceAction(actionId, sourceMapId = "") {
  return !!getJobBindingBySourceActionId(actionId, sourceMapId);
}

export function getJobBriefingContent(jobDefinition, isFirstRun = true) {
  const payload = getJobPresentationPayload(jobDefinition);
  if (!payload?.briefing) return null;
  return {
    title: String(payload.title || jobDefinition?.displayName || "短工会话").trim(),
    tone: String(payload.tone || jobDefinition?.presentationTone || "session_job").trim() || "session_job",
    leadLabel: String(payload.briefing.leadLabel || "工头交代").trim() || "工头交代",
    body: getBodyByRun(payload.briefing.body, isFirstRun),
    detail: payload.briefing.detail || null,
    pay: payload.briefing.pay || null,
    acceptText: getLabelByRun(payload.briefing.accept, isFirstRun),
    cancelText: getLabelByRun(payload.briefing.cancel, isFirstRun)
  };
}

export function getJobExecutionContent(jobDefinition) {
  const payload = getJobPresentationPayload(jobDefinition);
  if (!payload?.executing) return null;
  return {
    title: String(payload.title || jobDefinition?.displayName || "短工会话").trim(),
    tone: String(payload.tone || jobDefinition?.presentationTone || "session_job").trim() || "session_job",
    leadLabel: String(payload.executing.leadLabel || "执行段").trim() || "执行段",
    body: Array.isArray(payload.executing.body)
      ? payload.executing.body.map((row) => String(row || "").trim()).filter(Boolean)
      : []
  };
}

export function getJobSettlementContent(jobDefinition, isFirstRun = true) {
  const payload = getJobPresentationPayload(jobDefinition);
  if (!payload?.settlement) return null;
  return {
    title: String(payload.title || jobDefinition?.displayName || "短工会话").trim(),
    tone: String(payload.tone || jobDefinition?.presentationTone || "session_job").trim() || "session_job",
    leadLabel: String(payload.settlement.leadLabel || "回窗结算").trim() || "回窗结算",
    body: getBodyByRun(payload.settlement.body, isFirstRun),
    confirmText: String(payload.settlement.confirmText || "确认交单").trim() || "确认交单"
  };
}
