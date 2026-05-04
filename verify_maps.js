const fs = require('fs');
const path = require('path');

const mapPaths = [
    "data/maps/west2_outpost_hub.json",
    "data/maps/west2_outpost_transfer_station.json",
    "data/maps/west2_outpost_rescue_station.json",
    "data/maps/west2_outpost_library_center.json",
    "data/maps/west2_outpost_research_station.json",
    "data/maps/west2_outpost_research_experiment_room.json",
    "data/maps/west2_outpost_research_sample_storage.json",
    "data/maps/outpost_bus_stop.json"
];

const results = mapPaths.map(p => {
    if (!fs.existsSync(p)) return null;
    const map = JSON.parse(fs.readFileSync(p, "utf8"));
    const prof = map.placeProfile || {};
    return {
        id: map.id,
        envExp: (map.environment && map.environment.exposureLevel) || 'null',
        profSpace: prof.space || 'null',
        profExp: prof.exposureLevel || 'null'
    };
}).filter(x => x);

console.log("mapId | envExp | profSpace | profExp");
results.forEach(r => console.log(`${r.id} | ${r.envExp} | ${r.profSpace} | ${r.profExp}`));

const rescueSubtree = ["west2_outpost_rescue_station"];
const shelterSubtree = ["west2_outpost_transfer_station", "west2_outpost_library_center", "west2_outpost_research_station", "west2_outpost_research_experiment_room", "west2_outpost_research_sample_storage", "outpost_bus_stop"];

console.log("\nVerification:");
results.forEach(r => {
    let tS, tE;
    if (r.id === "west2_outpost_hub") { tS = "outdoor"; tE = "Open"; }
    else if (rescueSubtree.includes(r.id)) { tS = "indoor"; tE = "SemiSheltered"; }
    else if (shelterSubtree.includes(r.id)) { tS = "indoor"; tE = "Sheltered"; }
    const matches = r.profSpace === tS && r.envExp === tE;
    console.log(`${r.id}: ${matches ? "MATCH" : "MISMATCH"} (Target ${tS}/${tE})`);
});
