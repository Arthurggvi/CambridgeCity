import { npcHardDefinition } from "./npc_hard.js";
import { npcLinDefinition } from "./npc_lin.js";
import { npcMargDefinition } from "./npc_marg.js";
import { npcRienDefinition } from "./npc_rien.js";
import { npcEasonDefinition } from "./npc_eason.js";

export const npcDefinitions = Object.freeze([
  npcLinDefinition,
  npcMargDefinition,
  npcHardDefinition,
  npcRienDefinition,
  npcEasonDefinition
]);