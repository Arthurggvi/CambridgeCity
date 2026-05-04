const stopIndustrial = Object.freeze({
  stopId: "stop_industrial",
  name: "工业区站",
  mapId: "industrial_bus_stop",
  lineIds: Object.freeze(["west2_shuttle_line_01"]),
  lineOrder: Object.freeze({
    west2_shuttle_line_01: 2
  }),
  isTerminal: false,
  directionMask: Object.freeze([-1, 1]),
  uiMeta: Object.freeze({
    title: "工业区站",
    subtitle: "工区分流口",
    regionTag: "WEST2",
    environmentText: "围栏在这里抬高了一截，地上的车辙更深。导向牌只分两边：维修厂，仓储区。白天门禁灯也亮着，没人会在这里久站。"
  })
});

export default stopIndustrial;