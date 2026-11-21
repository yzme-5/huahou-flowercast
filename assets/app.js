import {
  CITIES,
  GOALS,
  PRESETS,
} from "./plants.js";
import {
  EXPOSURE_LABELS,
  MOISTURE_LABELS,
  evaluateGarden,
  resultToCsv,
} from "./model.js";

const form = document.querySelector("#siteForm");
const results = document.querySelector("#results");
const presetList = document.querySelector("#presetList");
const goalGrid = document.querySelector("#goalGrid");
const toast = document.querySelector("#toast");
let activePreset = "balcony";
let latestResult = null;
let persistTimer = null;

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function populateControls() {
  document.querySelector("#city").innerHTML = Object.entries(CITIES)
    .map(([id, city]) => `<option value="${id}">${city.name} · 耐寒区 ${city.zone}</option>`)
    .join("");

  goalGrid.innerHTML = Object.entries(GOALS)
    .map(([id, goal]) => `
      <label title="${escapeHtml(goal.description)}">
        <input type="radio" name="goal" value="${id}" ${id === "balanced" ? "checked" : ""}>
        <span>${escapeHtml(goal.name)}</span>
      </label>
    `)
    .join("");

  presetList.innerHTML = Object.entries(PRESETS)
    .map(([id, preset]) => `
      <button type="button" data-preset="${id}" class="${id === activePreset ? "active" : ""}">
        <strong>${escapeHtml(preset.name)}</strong>
        <span>${escapeHtml(preset.description)}</span>
      </button>
    `)
    .join("");
}

function formValues() {
  const data = new FormData(form);
  return {
    city: data.get("city"),
    area: Number(data.get("area")),
    exposure: data.get("exposure"),
    goal: data.get("goal"),
    ph: Number(data.get("ph")),
    moisture: Number(data.get("moisture")),
    careHours: Number(data.get("careHours")),
    budget: Number(data.get("budget")),
    style: data.get("style"),
  };
}

function setFormValues(values) {
  for (const [key, value] of Object.entries(values)) {
    const element = form.elements.namedItem(key);
    if (!element) continue;
    if (element instanceof RadioNodeList) {
      element.value = String(value);
    } else {
      element.value = String(value);
    }
  }
  updateRangeOutputs();
}

function updateRangeOutputs() {
  const area = Number(document.querySelector("#area").value);
  const ph = Number(document.querySelector("#ph").value);
  const moisture = Number(document.querySelector("#moisture").value);
  const care = Number(document.querySelector("#careHours").value);
  const budget = Number(document.querySelector("#budget").value);
  document.querySelector("#areaOutput").textContent = `${area}㎡`;
  document.querySelector("#phOutput").textContent = ph.toFixed(1);
  document.querySelector("#moistureOutput").textContent = MOISTURE_LABELS[moisture];
  document.querySelector("#careOutput").textContent = `${care} 小时`;
  document.querySelector("#budgetOutput").textContent = `¥${budget}/㎡`;
  document.querySelectorAll('input[type="range"]').forEach((input) => {
    const progress = ((Number(input.value) - Number(input.min)) /
      (Number(input.max) - Number(input.min))) * 100;
    input.style.setProperty("--progress", `${progress}%`);
    input.setAttribute("aria-valuetext", input.value);
  });
}

function scoreTone(score) {
  if (score >= 80) return "excellent";
  if (score >= 68) return "good";
  return "review";
}

function renderMetric(label, value, unit, note, index) {
  return `
    <article class="metric-card">
      <div class="metric-top"><span>0${index}</span><small>${escapeHtml(label)}</small></div>
      <strong>${value}<sup>${unit}</sup></strong>
      <p>${escapeHtml(note)}</p>
    </article>
  `;
}

function renderSeasonChart(result) {
  return result.coverage.map((month) => `
    <div class="season-bar" title="${month.name}：${month.names.length ? escapeHtml(month.names.join("、")) : "无开花植物"}">
      <div class="bar-track">
        <i style="--height:${month.level}%"></i>
        <span style="--height:${month.level}%"></span>
      </div>
      <strong>${month.name.replace("月", "")}</strong>
      <small>${month.blooms ? `${month.blooms}花` : "结构"}</small>
    </div>
  `).join("");
}

function roleGlyph(role) {
  const glyphs = {
    焦点: "✿",
    竖线: "↟",
    地被: "⌁",
    圆点: "●",
    铺陈: "≈",
    动势: "⌇",
    镶边: "∼",
    大叶: "❧",
    羽穗: "♧",
    点缀: "✦",
    冬景: "❉",
    早春: "☼",
    芳香: "♨",
    秋信: "✺",
    簇生: "✽",
  };
  return glyphs[role] || "✿";
}

function renderPalette(result) {
  return result.palette.map(({ plant, quantity, score }, index) => `
    <article class="plant-card" style="--plant-color:${plant.color}">
      <div class="plant-card-top">
        <span class="plant-index">${String(index + 1).padStart(2, "0")}</span>
        <span class="match-pill ${scoreTone(score.total)}">${score.total}% 适配</span>
      </div>
      <div class="plant-visual">
        <span class="plant-glyph">${roleGlyph(plant.role)}</span>
        <span class="plant-count">×${quantity}</span>
      </div>
      <div class="plant-title">
        <div>
          <h4>${escapeHtml(plant.name)}</h4>
          <em>${escapeHtml(plant.latin)}</em>
        </div>
        <span>${escapeHtml(plant.role)}</span>
      </div>
      <div class="plant-meta">
        <span>${escapeHtml(plant.colorName)}</span>
        <span>${plant.height} cm</span>
        <span>水 ${plant.water}/3</span>
      </div>
      <p>${escapeHtml(plant.note)}</p>
      <details>
        <summary>查看匹配依据</summary>
        <div class="score-grid">
          <span>光照 <b>${score.exposure}</b></span>
          <span>气候 <b>${score.climate}</b></span>
          <span>pH <b>${score.ph}</b></span>
          <span>水分 <b>${score.moisture}</b></span>
          <span>养护 <b>${score.maintenance}</b></span>
          <span>目标 <b>${score.goal}</b></span>
        </div>
      </details>
    </article>
  `).join("");
}

function plantSvgShape(item, x, y, scale) {
  const { plant, quantity } = item;
  const size = Math.max(18, Math.min(46, scale * (plant.spacing / 2 + plant.height / 8)));
  const stemHeight = Math.max(24, Math.min(65, plant.height * 0.52));
  const label = `${plant.name} ×${quantity}`;
  const textY = y + size + 16;

  if (plant.role === "竖线" || plant.role === "动势" || plant.role === "羽穗") {
    return `
      <g class="svg-plant" transform="translate(${x},${y})">
        <path d="M0 ${size * 0.75} C-2 0 3 ${-stemHeight * 0.5} 1 ${-stemHeight}" stroke="${plant.color}" class="stem"/>
        <path d="M1 ${-stemHeight * 0.65} c-${size * 0.45} -8 -${size * 0.6} -14 -${size * 0.55} -${size * 0.5}" fill="${plant.color}" opacity=".8"/>
        <path d="M1 ${-stemHeight * 0.42} c${size * 0.42} -7 ${size * 0.55} -13 ${size * 0.5} -${size * 0.45}" fill="${plant.color}" opacity=".8"/>
        <ellipse cx="1" cy="${-stemHeight - 4}" rx="${size * 0.35}" ry="${size * 0.55}" fill="${plant.color}"/>
        <text x="0" y="${textY}" text-anchor="middle">${escapeHtml(label)}</text>
      </g>
    `;
  }

  if (plant.role === "地被" || plant.role === "镶边" || plant.role === "铺陈") {
    return `
      <g class="svg-plant" transform="translate(${x},${y})">
        <ellipse cx="0" cy="1" rx="${size * 1.25}" ry="${size * 0.45}" fill="${plant.color}" opacity=".34"/>
        <circle cx="${-size * 0.55}" cy="${-size * 0.1}" r="${size * 0.38}" fill="${plant.color}"/>
        <circle cx="${size * 0.08}" cy="${-size * 0.25}" r="${size * 0.43}" fill="${plant.color}" opacity=".88"/>
        <circle cx="${size * 0.6}" cy="${-size * 0.08}" r="${size * 0.34}" fill="${plant.color}" opacity=".75"/>
        <circle cx="${-size * 0.05}" cy="${-size * 0.7}" r="${size * 0.28}" fill="${plant.color}"/>
        <text x="0" y="${textY}" text-anchor="middle">${escapeHtml(label)}</text>
      </g>
    `;
  }

  return `
    <g class="svg-plant" transform="translate(${x},${y})">
      <path d="M0 ${size * 0.7} C-3 0 4 ${-stemHeight * 0.5} 0 ${-stemHeight}" stroke="${plant.color}" class="stem"/>
      <circle cx="0" cy="${-stemHeight}" r="${size * 0.5}" fill="${plant.color}"/>
      <circle cx="${size * 0.32}" cy="${-stemHeight - size * 0.28}" r="${size * 0.35}" fill="${plant.color}" opacity=".9"/>
      <circle cx="${-size * 0.32}" cy="${-stemHeight - size * 0.24}" r="${size * 0.34}" fill="${plant.color}" opacity=".78"/>
      <circle cx="0" cy="${-stemHeight}" r="${size * 0.13}" fill="#f2d88b"/>
      <ellipse cx="-4" cy="${-stemHeight * 0.48}" rx="${size * 0.34}" ry="${size * 0.15}" fill="#6f9072" transform="rotate(-28)"/>
      <text x="0" y="${textY}" text-anchor="middle">${escapeHtml(label)}</text>
    </g>
  `;
}

function renderLayout(result) {
  const placements = [
    [105, 270, 1.0],
    [205, 225, 0.92],
    [315, 290, 1.12],
    [425, 220, 0.95],
    [530, 275, 1.05],
    [160, 130, 0.78],
    [300, 120, 0.86],
    [455, 135, 0.8],
    [610, 155, 0.75],
  ];
  const svgPlants = result.palette
    .slice(0, placements.length)
    .sort((a, b) => b.plant.height - a.plant.height)
    .map((item, index) => plantSvgShape(item, ...placements[index]))
    .join("");

  return `
    <svg class="garden-layout" viewBox="0 0 680 360" role="img" aria-label="推荐植物的示意性花境布局">
      <defs>
        <linearGradient id="bedGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#e8dec1"/>
          <stop offset="1" stop-color="#cbcaaa"/>
        </linearGradient>
        <pattern id="soilDots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="5" r="1.1" fill="#927f5a" opacity=".22"/>
          <circle cx="16" cy="18" r=".8" fill="#927f5a" opacity=".17"/>
        </pattern>
      </defs>
      <path d="M40 300 C30 196 102 54 316 48 C524 42 653 132 646 257 C638 347 477 339 326 338 C176 336 51 355 40 300Z" fill="url(#bedGradient)"/>
      <path d="M40 300 C30 196 102 54 316 48 C524 42 653 132 646 257 C638 347 477 339 326 338 C176 336 51 355 40 300Z" fill="url(#soilDots)"/>
      <path d="M67 287 C67 209 134 96 320 83 C503 70 605 150 607 245" fill="none" stroke="#768c6f" stroke-width="1.5" stroke-dasharray="4 8" opacity=".55"/>
      <path d="M645 285 C642 240 599 214 566 198" fill="none" stroke="#b58e66" stroke-width="9" stroke-linecap="round" opacity=".6"/>
      <text x="52" y="42" class="layout-note">BACK / 后景</text>
      <text x="554" y="330" class="layout-note">FRONT / 前景</text>
      ${svgPlants}
    </svg>
  `;
}

function renderCalendar(result) {
  const seasonNames = ["冬季", "春季", "夏季", "秋季"];
  const groups = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [10, 11, 12],
  ];
  return groups.map((months, index) => `
    <article class="calendar-season">
      <div class="calendar-season-head">
        <span>0${index + 1}</span>
        <h4>${seasonNames[index]}</h4>
      </div>
      ${months.map((month) => {
        const item = result.calendar[month - 1];
        return `
          <div class="calendar-month">
            <strong>${item.name}</strong>
            <div>
              <span>${item.blooming.length ? `赏：${escapeHtml(item.blooming.join(" · "))}` : "赏：观叶与结构"}</span>
              <p>${escapeHtml(item.tasks)}</p>
            </div>
          </div>
        `;
      }).join("")}
    </article>
  `).join("");
}

function renderResult(result) {
  latestResult = result;
  const { metrics } = result;
  const input = result.input;
  results.innerHTML = `
    <div class="result-heading">
      <div>
        <span class="panel-index">02 / 推演结果</span>
        <h3>${escapeHtml(result.city.name)} · ${escapeHtml(EXPOSURE_LABELS[input.exposure])}花境</h3>
        <p>${escapeHtml(result.summary)}</p>
      </div>
      <div class="score-seal ${scoreTone(metrics.match)}">
        <svg viewBox="0 0 104 104" aria-hidden="true">
          <circle cx="52" cy="52" r="44"></circle>
          <circle class="score-progress" cx="52" cy="52" r="44" stroke-dasharray="${(276 * metrics.match / 100).toFixed(1)} 276"></circle>
        </svg>
        <div><strong>${metrics.match}</strong><span>综合适配</span></div>
      </div>
    </div>

    <div class="result-actions">
      <button type="button" class="button button-outline" id="csvButton">↓ 下载配置单 .csv</button>
      <button type="button" class="button button-ghost" id="printButton">打印 / 保存 PDF</button>
      <span class="saved-note" id="savedNote">场地数据已保存到本地</span>
    </div>

    <div class="metric-grid">
      ${renderMetric("全年有花", metrics.bloomMonthsCovered, "个月", `常绿/观叶结构覆盖 ${metrics.structureMonthsCovered} 个月`, 1)}
      ${renderMetric("建议株数", metrics.totalPlants, "株", `涉及 ${result.palette.length} 类植物`, 2)}
      ${renderMetric("初始材料", `¥${metrics.initialCost.toLocaleString("zh-CN")}`, "", `预算上限 ¥${(input.area * input.budget).toLocaleString("zh-CN")}`, 3)}
      ${renderMetric("生态指数", metrics.ecologyScore, "/100", `传粉评分 ${metrics.averagePollinator}/5`, 4)}
    </div>

    <section class="result-block season-block">
      <div class="block-heading">
        <div>
          <span class="panel-index">季相节律</span>
          <h3>一年十二月的花与结构</h3>
        </div>
        <div class="legend"><span class="bloom-legend"></span>开花丰富度 <span class="structure-legend"></span>常绿/叶结构</div>
      </div>
      <div class="season-chart">${renderSeasonChart(result)}</div>
    </section>

    <section class="result-block palette-block">
      <div class="block-heading">
        <div>
          <span class="panel-index">植物编组</span>
          <h3>为这个场地选出的植物阵容</h3>
        </div>
        <p>卡片分数表示该植物相对当前场地约束的适配程度，不是成活率。</p>
      </div>
      <div class="plant-grid">${renderPalette(result)}</div>
    </section>

    <section class="result-block layout-block">
      <div class="block-heading">
        <div>
          <span class="panel-index">空间放样</span>
          <h3>前低后高的示意种植结构</h3>
        </div>
        <p>用于讨论层次与配植关系，不替代按实际比例绘制的施工放样图。</p>
      </div>
      <div class="layout-shell">
        ${renderLayout(result)}
        <aside class="layout-notes">
          <div><span>层次</span><p>按株高形成后景、中景与前缘，避免高株完全遮挡低株。</p></div>
          <div><span>节奏</span><p>同一植物以 ${result.palette[0]?.quantity || 3}–${Math.max(...result.palette.map((item) => item.quantity))} 株成组重复，减少“样品园”感。</p></div>
          <div><span>下一步</span><p>按现场尺寸复核冠幅，将植物数量换算为实际放样间距。</p></div>
        </aside>
      </div>
    </section>

    <section class="result-block calendar-block">
      <div class="block-heading">
        <div>
          <span class="panel-index">养护剧本</span>
          <h3>这套方案如何被照料</h3>
        </div>
        <p>预计月度养护约 ${metrics.monthlyCare} 小时 · 年灌溉估算 ${metrics.annualWater.toLocaleString("zh-CN")} L</p>
      </div>
      <div class="calendar-grid">${renderCalendar(result)}</div>
    </section>

    <section class="insight-strip">
      <div>
        <span class="panel-index">AI 时代的园艺判断</span>
        <h3>把经验变成可迭代的设计工具</h3>
      </div>
      <div class="insight-list">
        ${result.warnings.map((warning, index) => `
          <p><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(warning)}</p>
        `).join("")}
      </div>
    </section>
  `;

  bindResultActions();
  persistValues(input);
}

function bindResultActions() {
  document.querySelector("#csvButton")?.addEventListener("click", () => downloadCsv());
  document.querySelector("#printButton")?.addEventListener("click", () => window.print());
}

function downloadCsv() {
  if (!latestResult) return;
  const csv = `\uFEFF${resultToCsv(latestResult)}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `花候_${latestResult.city.name}_${latestResult.input.area}平米_花境配置单.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("配置单已下载，可用 Excel 打开。");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function persistValues(values) {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    localStorage.setItem("flowercast-site", JSON.stringify(values));
  }, 160);
}

function generate(values = formValues()) {
  const result = evaluateGarden(values);
  renderResult(result);
}

function applyPreset(id) {
  activePreset = id;
  setFormValues(PRESETS[id].values);
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.classList.toggle("active", button.dataset.preset === id);
  });
  generate(PRESETS[id].values);
}

populateControls();
updateRangeOutputs();

const saved = localStorage.getItem("flowercast-site");
if (saved) {
  try {
    setFormValues(JSON.parse(saved));
  } catch {
    setFormValues(PRESETS.balcony.values);
  }
} else {
  setFormValues(PRESETS.balcony.values);
}

presetList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-preset]");
  if (button) applyPreset(button.dataset.preset);
});

form.addEventListener("input", updateRangeOutputs);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  activePreset = "";
  document.querySelectorAll("[data-preset]").forEach((button) => button.classList.remove("active"));
  generate();
  showToast("花境方案已在本地重新推演。");
});

document.querySelector("#resetButton").addEventListener("click", () => {
  localStorage.removeItem("flowercast-site");
  applyPreset("balcony");
  showToast("已恢复半阴小阳台场景。");
});

generate();
