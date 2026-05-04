import west2ShuttleLine01 from "./lines/west2_shuttle_line_01.js";
import stopHeatcorridor from "./stops/stop_heatcorridor.js";
import stopIndustrial from "./stops/stop_industrial.js";
import stopOutpost from "./stops/stop_outpost.js";
import stopSteelcrossPort from "./stops/stop_steelcross_port.js";
import stopWinddyke from "./stops/stop_winddyke.js";

export const transitStops = Object.freeze([
  stopWinddyke,
  stopHeatcorridor,
  stopIndustrial,
  stopSteelcrossPort,
  stopOutpost
]);

export const transitLines = Object.freeze([
  west2ShuttleLine01
]);

export default Object.freeze({
  stops: transitStops,
  lines: transitLines
});