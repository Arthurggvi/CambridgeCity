import { createDefaultPlayerState, applyTimeToPlayer } from "./src/engine/player.js";

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function makePlayer({ physiqueLevel = 0, physiqueXp = 0, experienceLevel = 0, experienceXp = 0, worldviewAxis = 0 } = {}) {
  const p = createDefaultPlayerState();
  p.profile.physique.level = physiqueLevel;
  p.profile.physique.xp = physiqueXp;
  p.profile.experience.level = experienceLevel;
  p.profile.experience.xp = experienceXp;
  p.profile.worldview.axis = worldviewAxis;
  return p;
}

function runCase(player, minutes = 60) {
  const before = deepClone(player);
  const result = applyTimeToPlayer(player, minutes, {
    isSleeping: false,
    sessionCoverage: "NONE"
  });
  const after = deepClone(player);
  return {
    before: {
      stamina: before.physio.stamina,
      satiety: before.physio.satiety,
      temp: before.physio.temperatureC,
      hp: before.psycho.hp
    },
    after: {
      stamina: after.physio.stamina,
      satiety: after.physio.satiety,
      temp: after.physio.temperatureC,
      hp: after.psycho.hp
    },
    delta: {
      stamina: +(after.physio.stamina - before.physio.stamina).toFixed(3),
      satiety: +(after.physio.satiety - before.physio.satiety).toFixed(3),
      temp: +(after.physio.temperatureC - before.physio.temperatureC).toFixed(3),
      hp: +(after.psycho.hp - before.psycho.hp).toFixed(3)
    },
    events: result.events
  };
}

const physique0 = makePlayer({ physiqueLevel: 0, physiqueXp: 0, worldviewAxis: 0 });
const physique5 = makePlayer({ physiqueLevel: 5, physiqueXp: 0, worldviewAxis: 0 });

const worldviewPos = makePlayer({ physiqueLevel: 0, physiqueXp: 0, worldviewAxis: 100 });
const worldviewNeg = makePlayer({ physiqueLevel: 0, physiqueXp: 0, worldviewAxis: -100 });

const output = {
  minutes: 60,
  physique_compare: {
    physique_0: runCase(physique0, 60),
    physique_5: runCase(physique5, 60)
  },
  worldview_compare: {
    axis_pos_100: runCase(worldviewPos, 60),
    axis_neg_100: runCase(worldviewNeg, 60)
  }
};

console.log(JSON.stringify(output, null, 2));
