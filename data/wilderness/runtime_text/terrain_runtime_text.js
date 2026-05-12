// Terrain-level runtime prose (WildernessRuntimeText contract).
// `distantView`: prose for seeing another terrain ahead (directional probe); optional.
// time / visibility / weather variant slots remain empty placeholders unless filled.

export const TERRAIN_RUNTIME_TEXT = Object.freeze({
  subglacial_facility_buried_zone: Object.freeze({
    base: "你站在一片被雪掩埋的设施区，地表只是微微隆起，细看却能发现不自然的直线和塌陷边缘。这里的危险不全来自天气，更多来自那些还没被雪彻底吞没的人造结构。",
    distantView: " 你看见远处雪面隆起几道不自然的直线，像有什么设施还埋在下面。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  flagged_marker_line: Object.freeze({
    base: "你站在标记杆巡查线上，细杆和褪色的标带一根接一根扎进雪里，替人在一片白茫茫中钉出方向。它们看起来单薄，但在这种地方，单薄的参照也好过没有参照。",
    distantView: " 你看见远处有一列细杆扎在雪里，褪色标带在风中断断续续地晃动。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  glacier_surface: Object.freeze({
    base: "你站在冰川表面，脚下的冰雪被缓慢的流动拉出细密的纹路，远看平整，近看却处处带着裂开的征兆。这里像一条冻结的河，只是它的流速慢到足以让人误以为它静止。",
    distantView: " 你看见远处的冰雪表面拉出细密纹路，像一条冻结后仍在缓慢移动的河。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  ice_sheet_plateau: Object.freeze({
    base: "你站在冰盖高原上，四周的白色铺得过于完整，地面起伏被拉平到近乎失去尺度。这里没有多少可供判断的边界，只有厚重冰层向各个方向沉默延展。",
    distantView: " 你看见远处的冰盖铺成一片近乎平整的白，边界被拉得很远。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  ice_shelf_surface: Object.freeze({
    base: "你脚下已不再是普通的雪地，而是一片更平、更冷的冰架表面，青白色的层带在积雪下若隐若现。它看起来开阔干净，每一步却让人意识到自己正站在向海伸出的冰体之上。",
    distantView: " 你看见远处的雪面变得更平更冷，青白色冰层在薄雪下隐约露出。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  ice_shelf_edge: Object.freeze({
    base: "你逼近冰架前缘，深色的裂线和断裂边界在雪下露出不规则的轮廓，像一块巨大的白色板块被从边上撕开。这里已经不适合再用普通地面的逻辑去理解，脚下的安全感到此为止。",
    distantView: " 你看见远处的冰面出现断裂边，白色板块像被从海的一侧撕开。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  ice_cliff_coast: Object.freeze({
    base: "你站在冰崖海岸附近，前方的冰体突然向下断开，暗蓝色的剖面像一堵被寒冷削直的墙。风从断崖方向卷上来，把声音和距离都压得不太真切。",
    distantView: " 你看见远处的白色地面突然断开，暗蓝色冰壁从边缘直落下去。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  tide_crack_zone: Object.freeze({
    base: "你来到潮汐裂缝带，深蓝近黑的裂口横在冰面之间，边缘残留着新雪遮盖过的痕迹。这里最危险的不是裂缝本身，而是它看起来不像裂缝，直到你已站得太近。",
    distantView: " 你看见远处的冰面裂出深蓝近黑的缝，边缘被新雪遮得并不干净。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  open_water: Object.freeze({
    base: "你面前是没有封住的海水，黑蓝色水面在冰岸之间起伏，冷得像一块正在呼吸的金属。这里没有可走的地面，只有风、浪和随时会改变形状的边界。",
    distantView: " 你看见远处出现一片没有封冻的黑蓝水面，冰岸在它旁边显得格外脆。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  wind_packed_snow: Object.freeze({
    base: "你站在一片被风压实的雪面上，脚下的白色颗粒像被反复碾压过，表层微微发亮，边缘却藏着细碎的浮雪。这种地面算不上舒服，但至少比松雪更愿意承托人的重量。",
    distantView: " 你看见远处的雪面被风压成一片发亮的硬白，边缘卷着细碎浮雪。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  dry_valley_rock_desert: Object.freeze({
    base: "你脚下的雪变薄了，露出一片干冷的碎石地，黄灰色的砂砾被风推成浅浅的纹路。这里不像常见的白色荒原，却同样缺少庇护，寒意从石头和空气中一起向上翻涌。",
    distantView: " 你看见远处露出一片干冷的岩漠。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  sea_ice_fast: Object.freeze({
    base: "你站在贴岸的海冰上，冰面比陆地上的雪更平，颜色却透出一种冷硬的青绿。多边形的裂纹在脚下延伸，提醒你这片白色并不属于陆地，只是大海暂时被冻住了。",
    distantView: " 你看见远处的贴岸海冰铺开，青绿色裂纹在白色表面下隐约延伸。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  managed_compacted_route: Object.freeze({
    base: "你站在一段被人反复踩压、清理和修整过的雪道上，脚下的白色表面被压成泛灰的硬层，边缘还能看见铲具和履带留下的旧痕。这不是自然形成的路，而是前哨从荒野中勉强驯服出来的一条线。",
    distantView: " 你看见远处有一条被压实的雪道，泛灰的硬层从白色荒野里延伸出来。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  sea_ice_pressure_ridge: Object.freeze({
    base: "你面前的海冰被挤压成一排排凌乱的脊线，破碎的冰块互相顶托，像凝固的浪从地面翻卷起来。这里很难走，视线也被低矮的冰脊切碎，每一步都要重新判断脚该落在哪里。",
    distantView: " 你看见远处的海冰被挤成凌乱脊线，破碎冰块像凝固的浪一样堆起。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  snow_drift_zone: Object.freeze({
    base: "你站在积雪堆和雪窝之间，松散的白色被风推成不规则的缓坡，表面看似柔软，下面却可能突然塌陷。这里不至于立刻致命，但会一点点偷走人的体力和判断。",
    distantView: " 你看见远处堆起一片不规则的雪坡和雪窝，白色表面显得松散而不稳定。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  coastal_open_water: Object.freeze({
    base: "你靠近一片开阔海面，海水贴着冰岸翻动，黑蓝色的浪把碎冰推来又带走。这里的边界比陆地更不可靠，风一变，水声和冰裂声都会跟着逼近。",
    distantView: " 你看见远处的冰岸断开，黑蓝色海水在白色边缘间翻动。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  blue_ice_area: Object.freeze({
    base: "你站在蓝冰区，脚下的冰面被风剥去积雪，露出深浅不一的蓝色层理。它坚硬、光滑、几乎不留脚印，像一块被寒冷磨亮的旧玻璃。",
    distantView: " 你看见远处露出一片深浅不一的蓝冰，像雪面被风剥开了一层。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  crevasse_field: Object.freeze({
    base: "你面前是一片裂隙区，雪面被拉出细长的暗线，有些裂口被浮雪盖住，只留下轻微下陷的边缘。这里不缺路，缺的是能证明那条路真的能承住你的证据。",
    distantView: " 你看见远处雪面裂出几道暗线，像有什么东西从冰下把地表慢慢拉开。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  rock_outcrop_nunatak: Object.freeze({
    base: "你站在裸露的岩脊旁，褐灰色的石头像从雪和冰里硬挤出来，表面被风打磨得粗糙发干。它是这片天地中少有的稳定参照物，也是一块把风全部接下的硬骨头。",
    distantView: " 你看见远处有几块褐灰色岩石从雪里露出，像白色地面上突起的硬骨。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  polar_plateau_exposed: Object.freeze({
    base: "你站在内陆暴露高原上，雪面被强风刮得低伏而紧绷，空旷感几乎压过了方向感。这里没有明显遮蔽物，风能从很远的地方一路掠过来，直接撞在人身上。",
    distantView: " 你看见远处的高原雪面无遮无拦地展开，风像能从那里一路刮到你身前。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  loose_snowfield: Object.freeze({
    base: "你踏进一片松雪原，脚下的雪层松散而厚，每一步都会陷下去半截，再把冷意从靴边挤上来。这里看起来平静，真正的消耗却藏在每一次拔腿里。",
    distantView: " 你看见远处有一片松软的雪原，表面平静，却显得厚而不实。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  }),

  sastrugi_field: Object.freeze({
    base: "你站在雪垄区，坚硬的风蚀雪脊一排排横在地面上，像被风刻出来的白色肋骨。它们会绊住脚步，也会扭曲距离，让平地走出一种持续对抗的感觉。",
    distantView: " 你看见远处一排排风蚀雪脊横在地面上，像被风刻出的白色肋骨。",
    timeVariants: Object.freeze({}),
    visibilityVariants: Object.freeze({}),
    weatherVariants: Object.freeze({})
  })
});
