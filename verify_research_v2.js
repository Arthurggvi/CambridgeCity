const fs = require("fs");
const map = JSON.parse(fs.readFileSync("data/maps/west2_outpost_research_station.json", "utf8"));

console.log("1) Lobby Interactions (Order by Appearance):");
const lobbyInters = map.interactions.filter(i => i.sceneId === "west2_outpost_research_lobby");
lobbyInters.forEach(i => {
    console.log("- ID: " + i.id + ", Text: " + i.text + ", Type: " + i.type + ", Requires: " + (i.requires ? JSON.stringify(i.requires) : "None"));
});

console.log("\n2) Locked Entries Edge Destinations:");
const lockedIds = ["go_to_research_experiment_room", "go_to_research_sample_storage", "go_upstairs"];
lockedIds.forEach(id => {
    const inter = map.interactions.find(i => i.id === id);
    if (inter) {
        const edge = map.edges.find(e => e.id === inter.edgeId);
        console.log("- " + id + " uses edge " + inter.edgeId + " -> toMapId: " + (edge ? edge.toMapId : "None") + ", toSceneId: " + (edge ? edge.toSceneId : "None"));
    }
});

console.log("\n3) Authorized Twins Targets:");
const twins = ["enter_research_experiment_room_authorized", "enter_research_sample_storage_authorized", "enter_research_upstairs_authorized"];
twins.forEach(id => {
    const inter = map.interactions.find(i => i.id === id);
    if (inter) {
        const edge = map.edges.find(e => e.id === inter.edgeId);
        const target = edge ? edge.toMapId : null;
        const exists = target && fs.existsSync("data/maps/" + target + ".json");
        console.log("- " + id + " points to " + target + " (Exists: " + exists + ")");
    }
});

console.log("\n4 & 5) Access Denied Verification:");
const sceneMapId = "west2_outpost_research_access_denied";
const returnInter = map.interactions.find(i => i.sceneId === sceneMapId && i.id.startsWith("return"));
console.log("- Access Denied Scene ID: " + sceneMapId);
console.log("- Return Action ID: " + (returnInter ? returnInter.id : "None"));
if (returnInter) {
    const edge = map.edges.find(e => e.id === returnInter.edgeId);
    console.log("- Return Action Target (Scene): " + (edge ? edge.toSceneId : "None"));
}

const expectedTargets = {
    go_to_research_experiment_room: "west2_outpost_research_experiment_room",
    go_to_research_sample_storage: "west2_outpost_research_sample_storage",
    go_upstairs: "west2_outpost_research_upper_floor"
};

lockedIds.forEach(id => {
    const inter = map.interactions.find(i => i.id === id);
    const edge = map.edges.find(e => e.id === inter.edgeId);
    const destination = edge ? edge.toSceneId : null;
    const isCorrect = destination === sceneMapId;
    console.log("- " + id + " routes to " + destination + " (Correct: " + isCorrect + ", Avoids " + expectedTargets[id] + ": " + (destination !== expectedTargets[id]) + ")");
});
