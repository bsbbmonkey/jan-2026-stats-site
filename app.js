const DATA = window.JAN_STATS_DATA;
const OFFICIAL = window.OFFICIAL_MONTHLY_DATA || window.OFFICIAL_APRIL_DATA;

const state = {
  chart: "overview",
  officialChart: "categories",
  officialMonthIndex: null,
  sheet: null,
  query: "",
};

const chartDefs = [
  { id: "overview", label: "品項總覽" },
  { id: "bikeCountries", label: "整車國別" },
  { id: "ebikeCountries", label: "電輔車國別" },
  { id: "partsExport", label: "零件出口" },
];

const officialChartDefs = [
  { id: "categories", label: "品項比較" },
  { id: "trend", label: "13月趨勢" },
  { id: "parts", label: "零件排行" },
];

function qs(selector) {
  return document.querySelector(selector);
}

function create(tag, attrs = {}, text = "") {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === "className") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else node.setAttribute(key, value);
  });
  if (text) node.textContent = text;
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

function formatNumber(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString("zh-TW", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatCurrency(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  const n = Number(value);
  if (Math.abs(n) >= 1_000_000) return `US$${formatNumber(n / 1_000_000, 2)}M`;
  return `US$${formatNumber(n, 0)}`;
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return `${Number(value) >= 0 ? "+" : ""}${(Number(value) * 100).toFixed(1)}%`;
}

function formatOfficialCurrency(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return `US$${formatNumber(value, digits)}M`;
}

function formatOfficialPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(1)}%`;
}

function deltaClass(value) {
  if (value == null || Number.isNaN(Number(value))) return "";
  if (Number(value) > 0) return "up";
  if (Number(value) < 0) return "down";
  return "";
}

function renderHeader() {
  const period = OFFICIAL ? officialDate() : "";
  const officialText = period ? `｜官方${period}資料已更新` : "";
  qs("#sourceBadge").textContent = `${DATA.sourceFile}｜${DATA.period}${officialText}｜資料來源：${DATA.sourceNote}`;
  qs("#footerSource").textContent = OFFICIAL
    ? `資料來源：${DATA.sourceNote}；${OFFICIAL.sourceName}（${OFFICIAL.seriesPeriod || period}）`
    : `資料來源：${DATA.sourceNote}｜由 Excel 正本資料生成`;
}

function renderStats() {
  const grid = qs("#statsGrid");
  grid.replaceChildren();

  DATA.dashboard.cards.forEach((card) => {
    const item = create("article", { className: "stat" });
    item.append(create("div", { className: "lbl" }, card.label));
    item.append(create("div", { className: "val" }, card.value));
    item.append(create("div", { className: `sub ${deltaClass(card.deltaValue)}` }, card.sub));
    grid.append(item);
  });
}

function getChartConfig(id) {
  if (id === "bikeCountries") {
    return {
      title: "整車出口主要國家 TOP 10",
      subtitle: "左軸＝出口金額（US$）｜右軸＝平均單價（US$/台）",
      labels: DATA.dashboard.topDestinations.bike.map((d) => d.name),
      bars: DATA.dashboard.topDestinations.bike.map((d) => d.amount),
      line: DATA.dashboard.topDestinations.bike.map((d) => d.avgPrice),
      barLabel: "出口金額",
      lineLabel: "平均單價",
    };
  }

  if (id === "ebikeCountries") {
    return {
      title: "電輔車出口主要國家 TOP 10",
      subtitle: "左軸＝出口金額（US$）｜右軸＝平均單價（US$/台）",
      labels: DATA.dashboard.topDestinations.ebike.map((d) => d.name),
      bars: DATA.dashboard.topDestinations.ebike.map((d) => d.amount),
      line: DATA.dashboard.topDestinations.ebike.map((d) => d.avgPrice),
      barLabel: "出口金額",
      lineLabel: "平均單價",
    };
  }

  if (id === "partsExport") {
    return {
      title: "自行車主要零件出口品項 TOP 10",
      subtitle: "單位：US$｜依 2026 年 1-1 月出口金額排序",
      labels: DATA.dashboard.topParts.export.map((d) => d.name),
      bars: DATA.dashboard.topParts.export.map((d) => d.amount),
      line: null,
      barLabel: "出口金額",
    };
  }

  return {
    title: "主要品項進出口金額總覽",
    subtitle: "單位：US$｜整車、電輔車、折疊車、其他車與零件進出口",
    labels: DATA.dashboard.categoryMetrics.map((d) => d.name),
    bars: DATA.dashboard.categoryMetrics.map((d) => d.amount),
    line: null,
    barLabel: "金額",
  };
}

function niceMax(value) {
  if (!value || value <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const scaled = value / power;
  const step = scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * power;
}

function linePath(points) {
  let path = "";
  points.forEach((pt, index) => {
    if (!pt) return;
    path += `${index === 0 || !points[index - 1] ? "M" : "L"} ${pt.x} ${pt.y} `;
  });
  return path.trim();
}

function renderChart() {
  const config = getChartConfig(state.chart);
  qs("#chartTitle").textContent = config.title;
  qs("#chartSubtitle").textContent = config.subtitle;

  const svg = qs("#mainChart");
  svg.replaceChildren();
  svg.setAttribute("viewBox", "0 0 1120 500");
  svg.setAttribute("preserveAspectRatio", "none");

  const width = 1120;
  const height = 500;
  const margin = { top: 38, right: config.line ? 86 : 36, bottom: 105, left: 86 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const plotBottom = margin.top + plotH;
  const maxBar = niceMax(Math.max(...config.bars, 1));
  const maxLine = config.line ? niceMax(Math.max(...config.line.filter(Boolean), 1)) : null;
  const count = config.labels.length || 1;
  const slot = plotW / count;
  const barWidth = Math.max(16, Math.min(54, slot * 0.54));

  const defs = svgEl("defs");
  const grad = svgEl("linearGradient", { id: "barGrad", x1: "0", x2: "0", y1: "0", y2: "1" });
  grad.append(svgEl("stop", { offset: "0%", "stop-color": "#1a6ebd", "stop-opacity": "0.92" }));
  grad.append(svgEl("stop", { offset: "100%", "stop-color": "#2c6fad", "stop-opacity": "0.62" }));
  defs.append(grad);
  svg.append(defs);

  for (let i = 0; i <= 5; i += 1) {
    const y = margin.top + (plotH * i) / 5;
    const value = maxBar * (1 - i / 5);
    svg.append(svgEl("line", {
      x1: margin.left,
      x2: width - margin.right,
      y1: y,
      y2: y,
      stroke: "#e6ecf5",
      "stroke-width": 1,
    }));
    const tick = svgEl("text", { x: margin.left - 10, y: y + 4, "text-anchor": "end", class: "tick-label" });
    tick.textContent = formatCurrency(value).replace("US$", "$");
    svg.append(tick);
  }

  svg.append(svgEl("line", {
    x1: margin.left,
    x2: margin.left,
    y1: margin.top,
    y2: plotBottom,
    stroke: "#b8c4d5",
  }));
  svg.append(svgEl("line", {
    x1: margin.left,
    x2: width - margin.right,
    y1: plotBottom,
    y2: plotBottom,
    stroke: "#b8c4d5",
  }));

  if (config.line) {
    for (let i = 0; i <= 4; i += 1) {
      const y = margin.top + (plotH * i) / 4;
      const value = maxLine * (1 - i / 4);
      const tick = svgEl("text", { x: width - margin.right + 12, y: y + 4, class: "tick-label" });
      tick.textContent = `$${formatNumber(value, 0)}`;
      svg.append(tick);
    }
    svg.append(svgEl("line", {
      x1: width - margin.right,
      x2: width - margin.right,
      y1: margin.top,
      y2: plotBottom,
      stroke: "#d7a29c",
    }));
  }

  const linePoints = [];
  config.labels.forEach((label, index) => {
    const xCenter = margin.left + slot * index + slot / 2;
    const barValue = config.bars[index] || 0;
    const barHeight = (barValue / maxBar) * plotH;
    const x = xCenter - barWidth / 2;
    const y = plotBottom - barHeight;

    const bar = svgEl("rect", {
      x,
      y,
      width: barWidth,
      height: Math.max(1, barHeight),
      rx: 4,
      fill: "url(#barGrad)",
    });
    bar.append(svgEl("title"));
    bar.querySelector("title").textContent = `${label}：${formatCurrency(barValue)}`;
    svg.append(bar);

    const labelText = svgEl("text", {
      x: xCenter,
      y: Math.max(margin.top + 12, y - 8),
      "text-anchor": "middle",
      class: "bar-label",
      fill: "#1a3a6e",
    });
    labelText.textContent = formatCurrency(barValue).replace("US$", "$");
    svg.append(labelText);

    const xLabel = svgEl("text", {
      x: xCenter - 2,
      y: plotBottom + 22,
      transform: `rotate(35 ${xCenter - 2} ${plotBottom + 22})`,
      "text-anchor": "start",
      class: "x-label",
    });
    xLabel.textContent = label;
    svg.append(xLabel);

    if (config.line && config.line[index]) {
      const lineValue = config.line[index];
      linePoints[index] = {
        x: xCenter,
        y: plotBottom - (lineValue / maxLine) * plotH,
        value: lineValue,
        label,
      };
    } else {
      linePoints[index] = null;
    }
  });

  if (config.line) {
    const path = svgEl("path", {
      d: linePath(linePoints),
      fill: "none",
      stroke: "#c0392b",
      "stroke-width": 2.6,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    svg.append(path);

    linePoints.filter(Boolean).forEach((pt, index) => {
      svg.append(svgEl("circle", {
        cx: pt.x,
        cy: pt.y,
        r: 4.6,
        fill: "#c0392b",
        stroke: "#fff",
        "stroke-width": 1.5,
      }));

      if (index % 2 === 0 || config.labels.length <= 8) {
        const text = `$${formatNumber(pt.value, 0)}`;
        const boxW = Math.max(42, text.length * 6.2 + 10);
        svg.append(svgEl("rect", {
          x: pt.x - boxW / 2,
          y: pt.y + 10,
          width: boxW,
          height: 17,
          fill: "rgba(192,57,43,0.08)",
          stroke: "#c0392b",
        }));
        const label = svgEl("text", {
          x: pt.x,
          y: pt.y + 23,
          "text-anchor": "middle",
          class: "point-label",
          fill: "#c0392b",
        });
        label.textContent = text;
        svg.append(label);
      }
    });
  }

  renderLegend(config);
}

function renderChartTabs() {
  const tabs = qs("#chartTabs");
  tabs.replaceChildren();
  chartDefs.forEach((item) => {
    const button = create("button", { type: "button", className: item.id === state.chart ? "active" : "" }, item.label);
    button.addEventListener("click", () => {
      state.chart = item.id;
      renderChartTabs();
      renderChart();
    });
    tabs.append(button);
  });
}

function renderLegend(config) {
  const legend = qs("#chartLegend");
  legend.replaceChildren();
  const bar = create("div", { className: "leg" });
  bar.append(create("span", { className: "leg-line", style: "" }));
  bar.querySelector(".leg-line").style.background = "#1a6ebd";
  bar.append(document.createTextNode(config.barLabel));
  legend.append(bar);

  if (config.line) {
    const line = create("div", { className: "leg" });
    line.append(create("span", { className: "leg-line" }));
    line.querySelector(".leg-line").style.background = "#c0392b";
    line.append(document.createTextNode(config.lineLabel));
    legend.append(line);
  }
}

function officialColor(id, index = 0) {
  const colors = {
    trackedTotal: "#4a494b",
    completeBike: "#1a6ebd",
    ebike: "#58a5bf",
    folding: "#b28500",
    parts: "#2d7a43",
  };
  const fallback = ["#1a6ebd", "#58a5bf", "#2d7a43", "#b28500", "#6c40ce"];
  return colors[id] || fallback[index % fallback.length];
}

function officialDefaultIndex() {
  if (!OFFICIAL?.dates?.length) return 0;
  if (Number.isInteger(OFFICIAL.targetIndex)) return OFFICIAL.targetIndex;
  return OFFICIAL.dates.length - 1;
}

function officialIndex() {
  const max = Math.max((OFFICIAL?.dates?.length || 1) - 1, 0);
  const index = Number.isInteger(state.officialMonthIndex) ? state.officialMonthIndex : officialDefaultIndex();
  return Math.min(Math.max(index, 0), max);
}

function officialDate(index = officialIndex()) {
  return OFFICIAL?.dates?.[index] || OFFICIAL?.period || "";
}

function shortOfficialDate(date) {
  const text = String(date || "");
  return text.replace("年", "/").replace("月", "");
}

function officialMetric(item, index = officialIndex()) {
  const millionUsd = item?.series?.[index] ?? item?.aprilMillionUsd ?? 0;
  const yoyPercent = item?.yoySeries?.[index] ?? item?.yoyPercent ?? null;
  return {
    ...item,
    millionUsd,
    usd: Math.round(Number(millionUsd || 0) * 1_000_000),
    yoyPercent,
  };
}

function officialCategoryItems(index = officialIndex()) {
  return (OFFICIAL?.categories || []).map((item, itemIndex) => ({
    ...officialMetric(item, index),
    color: officialColor(item.id, itemIndex),
  }));
}

function officialCardItems(index = officialIndex()) {
  return [
    { ...officialMetric(OFFICIAL.trackedTotal, index), color: officialColor("trackedTotal") },
    ...officialCategoryItems(index),
  ];
}

function officialPartItems(index = officialIndex()) {
  const records = (OFFICIAL?.records || OFFICIAL?.topParts || []).filter((item) => {
    if (item.group) return item.group === "零件";
    return Array.isArray(item.series) || item.aprilMillionUsd != null;
  });
  return records
    .map((item) => officialMetric(item, index))
    .sort((a, b) => (b.millionUsd || 0) - (a.millionUsd || 0));
}

function renderOfficialSection() {
  const panel = qs("#officialPanel");
  if (!OFFICIAL) {
    panel.hidden = true;
    return;
  }

  const period = officialDate();
  qs("#officialTitle").textContent = `官方 ${period}出口資料`;
  qs("#officialMeta").textContent = `${OFFICIAL.sourceName}｜${OFFICIAL.seriesPeriod || period}｜目前顯示 ${period}｜單位：${OFFICIAL.unit}`;
  qs("#officialSourceLink").href = OFFICIAL.requestedPageUrl || OFFICIAL.sourceUrl;
  renderOfficialMonthSelect();
  renderOfficialStats();
  renderOfficialChartTabs();
  renderOfficialChart();
  renderOfficialRanking();
  renderOfficialNote();
}

function renderOfficialMonthSelect() {
  const select = qs("#officialMonthSelect");
  if (!select) return;
  const currentIndex = officialIndex();
  select.replaceChildren();
  (OFFICIAL.dates || []).forEach((date, index) => {
    select.append(create("option", { value: String(index) }, date));
  });
  select.value = String(currentIndex);
  select.onchange = (event) => {
    state.officialMonthIndex = Number(event.target.value);
    renderHeader();
    renderOfficialSection();
  };
}

function renderOfficialStats() {
  const grid = qs("#officialStats");
  grid.replaceChildren();
  const cards = officialCardItems();

  cards.forEach((item) => {
    const card = create("article", { className: "official-stat" });
    card.append(create("div", { className: "lbl" }, item.label));
    card.append(create("div", { className: "val" }, formatOfficialCurrency(item.millionUsd)));
    const sub = item.subset
      ? `整車子項｜YoY ${formatOfficialPercent(item.yoyPercent)}`
      : `YoY ${formatOfficialPercent(item.yoyPercent)}`;
    card.append(create("div", { className: `sub ${deltaClass(item.yoyPercent)}` }, sub));
    grid.append(card);
  });
}

function renderOfficialChartTabs() {
  const tabs = qs("#officialChartTabs");
  tabs.replaceChildren();
  officialChartDefs.forEach((item) => {
    const button = create("button", {
      type: "button",
      className: item.id === state.officialChart ? "active" : "",
    }, item.label);
    button.addEventListener("click", () => {
      state.officialChart = item.id;
      renderOfficialChartTabs();
      renderOfficialChart();
    });
    tabs.append(button);
  });
}

function renderOfficialChart() {
  if (!OFFICIAL) return;
  const svg = qs("#officialChart");
  const period = officialDate();
  svg.replaceChildren();
  svg.setAttribute("preserveAspectRatio", "none");

  if (state.officialChart === "trend") {
    qs("#officialChartTitle").textContent = "官方出口 13 個月趨勢";
    qs("#officialChartSubtitle").textContent = `${OFFICIAL.seriesPeriod}｜目前標示 ${period}｜單位：百萬美元`;
    renderOfficialTrendChart(svg);
    return;
  }

  if (state.officialChart === "parts") {
    qs("#officialChartTitle").textContent = `官方 ${period}主要零件出口排行`;
    qs("#officialChartSubtitle").textContent = `依 ${period}出口金額排序｜單位：百萬美元`;
    renderOfficialPartsChart(svg);
    return;
  }

  qs("#officialChartTitle").textContent = `官方 ${period}出口品項比較`;
  qs("#officialChartSubtitle").textContent = "整車類、電輔車、折疊車與主要零件｜單位：百萬美元";
  renderOfficialCategoryChart(svg);
}

function renderOfficialCategoryChart(svg) {
  const items = officialCategoryItems();
  const width = 1120;
  const height = 430;
  const margin = { top: 38, right: 34, bottom: 98, left: 82 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const plotBottom = margin.top + plotH;
  const maxValue = niceMax(Math.max(...items.map((item) => item.millionUsd || 0), 1));
  const slot = plotW / Math.max(items.length, 1);
  const barWidth = Math.min(118, slot * 0.48);

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  drawOfficialGrid(svg, width, margin, plotH, maxValue);

  items.forEach((item, index) => {
    const xCenter = margin.left + slot * index + slot / 2;
    const value = item.millionUsd || 0;
    const barHeight = (value / maxValue) * plotH;
    const x = xCenter - barWidth / 2;
    const y = plotBottom - barHeight;
    const color = item.color;

    const bar = svgEl("rect", { x, y, width: barWidth, height: Math.max(1, barHeight), rx: 4, fill: color, opacity: "0.88" });
    bar.append(svgEl("title"));
    bar.querySelector("title").textContent = `${item.label} ${officialDate()}：${formatOfficialCurrency(value)}，YoY ${formatOfficialPercent(item.yoyPercent)}`;
    svg.append(bar);

    const amount = svgEl("text", { x: xCenter, y: Math.max(margin.top + 14, y - 10), "text-anchor": "middle", class: "bar-label", fill: color });
    amount.textContent = formatOfficialCurrency(value);
    svg.append(amount);

    const label = svgEl("text", { x: xCenter, y: plotBottom + 26, "text-anchor": "middle", class: "x-label" });
    label.textContent = item.label;
    svg.append(label);

    const yoy = svgEl("text", {
      x: xCenter,
      y: plotBottom + 48,
      "text-anchor": "middle",
      class: `svg-yoy ${deltaClass(item.yoyPercent)}`,
    });
    yoy.textContent = `YoY ${formatOfficialPercent(item.yoyPercent)}`;
    svg.append(yoy);
  });

  renderOfficialLegend(items.map((item) => ({ label: item.label, color: item.color })));
}

function drawOfficialGrid(svg, width, margin, plotH, maxValue) {
  const plotBottom = margin.top + plotH;
  for (let i = 0; i <= 4; i += 1) {
    const y = margin.top + (plotH * i) / 4;
    const value = maxValue * (1 - i / 4);
    svg.append(svgEl("line", {
      x1: margin.left,
      x2: width - margin.right,
      y1: y,
      y2: y,
      stroke: "#e6ecf5",
      "stroke-width": 1,
    }));
    const tick = svgEl("text", { x: margin.left - 10, y: y + 4, "text-anchor": "end", class: "tick-label" });
    tick.textContent = formatOfficialCurrency(value, 0).replace("US$", "$");
    svg.append(tick);
  }
  svg.append(svgEl("line", { x1: margin.left, x2: width - margin.right, y1: plotBottom, y2: plotBottom, stroke: "#b8c4d5" }));
  svg.append(svgEl("line", { x1: margin.left, x2: margin.left, y1: margin.top, y2: plotBottom, stroke: "#b8c4d5" }));
}

function renderOfficialTrendChart(svg) {
  const width = 1120;
  const height = 430;
  const margin = { top: 38, right: 118, bottom: 70, left: 82 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const plotBottom = margin.top + plotH;
  const seriesItems = officialCategoryItems().filter((item) => ["completeBike", "ebike", "parts"].includes(item.id));
  const indexes = (OFFICIAL.dates || []).map((_, index) => index);
  const selectedIndex = officialIndex();
  const maxValue = niceMax(Math.max(...seriesItems.flatMap((item) => indexes.map((idx) => item.series[idx] || 0)), 1));
  const count = indexes.length;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  drawOfficialGrid(svg, width, margin, plotH, maxValue);

  const selectedX = margin.left + (plotW * selectedIndex) / Math.max(count - 1, 1);
  svg.append(svgEl("line", {
    x1: selectedX,
    x2: selectedX,
    y1: margin.top,
    y2: plotBottom,
    stroke: "#9fb1c6",
    "stroke-width": 1.4,
    "stroke-dasharray": "5 5",
  }));

  (OFFICIAL.dates || []).forEach((date, index) => {
    const x = margin.left + (plotW * index) / Math.max(count - 1, 1);
    const label = svgEl("text", { x, y: plotBottom + 28, "text-anchor": "middle", class: "x-label" });
    label.textContent = index === 0 || index === selectedIndex || index === count - 1 || index % 2 === 0
      ? shortOfficialDate(date)
      : "";
    svg.append(label);
  });

  seriesItems.forEach((item) => {
    const points = indexes.map((idx, index) => {
      const value = item.series[idx] || 0;
      return {
        x: margin.left + (plotW * index) / Math.max(count - 1, 1),
        y: plotBottom - (value / maxValue) * plotH,
        value,
      };
    });

    svg.append(svgEl("path", {
      d: linePath(points),
      fill: "none",
      stroke: item.color,
      "stroke-width": 3,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }));

    points.forEach((pt, index) => {
      const isSelected = index === selectedIndex;
      const dot = svgEl("circle", {
        cx: pt.x,
        cy: pt.y,
        r: isSelected ? 6.3 : 3.9,
        fill: item.color,
        stroke: "#fff",
        "stroke-width": isSelected ? 2.2 : 1.5,
      });
      dot.append(svgEl("title"));
      dot.querySelector("title").textContent = `${item.label} ${OFFICIAL.dates[index]}：${formatOfficialCurrency(pt.value)}`;
      svg.append(dot);
    });

    const last = points[points.length - 1];
    const label = svgEl("text", { x: last.x + 12, y: last.y + 4, class: "point-label", fill: item.color });
    label.textContent = item.label;
    svg.append(label);
  });

  renderOfficialLegend(seriesItems.map((item) => ({ label: item.label, color: item.color })));
}

function renderOfficialPartsChart(svg) {
  const items = officialPartItems().slice(0, 10);
  const width = 1120;
  const rowH = 42;
  const height = 86 + items.length * rowH;
  const margin = { top: 28, right: 120, bottom: 30, left: 260 };
  const plotW = width - margin.left - margin.right;
  const maxValue = Math.max(...items.map((item) => item.millionUsd || 0), 1);

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  items.forEach((item, index) => {
    const y = margin.top + index * rowH;
    const barW = ((item.millionUsd || 0) / maxValue) * plotW;
    const color = index < 3 ? "#1a6ebd" : "#58a5bf";

    const rank = svgEl("text", { x: 22, y: y + 24, class: "tick-label" });
    rank.textContent = String(index + 1).padStart(2, "0");
    svg.append(rank);

    const label = svgEl("text", { x: 58, y: y + 24, class: "x-label" });
    label.textContent = truncateLabel(item.label, 16);
    svg.append(label);

    const code = svgEl("text", { x: 58, y: y + 39, class: "part-code" });
    code.textContent = item.code;
    svg.append(code);

    const bar = svgEl("rect", { x: margin.left, y: y + 8, width: Math.max(1, barW), height: 22, rx: 4, fill: color, opacity: "0.86" });
    bar.append(svgEl("title"));
    bar.querySelector("title").textContent = `${item.officialName} ${officialDate()}：${formatOfficialCurrency(item.millionUsd)}，YoY ${formatOfficialPercent(item.yoyPercent)}`;
    svg.append(bar);

    const value = svgEl("text", { x: margin.left + barW + 10, y: y + 24, class: "bar-label", fill: "#1a3a6e" });
    value.textContent = formatOfficialCurrency(item.millionUsd);
    svg.append(value);

    const yoy = svgEl("text", { x: width - 28, y: y + 24, "text-anchor": "end", class: `svg-yoy ${deltaClass(item.yoyPercent)}` });
    yoy.textContent = formatOfficialPercent(item.yoyPercent);
    svg.append(yoy);
  });

  renderOfficialLegend([
    { label: "前三大零件", color: "#1a6ebd" },
    { label: "其他零件", color: "#58a5bf" },
  ]);
}

function renderOfficialLegend(items) {
  const legend = qs("#officialLegend");
  legend.replaceChildren();
  items.forEach((item) => {
    const node = create("div", { className: "leg" });
    node.append(create("span", { className: "leg-line" }));
    node.querySelector(".leg-line").style.background = item.color;
    node.append(document.createTextNode(item.label));
    legend.append(node);
  });
}

function renderOfficialRanking() {
  const table = qs("#officialRankingTable");
  table.replaceChildren();
  qs("#officialRankingMeta").textContent = `依 ${officialDate()}出口金額排序`;
  const head = create("thead");
  const headRow = create("tr");
  ["品項", "金額", "YoY"].forEach((label) => headRow.append(create("th", {}, label)));
  head.append(headRow);
  table.append(head);

  const body = create("tbody");
  officialPartItems().slice(0, 12).forEach((item) => {
    const row = create("tr");
    const name = create("td");
    name.append(create("strong", {}, item.label));
    name.append(create("span", {}, item.code));
    row.append(name);
    row.append(create("td", { className: "num" }, formatOfficialCurrency(item.millionUsd)));
    row.append(create("td", { className: `num ${deltaClass(item.yoyPercent)}` }, formatOfficialPercent(item.yoyPercent)));
    body.append(row);
  });
  table.append(body);
}

function renderOfficialNote() {
  const items = officialCategoryItems();
  const bike = items.find((item) => item.id === "completeBike");
  const ebike = items.find((item) => item.id === "ebike");
  const parts = items.find((item) => item.id === "parts");
  qs("#officialNote").innerHTML = [
    `<strong>官方${officialDate()}重點：</strong>`,
    `整車類出口 ${formatOfficialCurrency(bike?.millionUsd)}，YoY ${formatOfficialPercent(bike?.yoyPercent)}；`,
    `電輔車出口 ${formatOfficialCurrency(ebike?.millionUsd)}，YoY ${formatOfficialPercent(ebike?.yoyPercent)}；`,
    `主要零件出口 ${formatOfficialCurrency(parts?.millionUsd)}，YoY ${formatOfficialPercent(parts?.yoyPercent)}。`,
    "折疊車為 87120010 旗下子項，僅作單獨觀察，未重複加計於追蹤品項合計。",
    OFFICIAL.sourceNote
  ].join(" ");
}

function truncateLabel(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function visibleSheets() {
  return DATA.sheets.filter((sheet) => sheet.state !== "hidden");
}

function cellText(cell) {
  if (!cell) return "";
  return String(cell.display ?? cell.value ?? "");
}

function rowMatches(row, query) {
  if (!query) return true;
  if (["title", "code", "header", "unit", "source"].includes(row.type)) return true;
  const needle = query.trim().toLowerCase();
  return row.cells.some((cell) => cellText(cell).toLowerCase().includes(needle));
}

function renderSheetTabs() {
  const tabs = qs("#sheetTabs");
  tabs.replaceChildren();
  visibleSheets().forEach((sheet) => {
    const button = create("button", { type: "button", className: sheet.name === state.sheet ? "active" : "" }, sheet.name.trim());
    button.addEventListener("click", () => {
      state.sheet = sheet.name;
      state.query = "";
      qs("#sheetSearch").value = "";
      renderSheetTabs();
      renderTable();
    });
    tabs.append(button);
  });
}

function renderTable() {
  const sheet = DATA.sheets.find((item) => item.name === state.sheet) || visibleSheets()[0];
  if (!sheet) return;
  state.sheet = sheet.name;

  qs("#sheetMeta").textContent = `${sheet.title || sheet.name}｜${sheet.rowCount} 列 x ${sheet.colCount} 欄`;

  const table = qs("#dataTable");
  table.replaceChildren();
  const body = create("tbody");
  const rows = sheet.rows.filter((row) => rowMatches(row, state.query));

  rows.forEach((row) => {
    const tr = create("tr", { className: `row-${row.type}` });
    const nonEmpty = row.cells.filter((cell) => cellText(cell)).length;

    if (row.type === "blank") {
      tr.append(create("td", { colspan: sheet.colCount }));
      body.append(tr);
      return;
    }

    if (["title", "code", "section", "source"].includes(row.type) && nonEmpty <= 1) {
      const tag = row.type === "source" ? "td" : "th";
      const cell = create(tag, { colspan: sheet.colCount }, row.cells.map(cellText).find(Boolean) || "");
      tr.append(cell);
      body.append(tr);
      return;
    }

    row.cells.forEach((cell, index) => {
      const tag = ["title", "code", "header", "unit", "section"].includes(row.type) ? "th" : "td";
      const node = create(tag, {}, cellText(cell));
      if (typeof cell?.value === "number") node.classList.add("num");
      node.dataset.col = String(index + 1);
      tr.append(node);
    });
    body.append(tr);
  });

  table.append(body);
}

function renderNote() {
  const m = DATA.dashboard.metrics;
  qs("#summaryNote").innerHTML = [
    "<strong>資料說明：</strong>",
    `2026 年 1 月整車出口 ${formatNumber(m.bike.quantity)} 台、${formatCurrency(m.bike.amount)}，平均單價 US$${formatNumber(m.bike.avgPrice, 2)}。`,
    `電輔車出口 ${formatNumber(m.ebike.quantity)} 台、${formatCurrency(m.ebike.amount)}；零件出口 ${formatCurrency(m.partsExport.amount)}。`,
    "表格保留 Excel 原始工作表結構，數字採用活頁簿快取顯示值。"
  ].join(" ");
}

function bindEvents() {
  qs("#sheetSearch").addEventListener("input", (event) => {
    state.query = event.target.value;
    renderTable();
  });
}

function boot() {
  if (!DATA) return;
  state.sheet = visibleSheets()[0]?.name || null;
  if (OFFICIAL) state.officialMonthIndex = officialDefaultIndex();
  renderHeader();
  renderStats();
  renderOfficialSection();
  renderChartTabs();
  renderChart();
  renderNote();
  renderSheetTabs();
  renderTable();
  bindEvents();
}

boot();
