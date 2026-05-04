const stopWinddyke = Object.freeze({
  stopId: "stop_winddyke",
  name: "风堤街站",
  mapId: "winddyke_bus_stop",
  lineIds: Object.freeze(["west2_shuttle_line_01"]),
  lineOrder: Object.freeze({
    west2_shuttle_line_01: 0
  }),
  isTerminal: true,
  directionMask: Object.freeze([1]),
  uiMeta: Object.freeze({
    title: "风堤街站",
    subtitle: "风堤街走廊段",
    regionTag: "WEST2",
    environmentText: "站牌钉在背风侧，灯罩里积着一层薄霜。避风棚不大，线路牌贴在棚壁上，远处更亮的那一段走廊伸向暗里。"
  })
});

export default stopWinddyke;