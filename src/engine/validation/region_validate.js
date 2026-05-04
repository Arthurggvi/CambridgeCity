const WIND_DIR_ENUM = new Set(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);

function err(fileName, path, message) {
  console.error(`${fileName} -> ${path}: ${message}`);
}

function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isFiniteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * 校验区域配置：
 * - RegionId 唯一
 * - 数值字段齐全
 * - WindDir_prevailing 为固定 8 向枚举
 */
export function validateRegionData(data, fileName = "regions_winter.json") {
  if (!isObj(data)) {
    err(fileName, "$", "必须是对象");
    return false;
  }

  if (!Array.isArray(data.regions)) {
    err(fileName, "regions", "必须是数组");
    return false;
  }

  const idSet = new Set();
  const requiredNumeric = [
    "T_base",
    "A_region",
    "Pmax",
    "MoistureIndex",
    "SunAmp",
    "SnowWarmAmp",
    "WindBase",
    "WindVar"
  ];

  for (let i = 0; i < data.regions.length; i++) {
    const r = data.regions[i];
    const p = `regions[${i}]`;

    if (!isObj(r)) {
      err(fileName, p, "必须是对象");
      return false;
    }

    if (typeof r.RegionId !== "string" || r.RegionId.trim() === "") {
      err(fileName, `${p}.RegionId`, "必须是非空字符串");
      return false;
    }

    if (idSet.has(r.RegionId)) {
      err(fileName, `${p}.RegionId`, `重复 RegionId: ${r.RegionId}`);
      return false;
    }
    idSet.add(r.RegionId);

    for (const k of requiredNumeric) {
      if (!isFiniteNum(r[k])) {
        err(fileName, `${p}.${k}`, "必须是有限数值");
        return false;
      }
    }

    if (!WIND_DIR_ENUM.has(r.WindDir_prevailing)) {
      err(fileName, `${p}.WindDir_prevailing`, "必须是 N/NE/E/SE/S/SW/W/NW 之一");
      return false;
    }

    if (r.MoistureIndex < 0 || r.MoistureIndex > 1) {
      err(fileName, `${p}.MoistureIndex`, "范围必须在 [0,1]");
      return false;
    }

    if (r.Pmax < 0 || r.WindBase < 0 || r.WindVar < 0) {
      err(fileName, p, "Pmax/WindBase/WindVar 不能为负");
      return false;
    }
  }

  return true;
}
