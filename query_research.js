const fs = require("fs");
const data = JSON.parse(fs.readFileSync("data/maps/west2_outpost_research_station.json", "utf8"));
console.log("Map ID: " + data.id);
const targetTexts = ["接待前台", "仪器维护窗口", "综合实验间", "样品暂存区", "上楼", "返回前哨导航"];
const lobbyInters = data.interactions.filter(i => i.sceneId === "west2_outpost_research_lobby");

targetTexts.forEach(text => {
    const inter = lobbyInters.find(i => i.text === text);
    if (inter) {
        console.log(`Action: ${text} | ID: ${inter.id}`);
    }
});

const specific = [
    { text: "综合实验间", auth: "enter_research_experiment_room_authorized" },
    { text: "样品暂存区", auth: "enter_research_sample_storage_authorized" },
    { text: "上楼", auth: "enter_research_upstairs_authorized" }
];

specific.forEach(s => {
    const inter = lobbyInters.find(i => i.text === s.text);
    if (inter) {
        const edge = data.edges.find(e => e.id === inter.edgeId);
        console.log(`${s.text}: VisibleID: ${inter.id}, AuthTwinID: ${s.auth}, DenyDest: ${edge ? edge.toSceneId : "N/A"}`);
    }
});
