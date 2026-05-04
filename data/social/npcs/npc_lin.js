export const npcLinDefinition = Object.freeze({
  id: "npc_lin",
  order: 10,
  profile: Object.freeze({
    displayName: "琳",
    discoveredUnknownLabel: "一位护士",
    undiscoveredLabel: "???"
  }),
  dossierBlocks: Object.freeze([
    Object.freeze({
      id: "work_and_duties",
      title: "工作与职责",
      body: "负责接待、病人分流、单据与流程传递，是诊所前台与病房流程之间的重要中转点。"
    }),
    Object.freeze({
      id: "behavior_impression",
      title: "行为印象",
      body: "说话短，利落，不爱废话；愿意把事做完，但不愿替制度做道德解释。"
    }),
    Object.freeze({
      id: "contact_log",
      title: "接触记录",
      body: "通常从窗口、病房或夜班流程中接触到她，见面场景多与诊所运转节奏直接相关。"
    }),
    Object.freeze({
      id: "follow_up_leads",
      title: "后续线索",
      body: "夜班经验、对诊所制度的看法、私人生活痕迹，都可能在后续接触里逐步显出来。"
    })
  ]),
  defaultEnabled: true
});