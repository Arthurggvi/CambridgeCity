const INQUIRY_DEFINITIONS = Object.freeze([
  {
    inquiryId: "warehouse_entry_boundary_inquiry",
    displayName: "仓储区边界说明",
    sourceMapId: "industrial_warehouse_gate",
    sourceActionId: "warehouse_ask_entry",
    textPack: {
      firstRun: {
        main: "靠门的人没让开，只朝里侧抬了抬下巴。\n\n\"没派工单别往里走。前场能接的活都在分流口板子上，今天放出来的也就那几样。\"",
        options: [
          { id: "ack", label: "明白了" },
          { id: "ask_more", label: "那我现在能做什么？" },
          { id: "cancel", label: "算了" }
        ],
        replyMap: {
          ask_more: "板子上写着能接的，就去分流口领。没写的，这会儿就不收。"
        }
      },
      repeatRun: {
        main: "没派工单别进。能接什么，回分流口看板。",
        options: [
          { id: "ack", label: "明白了" },
          { id: "cancel", label: "算了" }
        ],
        replyMap: {}
      }
    },
    futureStatDeltas: {},
    presentationTone: "inquiry_boundary_warehouse"
  },
  {
    inquiryId: "maintenance_entry_help_inquiry",
    displayName: "维修线入口说明",
    sourceMapId: "industrial_maintenance_gate",
    sourceActionId: "maintenance_ask_entry_help",
    textPack: {
      firstRun: {
        main: "门口的人看了你一眼，没接你往里探的意思。\n\n\"这边不在门口招人。维修线不收临工，有活也不是在这儿领。别堵门，要找活回分流口看板。\"",
        options: [
          { id: "ack", label: "明白了" },
          { id: "ask_more", label: "维修这边为什么不收？" },
          { id: "cancel", label: "算了" }
        ],
        replyMap: {
          ask_more: "门里是交接和检修，不是前场派工。要放临工，分流口会先挂出来。"
        }
      },
      repeatRun: {
        main: "维修线不收临工。找活回分流口。",
        options: [
          { id: "ack", label: "明白了" },
          { id: "cancel", label: "算了" }
        ],
        replyMap: {}
      }
    },
    futureStatDeltas: {},
    presentationTone: "inquiry_boundary_maintenance"
  }
]);

const INQUIRY_DEFINITION_BY_ID = new Map(INQUIRY_DEFINITIONS.map((row) => [row.inquiryId, row]));
const INQUIRY_DEFINITION_BY_SOURCE_ACTION = new Map(INQUIRY_DEFINITIONS.map((row) => [row.sourceActionId, row]));

export function getInquiryDefinitionById(inquiryId) {
  return INQUIRY_DEFINITION_BY_ID.get(String(inquiryId || "").trim()) || null;
}

export function getInquiryDefinitionBySourceActionId(actionId) {
  return INQUIRY_DEFINITION_BY_SOURCE_ACTION.get(String(actionId || "").trim()) || null;
}

export function isInquirySourceAction(actionId) {
  return !!getInquiryDefinitionBySourceActionId(actionId);
}
