import { CITIES, GOALS, MONTHS, PLANTS } from "./plants.js";

const EXPOSURE_LABELS = {
  sun: "全日照",
  part: "半日照",
  shade: "半阴/荫蔽",
};

const MOISTURE_LABELS = {
  1: "偏干",
  2: "中等",
  3: "湿润",
};

const SOIL_FACTORS = {
  sandy: 0.84,
  loam: 1,
  clay: 1.12,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function siteSoil(ph) {
  if (ph < 6) return "sandy";
  if (ph > 7.6) return "clay";
  return "loam";
}

export function exposureScore(plant, exposure) {
  if (plant.exposure.includes(exposure)) return 100;
  const pairs = [
    ["sun", "part"],
    ["part", "shade"],
  ];
  const adjacent = pairs.some(
    ([a, b]) => plant.exposure.includes(a) && exposure === b,
  ) || pairs.some(([a, b]) => plant.exposure.includes(b) && exposure === a);
  return adjacent ? 62 : 8;
}

export function climateScore(plant, zone) {
  if (zone >= plant.zones[0] && zone <= plant.zones[1]) return 100;
  const distance = zone < plant.zones[0]
    ? plant.zones[0] - zone
    : zone - plant.zones[1];
  return clamp(94 - distance * 24, 8, 94);
}

export function phScore(plant, ph) {
  if (ph >= plant.ph[0] && ph <= plant.ph[1]) return 100;
  const distance = ph < plant.ph[0] ? plant.ph[0] - ph : ph - plant.ph[1];
  return clamp(92 - distance * 34, 5, 92);
}

export function moistureScore(plant, moisture) {
  const distance = Math.abs(plant.water - moisture);
  if (distance === 0) return 100;
  if (distance === 1) return 72;
  return 24;
}

export function maintenanceScore(plant, careHours, area) {
  const pressure = careHours / Math.max(area, 1);
  const capacity = pressure >= 0.22 ? 5 : pressure >= 0.14 ? 4 : pressure >= 0.085 ? 3 : 2;
  if (plant.maintenance <= capacity) return 100;
  return clamp(92 - (plant.maintenance - capacity) * 38, 10, 92);
}

function goalScore(plant, goal) {
  switch (goal) {
    case "lowWater":
      return plant.water === 1 ? 100 : plant.water === 2 ? 58 : 20;
    case "pollinator":
      return plant.pollinator * 20;
    case "evergreen":
      return plant.evergreen || plant.foliageInterest ? 100 : 28;
    case "seasonal":
      return clamp(34 + plant.bloomMonths.length * 9, 35, 100);
    default:
      return clamp(60 + (plant.bloomMonths.length - 2) * 7, 45, 100);
  }
}

function categoryDiversity(candidate, selected) {
  const sameCategory = selected.filter((plant) => plant.category === candidate.category).length;
  const sameRole = selected.filter((plant) => plant.role === candidate.role).length;
  return Math.max(0, 14 - sameCategory * 4 - sameRole * 6);
}

function coverageGain(candidate, selected) {
  return candidate.bloomMonths.reduce(
    (gain, month) => gain + (selected.some((plant) => plant.bloomMonths.includes(month)) ? 1 : 9),
    0,
  );
}

export function scorePlant(plant, input) {
  const city = CITIES[input.city] || CITIES.shanghai;
  const exposure = exposureScore(plant, input.exposure);
  const climate = climateScore(plant, city.zone);
  const ph = phScore(plant, input.ph);
  const moisture = moistureScore(plant, input.moisture);
  const maintenance = maintenanceScore(plant, input.careHours, input.area);
  const goal = goalScore(plant, input.goal);
  const score =
    exposure * 0.25 +
    climate * 0.2 +
    ph * 0.12 +
    moisture * 0.12 +
    maintenance * 0.15 +
    goal * 0.16;

  return {
    total: Math.round(score),
    exposure: Math.round(exposure),
    climate: Math.round(climate),
    ph: Math.round(ph),
    moisture: Math.round(moisture),
    maintenance: Math.round(maintenance),
    goal: Math.round(goal),
  };
}

function allocateQuantities(selected, area) {
  const weighted = selected.map(({ plant, score }) => ({
    plant,
    score,
    weight: (plant.spacing <= 25 ? 1.55 : plant.spacing <= 38 ? 1.2 : 0.9) *
      (plant.role === "地被" || plant.role === "镶边" || plant.role === "铺陈" ? 1.25 : 1) *
      (0.85 + score.total / 500),
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const totalPlants = Math.max(12, Math.round((area / 9) * 18));

  return weighted.map((item) => ({
    ...item,
    quantity: Math.max(1, Math.round((item.weight / totalWeight) * totalPlants)),
  }));
}

function buildSeasonalCoverage(selected) {
  return MONTHS.map((name, index) => {
    const month = index + 1;
    const bloomers = selected.filter(({ plant }) => plant.bloomMonths.includes(month));
    const structural = selected.filter(
      ({ plant }) => plant.evergreen || (plant.foliageInterest && month !== 12),
    );
    return {
      month,
      name,
      blooms: bloomers.length,
      structure: structural.length,
      names: bloomers.map(({ plant }) => plant.name),
      level: clamp((bloomers.length * 15 + structural.length * 7) * 2.1, 8, 100),
    };
  });
}

function buildCalendar(selected) {
  return MONTHS.map((name, index) => {
    const month = index + 1;
    const blooming = selected
      .filter(({ plant }) => plant.bloomMonths.includes(month))
      .map(({ plant }) => plant.name);
    let tasks = "观察土壤水分与病虫害，按需清理残花。";

    if ([2, 3].includes(month)) tasks = "检查越冬损伤；补植早春球根，施薄肥并整理覆盖物。";
    if ([4, 5].includes(month)) tasks = "春季返青后补植、松土；关注蚜虫与新梢水分。";
    if ([6, 7].includes(month)) tasks = "花后短截、清除残花；避开正午浇水，防湿热病害。";
    if ([8, 9].includes(month)) tasks = "评估夏季缺株，补充秋花；检查观赏草倒伏并疏剪。";
    if ([10, 11].includes(month)) tasks = "保留种穗和草叶结构；清理病叶，减少无效追肥。";
    if ([12, 1].includes(month)) tasks = "以清园、防寒和结构检查为主；减少修剪与扰动。";

    return { month, name, blooming, tasks };
  });
}

function buildWarnings(result, input) {
  const warnings = [];
  const city = CITIES[input.city];
  if (result.metrics.match < 62) {
    warnings.push("整体适配度偏低，当前光照、气候或土壤条件可能超出植物库的推荐范围，建议先做小面积试种。");
  }
  if (result.palette.filter(({ score }) => score.ph < 70).length >= 2) {
    warnings.push("多种候选植物的 pH 适配偏低，建议先进行土壤检测；必要时调整基质或改用更耐酸碱的材料。");
  }
  if (result.palette.some(({ plant }) => plant.water === 3) && input.moisture === 1) {
    warnings.push("方案含高水分需求植物，但场地设为偏干，建议增加滴灌或替换落新妇等湿生型材料。");
  }
  if (result.palette.some(({ plant }) => plant.maintenance >= 3) && input.careHours / input.area < 0.06) {
    warnings.push("当前维护时长偏低，球根复壮、花后修剪等任务可能无法按时完成。");
  }
  if (result.metrics.initialCost > input.area * input.budget) {
    warnings.push("初始材料费高于当前预算，可优先保留骨架植物，再分阶段补入季相花卉。");
  }
  if (result.coverage.filter((month) => month.blooms === 0).length >= 4) {
    warnings.push("有 4 个月以上无开花植物，建议依靠常绿或观叶材料补足冬季结构。");
  }
  if (city.zone >= 9 && result.palette.some(({ plant }) => plant.zones[1] <= 8)) {
    warnings.push("部分植物耐热性接近上限，湿热城市需加强排水并避开夏季闷热位置。");
  }
  if (warnings.length === 0) {
    warnings.push("主要场地约束匹配良好；定植前仍需核对品种耐寒性、土壤排水和当地法规。");
  }
  return warnings;
}

export function evaluateGarden(rawInput) {
  const input = {
    city: "shanghai",
    area: 12,
    exposure: "part",
    ph: 6.5,
    moisture: 2,
    careHours: 3,
    goal: "balanced",
    budget: 160,
    style: "natural",
    ...rawInput,
  };
  const city = CITIES[input.city] || CITIES.shanghai;
  const ranked = PLANTS.map((plant) => ({
    plant,
    score: scorePlant(plant, input),
  }))
    .filter(({ score }) => score.total >= 42)
    .sort((a, b) => b.score.total - a.score.total);

  const targetCount = clamp(Math.round(5 + input.area / 9), 6, 9);
  const selected = [];
  const pool = [...ranked];

  while (selected.length < targetCount && pool.length > 0) {
    pool.sort((a, b) => {
      const aValue = a.score.total + coverageGain(a.plant, selected.map((item) => item.plant)) * 0.9 +
        categoryDiversity(a.plant, selected.map((item) => item.plant)) * 0.7;
      const bValue = b.score.total + coverageGain(b.plant, selected.map((item) => item.plant)) * 0.9 +
        categoryDiversity(b.plant, selected.map((item) => item.plant)) * 0.7;
      return bValue - aValue;
    });
    selected.push(pool.shift());
  }

  const palette = allocateQuantities(selected, input.area);
  const totalPlants = palette.reduce((sum, item) => sum + item.quantity, 0);
  const initialCost = palette.reduce(
    (sum, item) => sum + item.quantity * item.plant.price,
    0,
  );
  const annualCareCost = Math.round(initialCost * 0.08 + input.careHours * 52 * 22);
  const soilFactor = SOIL_FACTORS[siteSoil(input.ph)];
  const annualWater = palette.reduce(
    (sum, item) => sum + item.quantity * [45, 82, 132][item.plant.water - 1] * city.heat * soilFactor,
    0,
  );
  const monthlyCare = Math.round(
    palette.reduce((sum, item) => sum + item.quantity * item.plant.maintenance * 0.48, 0) +
      input.area * 0.5,
  );
  const coverage = buildSeasonalCoverage(selected);
  const bloomMonthsCovered = coverage.filter((month) => month.blooms > 0).length;
  const structureMonthsCovered = coverage.filter((month) => month.structure > 0).length;
  const averagePollinator =
    palette.reduce((sum, item) => sum + item.plant.pollinator * item.quantity, 0) /
    totalPlants;
  const lowWaterShare =
    palette.filter((item) => item.plant.water === 1).reduce((sum, item) => sum + item.quantity, 0) /
    totalPlants;
  const nativeShare =
    palette.filter((item) => item.plant.native).reduce((sum, item) => sum + item.quantity, 0) /
    totalPlants;
  const averageMatch =
    palette.reduce((sum, item) => sum + item.score.total * item.quantity, 0) /
    totalPlants;
  const ecologyScore = Math.round(
    (bloomMonthsCovered / 12) * 30 +
      (structureMonthsCovered / 12) * 20 +
      (averagePollinator / 5) * 30 +
      lowWaterShare * 12 +
      nativeShare * 8,
  );
  const result = {
    input,
    city,
    ranked,
    palette,
    coverage,
    calendar: buildCalendar(selected),
    metrics: {
      match: Math.round(averageMatch),
      bloomMonthsCovered,
      structureMonthsCovered,
      totalPlants,
      initialCost: Math.round(initialCost),
      annualCareCost,
      annualWater: Math.round(annualWater),
      monthlyCare,
      averagePollinator: Math.round(averagePollinator * 10) / 10,
      lowWaterShare: Math.round(lowWaterShare * 100),
      nativeShare: Math.round(nativeShare * 100),
      ecologyScore: clamp(ecologyScore, 0, 100),
    },
  };

  result.warnings = buildWarnings(result, input);
  result.summary = buildSummary(result);
  return result;
}

function buildSummary(result) {
  const { metrics } = result;
  const seasons = [
    "春季",
    "夏季",
    "秋季",
    "冬季",
  ];
  const bestSeason = seasons
    .map((season, index) => {
      const months = result.coverage.slice(index * 3, index * 3 + 3);
      return {
        season,
        score: months.reduce((sum, month) => sum + month.level, 0),
      };
    })
    .sort((a, b) => b.score - a.score)[0].season;
  return `在${result.city.name}${EXPOSURE_LABELS[result.input.exposure]}条件下，优先形成${bestSeason}观赏峰值。` +
    `方案包含 ${result.palette.length} 类植物、约 ${metrics.totalPlants} 株，` +
    `匹配度 ${metrics.match} 分，全年有花 ${metrics.bloomMonthsCovered} 个月，` +
    `生态综合指数 ${metrics.ecologyScore}。`;
}

export function resultToCsv(result) {
  const header = [
    "植物",
    "学名",
    "类别",
    "建议数量",
    "株高cm",
    "冠幅间距cm",
    "花期",
    "水分等级",
    "维护等级",
    "单株估价元",
    "匹配分",
  ];
  const rows = result.palette.map(({ plant, quantity, score }) => [
    plant.name,
    plant.latin,
    plant.category,
    quantity,
    plant.height,
    plant.spacing,
    plant.bloomMonths.join("/"),
    plant.water,
    plant.maintenance,
    plant.price,
    score.total,
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
}

export { EXPOSURE_LABELS, GOALS, MOISTURE_LABELS };
