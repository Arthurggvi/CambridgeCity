export const WILDERNESS_EVENT_DEFS = Object.freeze({
  west2_surface_debris_glint_001: Object.freeze({
    id: "west2_surface_debris_glint_001",
    title: "雪面反光杂物",
    presentation: Object.freeze({
      body: "前方雪面闪了一下，不像正常反光，更像有什么小东西半埋在雪壳下面。风把表层雪吹得很平，只露出一点灰色边角。它可能只是废片，也可能是某个外勤设备上掉下来的零件。",
      logLine: "你在雪面上发现了一处半埋的反光杂物。"
    }),
    actions: Object.freeze([
      Object.freeze({
        id: "inspect_surface_glint",
        label: "停下检查",
        timeCostMinutes: 6,
        outcomeTable: Object.freeze([
          Object.freeze({
            outcomeId: "inspect_surface_glint_empty",
            weight: 30,
            resultText: "你蹲下扫开那片反光处的浮雪。下面只有一小块冻硬的冰壳，刚才的闪光来自一层薄薄的霜面。它看起来像发现，实际上什么也不是。",
            logLine: "检查了雪面反光处，但没有发现可回收物。",
            resultIntents: Object.freeze([]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "inspect_surface_glint_cable_offcut",
            weight: 28,
            resultText: "你扫开浮雪，摸到一段冻硬的防寒电缆。断口已经发白，内部铜芯却还没完全腐蚀，能带回去交给伊森处理。",
            logLine: "从雪面反光处取回一段短截防寒电缆。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "short_coldproof_cable_offcut",
                qty: 1,
                reason: "west2_surface_debris_glint_001.inspect_surface_glint"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "inspect_surface_glint_battery",
            weight: 30,
            resultText: "你继续清理那块灰色边角，发现它连着一个小型电池包。接口已经结霜，外壳编号还在，应该能作为回收物交给救援站。",
            logLine: "从雪堆中取回一块废弃特种锂电池。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "abandoned_special_lithium_battery",
                qty: 1,
                reason: "west2_surface_debris_glint_001.inspect_surface_glint"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "inspect_surface_glint_data_logger",
            weight: 12,
            resultText: "你把雪壳撬开一点，下面露出一枚小型数据记录器。外壳边缘有冻裂痕迹，但封条还在。这种东西不该随便丢在巡查线上。",
            logLine: "从雪面反光处发现一枚完整微型数据记录器。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "intact_micro_data_logger",
                qty: 1,
                reason: "west2_surface_debris_glint_001.inspect_surface_glint"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          })
        ])
      }),
      Object.freeze({
        id: "ignore_surface_glint",
        label: "不理会",
        timeCostMinutes: 1,
        outcome: Object.freeze({
          resultText: "你没有为那点反光停下。风很快把雪面重新抹平，那点灰色边角也消失在身后。",
          logLine: "没有检查雪面反光处。",
          resultIntents: Object.freeze([]),
          continuation: Object.freeze({ mode: "resume" })
        })
      })
    ])
  }),
  west2_loose_marker_plate_001: Object.freeze({
    id: "west2_loose_marker_plate_001",
    title: "松动的杆号牌",
    presentation: Object.freeze({
      body: "前方一根标记杆侧面挂着一块小号牌，边缘被风掀起，随着杆身轻轻晃动。数字还能辨认，但固定点已经松了。它现在还算是路标，再过一阵就不好说了。",
      logLine: "你发现一块松动的标记杆号牌。"
    }),
    actions: Object.freeze([
      Object.freeze({
        id: "fix_marker_plate",
        label: "扶正号牌",
        timeCostMinutes: 4,
        outcomeTable: Object.freeze([
          Object.freeze({
            outcomeId: "fix_marker_plate_empty",
            weight: 28,
            resultText: "你把号牌按回原位，检查了一下固定点。它只是松了，没有掉落，也没有藏着别的东西。数字重新朝向通行方向。",
            logLine: "扶正了一块松动的标记杆号牌。",
            resultIntents: Object.freeze([]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "fix_marker_plate_rivet_tin",
            weight: 42,
            resultText: "你扶正号牌时，在杆底附近摸到一个变形的小铁盒。里面还剩几枚固定铆钉，像是以前维修标记杆时留下的。",
            logLine: "扶正号牌，并找到一个旧固定铆钉盒。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "old_rivet_tin",
                qty: 1,
                reason: "west2_loose_marker_plate_001.fix_marker_plate"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "fix_marker_plate_number_plate",
            weight: 25,
            resultText: "你把松动的号牌拆下检查，发现旁边还卡着一块旧号牌。编号还能辨认，保存状态比预想中好。",
            logLine: "从标记杆旁取回一块完整杆号牌。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "intact_marker_number_plate",
                qty: 1,
                reason: "west2_loose_marker_plate_001.fix_marker_plate"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "fix_marker_plate_connector",
            weight: 5,
            resultText: "你顺着号牌固定点往下看，发现一枚小型防水接头卡在积雪里。胶圈还没有完全老化，应该能回收。",
            logLine: "在松动号牌下方发现一个便携设备防水接头。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "portable_device_waterproof_connector",
                qty: 1,
                reason: "west2_loose_marker_plate_001.fix_marker_plate"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          })
        ])
      }),
      Object.freeze({
        id: "leave_marker_plate",
        label: "不处理",
        timeCostMinutes: 1,
        outcome: Object.freeze({
          resultText: "你没有停下处理那块号牌。它继续在风里轻轻晃动，数字一会儿露出来，一会儿又被雪尘盖住。",
          logLine: "没有处理松动的标记杆号牌。",
          resultIntents: Object.freeze([]),
          continuation: Object.freeze({ mode: "resume" })
        })
      })
    ])
  }),
  west2_torn_marker_tape_001: Object.freeze({
    id: "west2_torn_marker_tape_001",
    title: "被风扯开的标带",
    presentation: Object.freeze({
      body: "一截反光标带从标记杆上松开，被风拽得笔直。它还没有彻底断掉，只靠一小段金属扣挂着，发出细碎的拍打声。",
      logLine: "你发现一截被风扯开的标带。"
    }),
    actions: Object.freeze([
      Object.freeze({
        id: "retie_marker_tape",
        label: "重新系紧",
        timeCostMinutes: 6,
        outcomeTable: Object.freeze([
          Object.freeze({
            outcomeId: "retie_marker_tape_empty",
            weight: 25,
            resultText: "你把标带重新绕回杆身，冻硬的纤维在手套下很不听话。它勉强贴回原位，暂时不会被风吹走。",
            logLine: "重新固定了一截松脱的标带。",
            resultIntents: Object.freeze([]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "retie_marker_tape_worn_tape",
            weight: 45,
            resultText: "你重新固定标带时，剪下了一截已经磨损但还算完整的反光材料。外层灰得厉害，内侧还留着一点可用涂层。",
            logLine: "重新固定标带，并取回一截磨损反光标带。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "worn_reflective_marker_tape",
                qty: 1,
                reason: "west2_torn_marker_tape_001.retie_marker_tape"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "retie_marker_tape_clamp",
            weight: 25,
            resultText: "你固定标带时发现旧扣件已经冻裂，继续用在杆上不太可靠。你把它取了下来，至少还能作为回收件处理。",
            logLine: "从松脱标带上取回一枚断裂标记杆扣件。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "broken_marker_pole_clamp",
                qty: 1,
                reason: "west2_torn_marker_tape_001.retie_marker_tape"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "retie_marker_tape_relay",
            weight: 5,
            resultText: "你在标带下方的积雪里摸到一个封胶小模块。它不像标带附件，更像从旧设备上掉下来的抗寒继电器。",
            logLine: "在标带附近发现一块抗寒继电器模块。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "coldproof_relay_module",
                qty: 1,
                reason: "west2_torn_marker_tape_001.retie_marker_tape"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          })
        ])
      }),
      Object.freeze({
        id: "ignore_marker_tape",
        label: "绕开继续走",
        timeCostMinutes: 1,
        outcome: Object.freeze({
          resultText: "你没有停下。那截标带继续在风里抽动，声音很快被雪粒擦过衣料的细响盖住。",
          logLine: "绕过一截松脱标带继续前进。",
          resultIntents: Object.freeze([]),
          continuation: Object.freeze({ mode: "resume" })
        })
      })
    ])
  }),
  west2_crossing_old_footprints_001: Object.freeze({
    id: "west2_crossing_old_footprints_001",
    title: "交叉的旧脚印",
    presentation: Object.freeze({
      body: "雪面上出现了两组旧脚印。一组沿着标记杆方向延伸，另一组斜着切过来，又在不远处变浅。风已经抹掉了边缘，只剩几个压痕还保留着人的形状。",
      logLine: "你发现两组交叉的旧脚印。"
    }),
    actions: Object.freeze([
      Object.freeze({
        id: "inspect_old_footprints",
        label: "检查脚印走向",
        timeCostMinutes: 6,
        outcomeTable: Object.freeze([
          Object.freeze({
            outcomeId: "inspect_old_footprints_empty",
            weight: 32,
            resultText: "你蹲下检查压痕深浅。斜向脚印更旧，边缘已经被浮雪填平；沿标记杆方向那组更新一些。这里没有别的发现。",
            logLine: "检查了交叉脚印的方向。",
            resultIntents: Object.freeze([]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "inspect_old_footprints_beacon",
            weight: 34,
            resultText: "你顺着较浅的脚印看了一段，在雪面边缘发现一块旧式定位信标残件。它已经不能工作，但外壳和接口还有回收价值。",
            logLine: "沿旧脚印发现一块旧式定位信标残件。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "old_locator_beacon_fragment",
                qty: 1,
                reason: "west2_crossing_old_footprints_001.inspect_old_footprints"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "inspect_old_footprints_gps_head",
            weight: 24,
            resultText: "你在脚印转浅的位置发现一个旧型GPS天线头。底部螺纹已经断裂，外壳磨损严重，但内部件还能拆。",
            logLine: "在旧脚印旁发现一个旧型GPS天线头。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "old_gps_antenna_head",
                qty: 1,
                reason: "west2_crossing_old_footprints_001.inspect_old_footprints"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "inspect_old_footprints_badge",
            weight: 10,
            resultText: "你顺着斜向脚印多看了一眼，在一片薄雪壳下发现一枚旧式科考徽章。背针断了，边缘磨损明显，但它不像普通废金属。",
            logLine: "在旧脚印附近发现一枚早期科考徽章。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "early_expedition_badge",
                qty: 1,
                reason: "west2_crossing_old_footprints_001.inspect_old_footprints"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          })
        ])
      }),
      Object.freeze({
        id: "keep_route",
        label: "维持当前路线",
        timeCostMinutes: 2,
        outcome: Object.freeze({
          resultText: "你没有跟随那些斜出的脚印。它们看起来像答案，也可能只是另一个人留下的问题。",
          logLine: "无视交叉脚印，维持当前路线。",
          resultIntents: Object.freeze([]),
          continuation: Object.freeze({ mode: "resume" })
        })
      })
    ])
  }),
  west2_distant_metal_ping_001: Object.freeze({
    id: "west2_distant_metal_ping_001",
    title: "远处短促金属声",
    presentation: Object.freeze({
      body: "风里传来一声短促的金属响，像扣件撞到杆身，也像远处某块薄板被冻风掀了一下。声音很快消失，周围重新只剩雪粒擦过衣料的细响。",
      logLine: "你听见远处传来一声短促的金属响。"
    }),
    actions: Object.freeze([
      Object.freeze({
        id: "listen_for_metal_ping",
        label: "停下辨认",
        timeCostMinutes: 5,
        outcomeTable: Object.freeze([
          Object.freeze({
            outcomeId: "listen_for_metal_ping_empty",
            weight: 36,
            resultText: "你停下来听了一会儿。声音没有再次出现。这里的风会把很多东西吹得像信号，刚才那一下也许只是错觉。",
            logLine: "停下辨认了一次远处金属声，但没有发现来源。",
            resultIntents: Object.freeze([]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "listen_for_metal_ping_vane",
            weight: 34,
            resultText: "你朝声音方向走了几步，在雪面上发现一枚冻裂测风叶片。它大概是从旧气象点上崩下来的。",
            logLine: "循着金属声发现一枚冻裂测风叶片。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "cracked_anemometer_vane",
                qty: 1,
                reason: "west2_distant_metal_ping_001.listen_for_metal_ping"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "listen_for_metal_ping_relay",
            weight: 24,
            resultText: "你在一块半埋的金属片下找到一个封胶继电器模块。外侧铭牌被刮花，但结构还算完整。",
            logLine: "循着金属声找到一块抗寒继电器模块。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "coldproof_relay_module",
                qty: 1,
                reason: "west2_distant_metal_ping_001.listen_for_metal_ping"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "listen_for_metal_ping_power_board",
            weight: 6,
            resultText: "你继续查看声音来源，在雪壳下发现一块带旧编号的电源识别板。封胶还在，像是某批外勤电源箱留下的部件。",
            logLine: "循着金属声发现一块封存电源识别板。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "sealed_power_identification_board",
                qty: 1,
                reason: "west2_distant_metal_ping_001.listen_for_metal_ping"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          })
        ])
      }),
      Object.freeze({
        id: "ignore_metal_ping",
        label: "忽略声音",
        timeCostMinutes: 1,
        outcome: Object.freeze({
          resultText: "你没有追究那声响。野外有太多声音会假装自己重要，真正重要的东西反而常常不出声。",
          logLine: "忽略远处金属声继续前进。",
          resultIntents: Object.freeze([]),
          continuation: Object.freeze({ mode: "resume" })
        })
      })
    ])
  }),
  west2_faded_tape_mismatch_001: Object.freeze({
    id: "west2_faded_tape_mismatch_001",
    title: "褪色不一的标带",
    presentation: Object.freeze({
      body: "前方两根标记杆上的标带颜色不太一致。一根偏橙，一根偏灰红。它们也许原本就是同一种颜色，只是被风、雪和低温磨出了不同的老化程度。",
      logLine: "你发现两根标记杆上的标带褪色不一。"
    }),
    actions: Object.freeze([
      Object.freeze({
        id: "inspect_faded_tape",
        label: "靠近辨认",
        timeCostMinutes: 4,
        outcomeTable: Object.freeze([
          Object.freeze({
            outcomeId: "inspect_faded_tape_empty",
            weight: 35,
            resultText: "你靠近看了看，标带底色确实相同，只是外侧那层褪得更厉害。它没有指向另一条路线。",
            logLine: "靠近辨认了褪色标带。",
            resultIntents: Object.freeze([]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "inspect_faded_tape_worn_tape",
            weight: 42,
            resultText: "你检查标带时，发现其中一截已经松脱。外层几乎失效，但内侧反光涂层还能回收。",
            logLine: "从褪色标带上取下一截磨损反光标带。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "worn_reflective_marker_tape",
                qty: 1,
                reason: "west2_faded_tape_mismatch_001.inspect_faded_tape"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "inspect_faded_tape_insulator",
            weight: 20,
            resultText: "你在标记杆底部发现一小块冻裂绝缘瓷片。它不像标带的一部分，更像从旧线路支架上崩落后被雪推到这里。",
            logLine: "在褪色标带附近发现一块冻裂绝缘瓷片。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "cracked_ceramic_insulator",
                qty: 1,
                reason: "west2_faded_tape_mismatch_001.inspect_faded_tape"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "inspect_faded_tape_connector",
            weight: 3,
            resultText: "你顺着杆底清理了一小圈雪，摸到一个小型防水接头。它被冻得很硬，但胶圈保存得还算完整。",
            logLine: "在褪色标带附近发现一个便携设备防水接头。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "portable_device_waterproof_connector",
                qty: 1,
                reason: "west2_faded_tape_mismatch_001.inspect_faded_tape"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          })
        ])
      }),
      Object.freeze({
        id: "ignore_faded_tape",
        label: "不作停留",
        timeCostMinutes: 1,
        outcome: Object.freeze({
          resultText: "你没有为颜色差异停下。这里所有东西都在褪色，只是有些褪得更像暗示。",
          logLine: "忽略标带颜色差异继续前进。",
          resultIntents: Object.freeze([]),
          continuation: Object.freeze({ mode: "resume" })
        })
      })
    ])
  }),
  west2_old_maintenance_cache_001: Object.freeze({
    id: "west2_old_maintenance_cache_001",
    title: "半埋的维修小盒",
    presentation: Object.freeze({
      body: "标记杆底部的雪面鼓起一小块，边缘露出暗色塑料。它不像自然形成的雪包，更像某个旧维修盒被风雪埋住后又露出了一角。",
      logLine: "你发现一个半埋在标记杆底部的维修小盒。"
    }),
    actions: Object.freeze([
      Object.freeze({
        id: "open_maintenance_cache",
        label: "挖出查看",
        timeCostMinutes: 7,
        outcomeTable: Object.freeze([
          Object.freeze({
            outcomeId: "open_maintenance_cache_empty",
            weight: 25,
            resultText: "你把那块暗色塑料挖出来，发现只是一个破裂的空盒。里面早就被雪填满，什么也没剩下。",
            logLine: "挖出一个空的旧维修盒。",
            resultIntents: Object.freeze([]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "open_maintenance_cache_rivet_tin",
            weight: 32,
            resultText: "你打开维修盒，里面有一个变形的小铁盒，几枚固定铆钉还卡在内侧。",
            logLine: "从旧维修盒里找到一个旧固定铆钉盒。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "old_rivet_tin",
                qty: 1,
                reason: "west2_old_maintenance_cache_001.open_maintenance_cache"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "open_maintenance_cache_cable",
            weight: 28,
            resultText: "维修盒底部压着一段短截防寒电缆。外皮硬得像冻住的皮革，但铜芯还没有完全腐蚀。",
            logLine: "从旧维修盒里取回一段短截防寒电缆。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "short_coldproof_cable_offcut",
                qty: 1,
                reason: "west2_old_maintenance_cache_001.open_maintenance_cache"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "open_maintenance_cache_relay",
            weight: 12,
            resultText: "你在盒底找到一块封胶继电器模块。铭牌被冻风刮花，但整体没有碎。",
            logLine: "从旧维修盒里找到一块抗寒继电器模块。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "coldproof_relay_module",
                qty: 1,
                reason: "west2_old_maintenance_cache_001.open_maintenance_cache"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          }),
          Object.freeze({
            outcomeId: "open_maintenance_cache_power_board",
            weight: 3,
            resultText: "维修盒夹层里压着一块带旧编号的电源识别板，表面封胶还在。这不像普通维修耗材，更像登记部件。",
            logLine: "从旧维修盒夹层里发现一块封存电源识别板。",
            resultIntents: Object.freeze([
              Object.freeze({
                type: "grant_item",
                itemId: "sealed_power_identification_board",
                qty: 1,
                reason: "west2_old_maintenance_cache_001.open_maintenance_cache"
              })
            ]),
            continuation: Object.freeze({ mode: "resume" })
          })
        ])
      }),
      Object.freeze({
        id: "leave_maintenance_cache",
        label: "不挖",
        timeCostMinutes: 1,
        outcome: Object.freeze({
          resultText: "你没有为那块塑料边角停下。它继续露在雪面上，像一个小小的未确认事项。",
          logLine: "没有查看半埋的维修小盒。",
          resultIntents: Object.freeze([]),
          continuation: Object.freeze({ mode: "resume" })
        })
      })
    ])
  }),
  west2_hidden_snow_hollow_001: Object.freeze({
    id: "west2_hidden_snow_hollow_001",
    title: "薄雪壳陷落",
    presentation: Object.freeze({
      body: "你下一步踩下去时，雪面没有像预想中那样托住重量。薄雪壳从脚边塌开，身体猛地向下一沉，膝盖撞上硬雪边缘。下面不是深裂缝，只是一处被风掏空的浅雪洞，但足够让你失去平衡。",
      logLine: "你踩塌了一处被浮雪覆盖的浅雪洞。"
    }),
    actions: Object.freeze([
      Object.freeze({
        id: "force_climb_out",
        label: "强行爬出",
        timeCostMinutes: 12,
        outcome: Object.freeze({
          resultText: "你没有浪费时间，直接用手肘和膝盖顶住雪洞边缘往外爬。硬雪刮过防寒层，膝盖传来一阵钝痛。你很快脱离了塌陷处，但身体被这一阵强行发力抽空了一截。",
          logLine: "强行爬出薄雪壳塌陷处，损失大量体力并受到轻伤。",
          resultIntents: Object.freeze([
            Object.freeze({
              type: "apply_player_delta",
              hp: -6,
              stamina: -32,
              reason: "west2_hidden_snow_hollow_001.force_climb_out"
            })
          ]),
          continuation: Object.freeze({ mode: "resume" })
        })
      }),
      Object.freeze({
        id: "slow_extract_self",
        label: "慢慢脱困",
        timeCostMinutes: 42,
        outcome: Object.freeze({
          resultText: "你没有急着硬撑，而是先稳住身体，把一只脚从塌陷边缘慢慢抽出来。这个过程比想象中更久，风不断把浮雪吹回洞口。等你重新站稳，路线已经被耽误了一大截。",
          logLine: "缓慢脱离薄雪壳塌陷处，损失少量体力并耗费大量时间。",
          resultIntents: Object.freeze([
            Object.freeze({
              type: "apply_player_delta",
              hp: -1,
              stamina: -10,
              reason: "west2_hidden_snow_hollow_001.slow_extract_self"
            })
          ]),
          continuation: Object.freeze({ mode: "resume" })
        })
      })
    ])
  })
});
