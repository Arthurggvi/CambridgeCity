export const WILDERNESS_EVENT_POOLS = Object.freeze({
  west2_old_marker_patrol_line_event_pool: Object.freeze({
    id: "west2_old_marker_patrol_line_event_pool",
    hook: "after_wilderness_move_success",
    when: Object.freeze({
      terrainIdsAny: Object.freeze([
        "flagged_marker_line",
        "wind_packed_snow",
        "loose_snowfield",
        "snow_drift_zone",
        "sastrugi_field",
        "managed_compacted_route"
      ]),
      terrainTagsAny: Object.freeze(["snow"]),
      areaIdsAny: Object.freeze(["west2_old_marker_patrol_line"])
    }),
    gateChance: 0.15,
    entries: Object.freeze([
      Object.freeze({
        eventId: "west2_surface_debris_glint_001",
        weight: 60
      }),
      Object.freeze({
        eventId: "west2_loose_marker_plate_001",
        weight: 45
      }),
      Object.freeze({
        eventId: "west2_torn_marker_tape_001",
        weight: 45
      }),
      Object.freeze({
        eventId: "west2_crossing_old_footprints_001",
        weight: 35
      }),
      Object.freeze({
        eventId: "west2_distant_metal_ping_001",
        weight: 35
      }),
      Object.freeze({
        eventId: "west2_faded_tape_mismatch_001",
        weight: 40
      }),
      Object.freeze({
        eventId: "west2_old_maintenance_cache_001",
        weight: 30
      }),
      Object.freeze({
        eventId: "west2_hidden_snow_hollow_001",
        weight: 20
      })
    ]),
    cooldown: Object.freeze({
      sameEventSteps: 4,
      sameCellOnce: true
    })
  })
});
