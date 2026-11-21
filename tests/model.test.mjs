import assert from "node:assert/strict";
import {
  PRESETS,
  PLANTS,
} from "../assets/plants.js";
import {
  climateScore,
  evaluateGarden,
  exposureScore,
  resultToCsv,
} from "../assets/model.js";

assert.equal(PLANTS.length, 24);

const echinacea = PLANTS.find((plant) => plant.id === "echinacea-purpurea");
assert.equal(exposureScore(echinacea, "sun"), 100);
assert.ok(exposureScore(echinacea, "part") > 50);
assert.ok(exposureScore(echinacea, "shade") < 70);
assert.equal(climateScore(echinacea, 7), 100);
assert.ok(climateScore(echinacea, 10) < 100);

for (const preset of Object.values(PRESETS)) {
  const result = evaluateGarden(preset.values);
  assert.ok(result.palette.length >= 6);
  assert.ok(result.metrics.match > 0 && result.metrics.match <= 100);
  assert.ok(result.metrics.totalPlants >= 12);
  assert.ok(result.metrics.initialCost > 0);
  assert.equal(result.coverage.length, 12);
  assert.equal(result.calendar.length, 12);
  assert.ok(result.warnings.length >= 1);
}

const lowWater = evaluateGarden(PRESETS.courtyard.values);
const wetShade = evaluateGarden(PRESETS.shade.values);
assert.ok(lowWater.metrics.lowWaterShare > wetShade.metrics.lowWaterShare);
assert.ok(wetShade.palette.some(({ plant }) => ["part", "shade"].every((item) => plant.exposure.includes(item))));

const csv = resultToCsv(lowWater);
assert.ok(csv.startsWith('"植物","学名"'));
assert.ok(csv.includes("建议数量"));

const risky = evaluateGarden({
  city: "harbin",
  area: 3,
  exposure: "shade",
  ph: 8.4,
  moisture: 1,
  careHours: 0.5,
  goal: "pollinator",
  budget: 20,
});
assert.ok(risky.warnings.length >= 2);

console.log("FlowerCast model tests passed: 24 plants, 3 presets, edge cases.");
