const stopOutpost = Object.freeze({
  stopId: "stop_outpost",
  name: "前哨",
  mapId: "outpost_bus_stop",
  lineIds: Object.freeze(["west2_shuttle_line_01"]),
  lineOrder: Object.freeze({
    west2_shuttle_line_01: 4
  }),
  isTerminal: true,
  directionMask: Object.freeze([-1]),
  uiMeta: Object.freeze({
    title: "前哨",
    subtitle: "野外出发前置点",
    regionTag: "WEST2",
    environmentText: "站牌立在外场边线上，脚下那段压实雪面被来回踩得发亮，边上还留着被风重新扫回来的薄雪。立柱背风的一侧挂着旧划痕，低桩外面是一层贴地掠过去的白。"
  })
});

export default stopOutpost;