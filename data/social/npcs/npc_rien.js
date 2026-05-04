export const npcRienDefinition = Object.freeze({
  id: "npc_rien",
  order: 50,
  profile: Object.freeze({
    displayName: "里恩",
    discoveredUnknownLabel: "一位海事顾问",
    undiscoveredLabel: "???"
  }),
  dossierBlocks: Object.freeze([
    Object.freeze({
      id: "public_role",
      title: "公开身份",
      body: "海事学院教师，兼任官方海事保险顾问，对外发言通常带着制度口径与专业判断。"
    }),
    Object.freeze({
      id: "voyage_history",
      title: "航海经历",
      body: "曾任忒提斯号船长，如今已经不再亲自开船，但明显仍保留着老船长的观察方式。"
    }),
    Object.freeze({
      id: "contact_log",
      title: "接触记录",
      body: "初次接触多半发生在港口问询或海事话题中，往往先以顾问与讲解者的姿态出现。"
    }),
    Object.freeze({
      id: "follow_up_leads",
      title: "后续线索",
      body: "忒提斯号海难、退休原因、对保险制度和学院的真实态度，都是值得继续追的线头。"
    })
  ]),
  defaultEnabled: true
});