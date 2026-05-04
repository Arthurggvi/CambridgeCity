const stopSteelcrossPort = Object.freeze({
  stopId: "stop_steelcross_port",
  name: "钢十字港口站",
  mapId: "steelcross_port",
  lineIds: Object.freeze(["west2_shuttle_line_01"]),
  lineOrder: Object.freeze({
    west2_shuttle_line_01: 3
  }),
  isTerminal: false,
  directionMask: Object.freeze([-1, 1]),
  uiMeta: Object.freeze({
    title: "钢十字港口站",
    subtitle: "港区外沿泊位",
    regionTag: "WEST2",
    environmentText: "吊臂和堆架顺着灰冷的岸线往后压开，潮湿的铁味混着机油和旧盐斑留在风里。站点只占一小截硬地，门灯一亮，港区轮廓就从雾里浮出来。"
  })
});

export default stopSteelcrossPort;