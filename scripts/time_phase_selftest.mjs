import {
  GetTimePhase,
  GetDayNightPhase,
  GetTimePhaseLabel,
  GetDayNightLabel,
  GetNextPhaseChangeMinute,
  GetNextDayNightChangeMinute
} from "../src/engine/time_phases.js";

function assertEqual(name, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${name} FAILED: expected ${expected}, got ${actual}`);
  }
}

function labelAt(minuteOfDay) {
  const phase = GetTimePhase(minuteOfDay);
  const dn = GetDayNightPhase(minuteOfDay);
  return {
    phase: GetTimePhaseLabel(phase),
    dn: GetDayNightLabel(dn)
  };
}

function run() {
  const cases = [
    { m: 359, phase: "凌晨", dn: "夜晚" },
    { m: 360, phase: "上午", dn: "白天" },
    { m: 659, phase: "上午", dn: "白天" },
    { m: 660, phase: "正午", dn: "白天" },
    { m: 1079, phase: "下午", dn: "白天" },
    { m: 1080, phase: "傍晚", dn: "夜晚" },
    { m: 1260, phase: "午夜", dn: "夜晚" },
    { m: 0, phase: "凌晨", dn: "夜晚" }
  ];

  for (const c of cases) {
    const got = labelAt(c.m);
    assertEqual(`minute ${c.m} phase`, got.phase, c.phase);
    assertEqual(`minute ${c.m} dayNight`, got.dn, c.dn);
  }

  // quick sanity for next-change helpers
  assertEqual("NextPhaseChange @ 05:59", GetNextPhaseChangeMinute(359), 360);
  assertEqual("NextDayNightChange @ 05:59", GetNextDayNightChangeMinute(359), 360);
  assertEqual("NextPhaseChange @ 23:59", GetNextPhaseChangeMinute(1439), 1440);
  assertEqual("NextDayNightChange @ 23:59", GetNextDayNightChangeMinute(1439), 1440);

  console.log("time_phase_selftest: ALL PASSED");
}

run();
