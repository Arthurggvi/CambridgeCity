export const npcHardDefinition = Object.freeze({
  id: "npc_hard",
  order: 40,
  profile: Object.freeze({
    displayName: "哈德",
    discoveredUnknownLabel: "一个老渔夫",
    undiscoveredLabel: "???"
  }),
  dossierBlocks: Object.freeze([
    Object.freeze({
      id: "work_and_boat",
      title: "工作与船只",
      body: "他有自己的捕鱼船，直到现在也还是靠船吃饭，日常判断几乎都围着海况和船况转。"
    }),
    Object.freeze({
      id: "behavior_impression",
      title: "行为印象",
      body: "固执、经验主义、说话呛人，对很多规矩不以为然，更信自己在海上积出来的判断。"
    }),
    Object.freeze({
      id: "contact_log",
      title: "接触记录",
      body: "多半发生在港区、摊位、船边或风口处，往往是在忙活间隙才肯多说两句。"
    }),
    Object.freeze({
      id: "follow_up_leads",
      title: "后续线索",
      body: "船况与近海经验、对官方体系的敌意、旧亏损或旧事故，都可能是进一步接近他的入口。"
    })
  ]),
  defaultEnabled: true
});