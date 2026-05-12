// Area-level runtime prose (fallback terrain + time + distant view).

export const AREA_RUNTIME_TEXT = Object.freeze({
  west2_old_marker_patrol_line: Object.freeze({
    fallbackTerrainText: "旧标记杆巡查线：前哨外的雪面被压实，杆列向风雪深处退去。",
    timeText: Object.freeze({
      morning: "上午的光线低而白，雪粒在脚边细碎地跳动。",
      noon: "正午的雪面反射出刺眼的白，连阴影都被压得很浅。",
      afternoon: "下午的光开始发冷，杆列和雪脊在地面拖出淡灰的影子。",
      evening: "傍晚的天色沉下来，远近的白色开始混成一片。",
      midnight: "午夜的雪面失去层次，只剩风声贴着地表滑过去。",
      dawn: "黎明前的蓝光压在雪上，标记杆像一排冻住的黑线。"
    }),
    distantView: Object.freeze({
      clear: " 远处前哨的轮廓贴在地平线上，像一条淡灰的折线。",
      low: " 远处轮廓发虚，像被风抹淡了一层。",
      whiteout: ""
    })
  })
});
