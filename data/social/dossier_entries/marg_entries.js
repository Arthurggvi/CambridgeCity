export const margDossierEntries = Object.freeze([
  Object.freeze({
    id: "npc_marg_first_meet_001",
    npcId: "npc_marg",
    order: 10,
    category: "first_meet",
    title: "初见",
    body: "她个子很矮，卷发，说话时总带着一种过分认真的停顿，像是先把句子在心里整理好，才肯递到别人面前。",
    unlockPolicy: Object.freeze({
      mode: "manual_seed"
    }),
    tags: Object.freeze(["first_meet", "marg", "library"])
  }),
  Object.freeze({
    id: "npc_marg_favor_010_001",
    npcId: "npc_marg",
    order: 20,
    category: "relationship",
    title: "借阅台的熟面孔",
    body: "她已经不再把你当成普通过客。只要你走到借阅台前，她往往会先把手边的登记册合上，再抬头等你开口。",
    unlockPolicy: Object.freeze({
      mode: "favor_gte",
      favorGte: 10
    }),
    tags: Object.freeze(["relationship", "marg", "library", "favor_10"])
  })
]);