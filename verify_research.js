const fs = require("fs");
const map = JSON.parse(fs.readFileSync("data/maps/west2_outpost_research_station.json", "utf8"));

console.log("1) Lobby Interactions:");
const lobby = map.layers.objects.find(o => o.id === "lobby");
lobby.payload.interactions.forEach(i => {
    console.log("- ID: " + i.id + ", Text: " + i.text + ", Type: " + i.type + ", Requires: " + (i.conditions ? JSON.stringify(i.conditions) : "None"));
});

console.log("\n2) Locked Entries Edge Destinations:");
const lockedIds = ["go_to_research_experiment_room", "go_to_research_sample_storage", "go_upstairs"];
lockedIds.forEach(id => {
    const interaction = lobby.payload.interactions.find(i => i.id === id);
    console.log("- " + id + " -> " + (interaction.toMapId || "None"));
});

console.log("\n3) Authorized Twins Targets:");
const twins = ["go_to_research_experiment_room_authorized", "go_to_research_sample_storage_authorized", "go_upstairs_authorized"];
twins.forEach(id => {
    const interaction = lobby.payload.interactions.find(i => i.id === id);
    const target = interaction.toMapId;
    const exists = target && fs.existsSync("data/maps/" + target + ".json");
    console.log("- " + id + " points to " + target + " (Exists: " + exists + ")");
});

console.log("\n4 & 5) Access Denied Verification:");
const sceneMapId = "west2_outpost_research_access_denied";
const scenePath = "data/maps/" + sceneMapId + ".json";
if (fs.existsSync(scenePath)) {
    const scene = JSON.parse(fs.readFileSync(scenePath, "utf8"));
    const returnObj = scene.layers.objects.find(o => o.id === "return");
    const returnAction = returnObj && returnObj.payload && returnObj.payload.interactions && returnObj.payload.interactions[0] ? returnObj.payload.interactions[0].toMapId : "Not Found";
    console.log("- Access Denied Scene: " + sceneMapId + ", Return Action Target: " + returnAction);
} else {
    console.log("- Scene " + sceneMapId + " not found.");
}

const targets = {
    go_to_research_experiment_room: "west2_outpost_research_experiment_room",
    go_to_research_sample_storage: "west2_outpost_research_sample_storage",
    go_upstairs: "west2_outpost_research_upper_floor"
};

lockedIds.forEach(id => {
    const interaction = lobby.payload.interactions.find(i => i.id === id);
    const router = interaction ? interaction.toMapId : null;
    const isCorrect = router === sceneMapId;
    console.log("- " + id + " routes to " + router + " (Correct: " + isCorrect + ", Avoids " + targets[id] + ": " + (router !== targets[id]) + ")");
});
