const stopHeatcorridor = Object.freeze({
  stopId: "stop_heatcorridor",
  name: "热廊站",
  mapId: "heatcorridor_bus_stop",
  lineIds: Object.freeze(["west2_shuttle_line_01"]),
  lineOrder: Object.freeze({
    west2_shuttle_line_01: 1
  }),
  isTerminal: false,
  directionMask: Object.freeze([-1, 1]),
  uiMeta: Object.freeze({
    title: "热廊站",
    subtitle: "热廊服务带",
    regionTag: "WEST2",
    environmentText: "棚顶压得更低，门帘一开一合，会带出一点潮热和烘干后的布料味。挡风板旁只留一截窄候车带，脚边积着被雪水反复踩开的暗痕。",
    unimplementedNotice: "门帘内侧的人影和湿布味一阵阵压到站牌边，挡风板下那截候车带一直带着半干的水痕。"
  })
});

export default stopHeatcorridor;