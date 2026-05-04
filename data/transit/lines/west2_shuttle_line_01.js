const west2ShuttleLine01 = Object.freeze({
  lineId: "west2_shuttle_line_01",
  name: "西部二区接驳线",
  stopIds: Object.freeze([
    "stop_winddyke",
    "stop_heatcorridor",
    "stop_industrial",
    "stop_steelcross_port",
    "stop_outpost"
  ]),
  segmentMinutes: Object.freeze([2, 2, 2, 2]),
  weatherSegmentMinutes: Object.freeze({
    highwind: Object.freeze([3, 3, 3, 3]),
    snowfall: Object.freeze([3, 3, 3, 3])
  }),
  suspendedWeatherKeys: Object.freeze(["whiteout"]),
  fareCents: Object.freeze({
    board: 0,
    continue: 0,
    getOff: 0
  }),
  bidirectional: true
});

export default west2ShuttleLine01;