import { jsPDF } from "jspdf";
import { GRID_MM, PRODUCTS } from "../planner/catalogue";
import {
  buildCoreView,
  TONE_LABELS,
  type CoreTone,
  type TapPin,
  type TapView,
} from "../planner/cores";
import {
  emergencySuffix,
  PINS_CONTRACTOR_NOTE,
  PINS_WARNING,
} from "../planner/engine";
import {
  formatM,
  formatMm,
  formatQty,
  quantity,
  type BomGroup,
  type BomRow,
  type GroupPlan,
  type Placement,
  type Run,
  type RunPlan,
  type Settings,
} from "../planner/types";
import { INTER_REGULAR, INTER_SEMIBOLD } from "./fonts";

export const PDF_CREATOR = "Developed by Mihaly Bartha";

export interface PdfInput {
  projectName: string;
  groups: BomGroup[];
  plans: GroupPlan[];
  notes: Record<string, string>;
  date: Date;
}

type Weight = "normal" | "bold";
type Align = "left" | "center" | "right";

interface TextOptions {
  weight?: Weight;
  color?: string;
  align?: Align;
  baseline?: "top" | "middle";
  spacing?: number;
}

interface Segment {
  height: number;
  draw: (top: number) => void;
}

interface Block {
  segments: Segment[];
  gap: number;
  continuation?: Segment;
}

const PT = 0.3528;
const LEFT = 14;
const RIGHT = 196;
const W = RIGHT - LEFT;
const FIRST_TOP = 14;
const TOP = 21;
const BOTTOM = 281;
const MAX_ROW_UNITS = 120;
const TRACK_HEIGHT = 4;
const ROW_HEIGHT = 17.2;

const INK = "#1f1f1d";
const TEXT = "#383834";
const MUTED = "#66665f";
const FAINT = "#96968e";
const LINE = "#d2d2cc";
const HAIR = "#e2e2dd";
const PANEL = "#f3f3f1";
const RED = "#e9002b";
const GREEN = "#30995a";
const AMBER = "#d18a06";
const CHIP_STROKE = "#262626";

const TONE_FILL: Record<CoreTone, string> = {
  live: "#93623e",
  emergency: GREEN,
  neutral: "#4779c8",
  earth: "#3d9a56",
  dali: "#9661c2",
  grey: "#a1a19a",
  spare: "#d9d9d3",
};

const KIND_FILL: Record<Placement["kind"], string> = {
  luminaire: "#252525",
  emergencyLuminaire: GREEN,
  sensor: AMBER,
  emergencyModule: "#176d3b",
  cover: "#eeeeea",
};

const KIND_LABEL: Record<Placement["kind"], string> = {
  luminaire: "Luminaire",
  emergencyLuminaire: "Emergency luminaire",
  sensor: "Sensor",
  emergencyModule: "Emergency module",
  cover: "Blank cover",
};

const lh = (size: number) => size * PT * 1.3;

class Pdf {
  readonly doc: jsPDF;

  constructor() {
    this.doc = new jsPDF({
      unit: "mm",
      format: "a4",
      orientation: "portrait",
      compress: true,
    });
    this.doc.addFileToVFS("Inter-Regular.ttf", INTER_REGULAR);
    this.doc.addFont("Inter-Regular.ttf", "Inter", "normal");
    this.doc.addFileToVFS("Inter-SemiBold.ttf", INTER_SEMIBOLD);
    this.doc.addFont("Inter-SemiBold.ttf", "Inter", "bold");
    this.doc.setFont("Inter", "normal");
    this.doc.setLineCap("butt");
  }

  font(size: number, weight: Weight = "normal", color = TEXT) {
    this.doc.setFont("Inter", weight);
    this.doc.setFontSize(size);
    this.doc.setTextColor(color);
  }

  width(value: string, size: number, weight: Weight = "normal", spacing = 0) {
    this.font(size, weight);
    return (
      this.doc.getTextWidth(value) +
      Math.max(0, Array.from(value).length - 1) * spacing
    );
  }

  wrap(value: string, width: number, size: number, weight: Weight = "normal") {
    this.font(size, weight);
    return value
      .split(/\r?\n/)
      .flatMap((part) =>
        part.trim()
          ? (this.doc.splitTextToSize(part.trim(), width) as string[])
          : [""],
      );
  }

  fit(value: string, width: number, size: number, weight: Weight = "normal") {
    if (this.width(value, size, weight) <= width) return value;
    let result = value;
    while (
      result.length > 1 &&
      this.width(`${result}\u2026`, size, weight) > width
    )
      result = result.slice(0, -1);
    return `${result.trimEnd()}\u2026`;
  }

  text(value: string, x: number, y: number, size: number, o: TextOptions = {}) {
    if (!value) return;
    this.font(size, o.weight ?? "normal", o.color ?? TEXT);
    this.doc.text(value, x, y, {
      align: o.align ?? "left",
      baseline: o.baseline ?? "top",
      charSpace: o.spacing || undefined,
    });
  }

  paragraph(
    lines: string[],
    x: number,
    y: number,
    size: number,
    o: TextOptions = {},
  ) {
    lines.forEach((line, index) => this.text(line, x, y + index * lh(size), size, o));
    return lines.length * lh(size);
  }

  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    fill?: string,
    stroke?: string,
    lineWidth = 0.2,
    radius = 0,
  ) {
    if (!fill && !stroke) return;
    if (fill) this.doc.setFillColor(fill);
    if (stroke) {
      this.doc.setDrawColor(stroke);
      this.doc.setLineWidth(lineWidth);
    }
    const style = fill && stroke ? "FD" : fill ? "F" : "S";
    if (radius > 0) this.doc.roundedRect(x, y, w, h, radius, radius, style);
    else this.doc.rect(x, y, w, h, style);
  }

  dashedRect(x: number, y: number, w: number, h: number, color: string) {
    this.doc.setLineDashPattern([0.6, 0.45], 0);
    this.rect(x, y, w, h, undefined, color, 0.18);
    this.doc.setLineDashPattern([], 0);
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    width = 0.2,
  ) {
    this.doc.setDrawColor(color);
    this.doc.setLineWidth(width);
    this.doc.line(x1, y1, x2, y2);
  }
}

class Flow {
  private top = FIRST_TOP;
  private y = FIRST_TOP;

  constructor(private readonly pdf: Pdf) {}

  private newPage() {
    this.pdf.doc.addPage("a4", "portrait");
    this.top = TOP;
    this.y = TOP;
  }

  private atTop() {
    return this.y <= this.top + 0.01;
  }

  place(block: Block) {
    const total = block.segments.reduce((sum, item) => sum + item.height, 0);
    if (!this.atTop() && this.y + total > BOTTOM) {
      if (total <= BOTTOM - TOP) this.newPage();
      else {
        const lead = block.segments
          .slice(0, 3)
          .reduce((sum, item) => sum + item.height, 0);
        if (this.y + lead > BOTTOM) this.newPage();
      }
    }
    block.segments.forEach((segment, index) => {
      if (this.y + segment.height > BOTTOM && !this.atTop()) {
        this.newPage();
        if (index > 0 && block.continuation) {
          block.continuation.draw(this.y);
          this.y += block.continuation.height;
        }
      }
      segment.draw(this.y);
      this.y += segment.height;
    });
    this.y += block.gap;
  }
}

function smallLabel(
  pdf: Pdf,
  value: string,
  x: number,
  y: number,
  align: Align = "left",
  color = FAINT,
) {
  pdf.text(value.toUpperCase(), x, y, 5, {
    weight: "bold",
    color,
    align,
    spacing: align === "left" ? 0.22 : 0,
  });
}

function toneBar(
  pdf: Pdf,
  x: number,
  y: number,
  w: number,
  h: number,
  tone: CoreTone,
) {
  if (tone !== "earth") {
    pdf.rect(x, y, w, h, TONE_FILL[tone]);
    return;
  }
  pdf.rect(x, y, w, h, "#e6d84a");
  for (let offset = 0, index = 0; offset < w; offset += 0.7, index++)
    if (index % 2 === 0)
      pdf.rect(x + offset, y, Math.min(0.7, w - offset), h, "#3d9a56");
}

function drawPin(pdf: Pdf, cx: number, cy: number, r: number, pin: TapPin) {
  const { doc } = pdf;
  if (!pin.active) {
    doc.setLineDashPattern([0.45, 0.4], 0);
    doc.setDrawColor("#bdbdb4");
    doc.setLineWidth(0.16);
    doc.circle(cx, cy, r, "S");
    doc.setLineDashPattern([], 0);
    return;
  }
  if (pin.tone === "earth") {
    doc.saveGraphicsState();
    doc.circle(cx, cy, r, null);
    doc.clip();
    doc.discardPath();
    toneBar(pdf, cx - r, cy - r, r * 2, r * 2, "earth");
    doc.restoreGraphicsState();
    return;
  }
  doc.setFillColor(TONE_FILL[pin.tone]);
  doc.circle(cx, cy, r, "F");
}

function earthSymbol(pdf: Pdf, cx: number, y: number) {
  pdf.line(cx, y, cx, y + 0.8, MUTED, 0.15);
  pdf.line(cx - 1.05, y + 0.8, cx + 1.05, y + 0.8, MUTED, 0.15);
  pdf.line(cx - 0.65, y + 1.25, cx + 0.65, y + 1.25, MUTED, 0.15);
  pdf.line(cx - 0.28, y + 1.7, cx + 0.28, y + 1.7, MUTED, 0.15);
}

function warningIcon(pdf: Pdf, x: number, y: number) {
  pdf.doc.setFillColor(AMBER);
  pdf.doc.triangle(x, y + 2.1, x + 2.4, y + 2.1, x + 1.2, y, "F");
  pdf.text("!", x + 1.2, y + 1.35, 4.4, {
    weight: "bold",
    color: "#ffffff",
    align: "center",
    baseline: "middle",
  });
}

function badgeWidth(pdf: Pdf, value: string, maxWidth: number) {
  const label = pdf.fit(value, maxWidth - 2.6, 5.8, "bold");
  return Math.max(6, pdf.width(label, 5.8, "bold") + 2.6);
}

function referenceBadge(
  pdf: Pdf,
  value: string,
  x: number,
  y: number,
  fill: string,
  maxWidth: number,
  minWidth = 6,
) {
  const label = pdf.fit(value, maxWidth - 2.6, 5.8, "bold");
  const w = Math.min(
    maxWidth,
    Math.max(minWidth, pdf.width(label, 5.8, "bold") + 2.6),
  );
  pdf.rect(x, y, w, 3.9, fill);
  pdf.text(label, x + w / 2, y + 1.95, 5.8, {
    weight: "bold",
    color: "#ffffff",
    align: "center",
    baseline: "middle",
  });
}

function bomBadge(pdf: Pdf, letter: string, x: number, y: number, h: number) {
  const value = `BOM ${letter}`;
  const w = pdf.width(value, 7, "bold") + 7;
  pdf.rect(x, y, w, h, "#fbecef");
  pdf.text(value, x + w / 2, y + h / 2, 7, {
    weight: "bold",
    color: RED,
    align: "center",
    baseline: "middle",
  });
  return w;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function settingChips(settings: Settings): [string, string][] {
  return [
    ["Cores", `${settings.cores} core`],
    ["Control", settings.control],
    [
      "Emergency",
      settings.emergency === "Battery"
        ? `Battery, ${settings.testing === "DST" ? "DST" : "manual test"}`
        : "CBS",
    ],
    [
      "Circuits",
      `${settings.lives} ${settings.lives === 1 ? "live" : "lives"}, ${settings.neutrals} ${settings.neutrals === 1 ? "neutral" : "neutrals"}`,
    ],
    ["End cap", settings.endCap],
    ["Mounting height", settings.height ? `${settings.height} m` : "Not set"],
    ["Suspension", `${settings.suspension} m`],
  ];
}

function titleSegment(pdf: Pdf, projectName: string, meta: string): Segment {
  const nameLines = pdf.wrap(projectName, W, 17, "bold");
  const metaTop = 4.8 + nameLines.length * lh(17) + 1.4;
  return {
    height: metaTop + lh(7) + 8,
    draw: (top) => {
      pdf.text("E-LINE PLANNER", LEFT, top, 6.4, {
        weight: "bold",
        color: RED,
        spacing: 0.6,
      });
      pdf.paragraph(nameLines, LEFT, top + 4.8, 17, {
        weight: "bold",
        color: INK,
      });
      pdf.text(meta, LEFT, top + metaTop, 7, { color: MUTED });
      pdf.line(
        LEFT,
        top + metaTop + lh(7) + 3.2,
        RIGHT,
        top + metaTop + lh(7) + 3.2,
        LINE,
        0.25,
      );
    },
  };
}

function sectionSegment(pdf: Pdf, number: string, title: string): Segment {
  return {
    height: 12,
    draw: (top) => {
      pdf.text(number, LEFT, top + 2.6, 8, { weight: "bold", color: RED });
      pdf.text(title, LEFT + 8, top + 1.2, 12.5, {
        weight: "bold",
        color: INK,
      });
    },
  };
}

function groupHeaderSegment(
  pdf: Pdf,
  letter: string,
  settings: Settings,
  pins: boolean,
): Segment {
  const chipHeight = 8.4 * 0.7;
  const chipGap = 1.8;
  const badgeWidth = pdf.width(`BOM ${letter}`, 7, "bold") + 7;
  const startX = LEFT + badgeWidth + 3;
  const chips = settingChips(settings).map(([label, value]) => ({
    label,
    value,
    accent: false,
  }));
  if (pins) chips.push({ label: "Pins", value: "Required", accent: true });
  let x = startX;
  let row = 0;
  const placed = chips.map((chip) => {
    const w =
      Math.max(
        pdf.width(chip.label.toUpperCase(), 4.6, "bold", 0.2),
        pdf.width(chip.value, 6.6),
      ) + 4.4;
    if (x + w > RIGHT && x > startX) {
      row++;
      x = startX;
    }
    const item = { chip, x, w, row };
    x += w + chipGap;
    return item;
  });
  const rows = row + 1;
  return {
    height: rows * chipHeight + (rows - 1) * chipGap + 5,
    draw: (top) => {
      bomBadge(pdf, letter, LEFT, top, chipHeight);
      placed.forEach(({ chip, x: chipX, w, row: chipRow }) => {
        const y = top + chipRow * (chipHeight + chipGap);
        pdf.rect(chipX, y, w, chipHeight, undefined, CHIP_STROKE, 0.1, 0.5);
        pdf.text(chip.label.toUpperCase(), chipX + 2.2, y + 0.75, 4.6, {
          weight: "bold",
          color: chip.accent ? "#cc5a72" : FAINT,
          spacing: 0.2,
        });
        pdf.text(chip.value, chipX + 2.2, y + 2.75, 6.6, {
          color: chip.accent ? RED : TEXT,
          weight: chip.accent ? "bold" : "normal",
        });
      });
    },
  };
}

interface ComponentRow {
  component: string;
  reference: string;
  badge: string | null;
  name: string;
  sub: string;
  qty: string;
}

function codes(values: [string, string][]) {
  return values
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label} ${value.trim()}`)
    .join("  \u00b7  ");
}

function runComponents(
  run: Run,
  plan: RunPlan,
  settings: Settings,
): ComponentRow[] {
  const rows: ComponentRow[] = [];
  const reference = run.luminaire.reference.trim() || "L";
  if (run.luminaire.configured) {
    rows.push({
      component: "Luminaire",
      reference,
      badge: KIND_FILL.luminaire,
      name: run.luminaire.name || "-",
      sub: [
        `${formatMm(run.luminaire.units * GRID_MM)} mm geartray`,
        codes([
          ["TK", run.luminaire.tk],
          ["TOC", run.luminaire.toc],
        ]),
      ]
        .filter(Boolean)
        .join("  \u00b7  "),
      qty: formatQty(quantity(run.luminaireQty)),
    });
    if (run.emergencyEnabled)
      rows.push({
        component: "Emergency luminaire",
        reference: `${reference}/E`,
        badge: GREEN,
        name: `${run.luminaire.name} ${emergencySuffix(settings)}`,
        sub: `${formatMm(run.luminaire.units * GRID_MM)} mm geartray`,
        qty: formatQty(quantity(run.emergencyQty)),
      });
  }
  if (run.sensorId) {
    const manual = run.sensorId === "manual";
    const product = PRODUCTS[run.sensorId];
    const sensorRef = run.sensorRef.trim();
    const coverage =
      !manual && plan.sensor.coverageMm !== null
        ? `${formatM(plan.sensor.coverageMm)} m coverage${settings.height ? ` at ${settings.height} m` : ""}${plan.sensor.minimum !== null ? `, ${plan.sensor.minimum} recommended per run` : ""}`
        : "";
    rows.push({
      component: "Sensor",
      reference: sensorRef || "-",
      badge: sensorRef ? KIND_FILL.sensor : null,
      name: manual
        ? run.manualSensor.name || "Manual sensor"
        : (product?.name ?? "-"),
      sub: [
        coverage,
        manual
          ? codes([
              ["TK", run.manualSensor.tk],
              ["TOC", run.manualSensor.toc],
            ])
          : codes([["TOC", product?.toc ?? ""]]),
      ]
        .filter(Boolean)
        .join("  \u00b7  "),
      qty: formatQty(quantity(run.sensorQty)),
    });
  }
  const module = PRODUCTS[run.moduleId];
  const moduleRef = run.moduleRef.trim();
  if (module)
    rows.push({
      component: "Standalone emergency",
      reference: moduleRef || "-",
      badge: moduleRef ? KIND_FILL.emergencyModule : null,
      name: module.name,
      sub: [
        `${formatMm(module.lengthMm ?? GRID_MM)} mm geartray`,
        codes([["TK", module.tk]]),
      ]
        .filter(Boolean)
        .join("  \u00b7  "),
      qty: formatQty(quantity(run.moduleQty)),
    });
  return rows;
}

function splitRows(plan: RunPlan): { start: number; end: number }[] {
  const units = plan.units;
  const count = Math.ceil(units / MAX_ROW_UNITS);
  if (count <= 1) return [{ start: 0, end: units }];
  const joints = new Set(
    plan.trunking.map((piece) => Math.round(piece.startMm / GRID_MM)),
  );
  const edges =
    plan.feasible && plan.placements.length
      ? [
          ...new Set(
            plan.placements.map((item) => Math.round(item.startMm / GRID_MM)),
          ),
        ]
      : Array.from({ length: units - 1 }, (_, index) => index + 1);
  const candidates = edges
    .filter((edge) => edge > 0 && edge < units)
    .sort((a, b) => a - b);
  const rows: { start: number; end: number }[] = [];
  let start = 0;
  for (let index = 1; index < count; index++) {
    const target = (index * units) / count;
    let best: number | null = null;
    let score = Infinity;
    for (const candidate of candidates) {
      if (candidate - start < 8 || units - candidate < 8) continue;
      if (candidate - start > MAX_ROW_UNITS) continue;
      const value =
        Math.abs(candidate - target) + (joints.has(candidate) ? 0 : 4);
      if (value < score) {
        score = value;
        best = candidate;
      }
    }
    const end = best ?? Math.min(units, Math.round(target));
    rows.push({ start, end });
    start = end;
  }
  rows.push({ start, end: units });
  return rows;
}

function layoutHeading(pdf: Pdf, plan: RunPlan, top: number, rows: number) {
  smallLabel(
    pdf,
    rows > 1 ? `Run layout, shown in ${rows} rows` : "Run layout",
    LEFT,
    top + 0.6,
  );
  const kinds = (
    [
      "luminaire",
      "emergencyLuminaire",
      "sensor",
      "emergencyModule",
      "cover",
    ] as Placement["kind"][]
  ).filter((kind) => plan.placements.some((item) => item.kind === kind));
  const items = [
    ...kinds.map((kind) => ({ kind, label: KIND_LABEL[kind] })),
    {
      kind: "suspension" as const,
      label: `Suspension (${plan.suspensions.length})`,
    },
  ];
  const widths = items.map((item) => pdf.width(item.label, 5.2) + 4.4);
  let x = RIGHT - widths.reduce((sum, value) => sum + value, 0) + 2.2;
  items.forEach((item, index) => {
    if (item.kind === "suspension") {
      pdf.doc.setFillColor(RED);
      pdf.doc.triangle(x, top + 0.9, x + 2, top + 0.9, x + 1, top + 2.6, "F");
    } else if (item.kind === "cover")
      pdf.rect(x, top + 0.8, 2.2, 1.9, KIND_FILL.cover, "#c9c9c2", 0.12);
    else pdf.rect(x, top + 0.8, 2.2, 1.9, KIND_FILL[item.kind]);
    pdf.text(item.label, x + 3, top + 0.55, 5.2, { color: MUTED });
    x += widths[index];
  });
}

function drawLayoutRow(
  pdf: Pdf,
  plan: RunPlan,
  row: { start: number; end: number },
  scale: number,
  top: number,
) {
  const startMm = row.start * GRID_MM;
  const endMm = row.end * GRID_MM;
  const rowWidth = (row.end - row.start) * scale;
  const x = (mm: number) => LEFT + ((mm - startMm) / GRID_MM) * scale;
  const overlaps = (a: number, b: number) =>
    b > startMm + 0.01 && a < endMm - 0.01;
  plan.suspensions.forEach((position) => {
    if (position < startMm - 0.01 || position > endMm + 0.01) return;
    const sx = x(position);
    pdf.doc.setFillColor(RED);
    pdf.doc.triangle(sx - 0.85, top + 0.7, sx + 0.85, top + 0.7, sx, top + 2.4, "F");
  });
  const trunkTop = top + 3;
  plan.trunking.forEach((piece) => {
    const a = piece.startMm;
    const b = piece.startMm + piece.lengthMm;
    if (!overlaps(a, b)) return;
    const x0 = x(Math.max(a, startMm));
    const x1 = x(Math.min(b, endMm));
    const gap = b <= endMm + 0.01 ? 0.35 : 0;
    const w = Math.max(0.1, x1 - x0 - gap);
    pdf.rect(x0, trunkTop, w, TRACK_HEIGHT, "#d5d5d0");
    const label = `${piece.product.nominal}${piece.product.end ? " E" : ""}`;
    if (pdf.width(label, 4.8) + 1.2 < w)
      pdf.text(label, x0 + w / 2, trunkTop + TRACK_HEIGHT / 2, 4.8, {
        color: "#54544e",
        align: "center",
        baseline: "middle",
      });
  });
  const gearTop = trunkTop + TRACK_HEIGHT + 0.8;
  const gearHeight = TRACK_HEIGHT;
  if (!plan.feasible) {
    pdf.rect(LEFT, gearTop, rowWidth, gearHeight, "#fff1f3", "#f0b4bf", 0.2);
    pdf.text(
      "Geartray quantities exceed the available run length",
      LEFT + rowWidth / 2,
      gearTop + gearHeight / 2,
      6,
      { color: RED, align: "center", baseline: "middle" },
    );
  } else
    plan.placements.forEach((item) => {
      const a = item.startMm;
      const b = item.startMm + item.lengthMm;
      if (!overlaps(a, b)) return;
      const x0 = x(Math.max(a, startMm));
      const x1 = x(Math.min(b, endMm));
      const gap = b <= endMm + 0.01 ? 0.35 : 0;
      const w = Math.max(0.1, x1 - x0 - gap);
      if (item.kind === "cover")
        pdf.rect(x0, gearTop, w, gearHeight, KIND_FILL.cover, "#cdcdc6", 0.12);
      else pdf.rect(x0, gearTop, w, gearHeight, KIND_FILL[item.kind]);
      const label = item.label;
      const cover = item.kind === "cover";
      const weight: Weight = cover ? "normal" : "bold";
      const size = (cover ? [4.6, 4] : [5.6, 4.8, 4.2]).find(
        (candidate, attempt) =>
          pdf.width(label, candidate, weight) + (attempt ? 0.6 : 1) < w,
      );
      if (size)
        pdf.text(label, x0 + w / 2, gearTop + gearHeight / 2, size, {
          weight,
          color: cover ? "#76766e" : "#ffffff",
          align: "center",
          baseline: "middle",
        });
    });
  const axisTop = gearTop + gearHeight + 1.1;
  pdf.line(LEFT, axisTop, LEFT, axisTop + 1.3, FAINT, 0.15);
  pdf.line(LEFT + rowWidth, axisTop, LEFT + rowWidth, axisTop + 1.3, FAINT, 0.15);
  plan.trunking.forEach((piece) => {
    if (piece.startMm > startMm + 0.01 && piece.startMm < endMm - 0.01)
      pdf.line(x(piece.startMm), axisTop, x(piece.startMm), axisTop + 0.8, "#c2c2ba", 0.12);
  });
  pdf.text(`${formatM(startMm)} m`, LEFT, axisTop + 1.7, 5, { color: MUTED });
  pdf.text(`${formatM(endMm)} m`, LEFT + rowWidth, axisTop + 1.7, 5, {
    color: MUTED,
    align: "right",
  });
}

function runSegments(
  pdf: Pdf,
  run: Run,
  index: number,
  plan: RunPlan,
  settings: Settings,
  letter: string,
): Segment[] {
  const number = String(index + 1).padStart(2, "0");
  const columns = [34, 24, 104, 20];
  const columnX = columns.reduce<number[]>(
    (list, _, i) => [...list, i ? list[i - 1] + columns[i - 1] : LEFT],
    [],
  );
  const nameWidth = columns[2] - 3.2;
  const table = runComponents(run, plan, settings).map((row) => {
    const nameLines = pdf.wrap(row.name, nameWidth, 6.6);
    const subLines = row.sub ? pdf.wrap(row.sub, nameWidth, 5.2) : [];
    const height = Math.max(
      5.8,
      nameLines.length * lh(6.6) + subLines.length * lh(5.2) + 3.2,
    );
    return { row, nameLines, subLines, height };
  });
  const emergencyRow = table.find(({ row }) => row.badge === GREEN);
  const badgeMin = emergencyRow
    ? badgeWidth(pdf, emergencyRow.row.reference, columns[1] - 3.2)
    : 6;
  const warnings = [...new Set([...plan.warnings, ...plan.sensor.warnings])].map(
    (warning) => pdf.wrap(warning, W - 5, 5.8),
  );
  const tableHeight =
    5.2 +
    (table.length ? table.reduce((sum, item) => sum + item.height, 0) : 6.4);
  const warningHeight = warnings.length
    ? 2.2 +
      warnings.reduce((sum, lines) => sum + lines.length * lh(5.8) + 1.1, 0)
    : 0;
  const inputs: Segment = {
    height: 7 + 3.2 + 9.6 + 2.6 + tableHeight + warningHeight + 4.2,
    draw: (top) => {
      pdf.rect(LEFT, top, W, 7, PANEL);
      pdf.text(number, LEFT + 3, top + 3.5, 7, {
        weight: "bold",
        color: RED,
        baseline: "middle",
      });
      pdf.text(`Run ${number}`, LEFT + 10, top + 3.5, 8, {
        weight: "bold",
        color: INK,
        baseline: "middle",
      });
      pdf.text(`BOM ${letter}  \u00b7  Quantities per run`, RIGHT - 3, top + 3.5, 5.8, {
        color: MUTED,
        align: "right",
        baseline: "middle",
      });
      let y = top + 10.2;
      const stats: [string, string][] = [
        ["Run length", plan.targetMm ? `${formatM(plan.targetMm)} m` : "-"],
        ["No. of runs", quantity(run.copies) ? formatQty(quantity(run.copies)) : "-"],
        ["Actual length", `${formatM(plan.lengthMm)} m`],
        [
          "Deviation",
          `${plan.deviationMm > 0.0001 ? "+" : ""}${formatMm(plan.deviationMm)} mm`,
        ],
      ];
      const statWidth = W / 4;
      stats.forEach(([label, value], i) => {
        const x = LEFT + i * statWidth + 3;
        if (i) pdf.line(x - 3, y, x - 3, y + 8.4, HAIR, 0.2);
        smallLabel(pdf, label, x, y);
        pdf.text(value, x, y + 3.3, 9.5, { weight: "bold", color: INK });
      });
      y += 9.6 + 2.6;
      ["Component", "Reference", "Product name"].forEach((title, i) =>
        smallLabel(pdf, title, columnX[i] + 1.6, y + 1),
      );
      smallLabel(pdf, "Qty / run", RIGHT - 1.6, y + 1, "right");
      pdf.line(LEFT, y + 4.8, RIGHT, y + 4.8, LINE, 0.22);
      y += 5.2;
      if (!table.length) {
        pdf.text("No geartrays entered for this run.", LEFT + 1.6, y + 1.8, 6.4, {
          color: FAINT,
        });
        y += 6.4;
      }
      table.forEach(({ row, nameLines, subLines, height }) => {
        pdf.text(row.component, columnX[0] + 1.6, y + 1.7, 6.4, { color: TEXT });
        if (row.badge)
          referenceBadge(
            pdf,
            row.reference,
            columnX[1] + 1.6,
            y + 1.1,
            row.badge,
            columns[1] - 3.2,
            badgeMin,
          );
        else
          pdf.text(pdf.fit(row.reference, columns[1] - 3.2, 6.4, "bold"), columnX[1] + 1.6, y + 1.7, 6.4, {
            weight: "bold",
            color: row.reference === "-" ? FAINT : TEXT,
          });
        const nameHeight = pdf.paragraph(nameLines, columnX[2] + 1.6, y + 1.7, 6.6, {
          color: INK,
        });
        pdf.paragraph(subLines, columnX[2] + 1.6, y + 1.9 + nameHeight, 5.2, {
          color: MUTED,
        });
        pdf.text(row.qty, RIGHT - 1.6, y + 1.5, 7, {
          weight: "bold",
          color: INK,
          align: "right",
        });
        y += height;
        pdf.line(LEFT, y, RIGHT, y, HAIR, 0.15);
      });
      if (warnings.length) {
        y += 2.2;
        warnings.forEach((lines) => {
          warningIcon(pdf, LEFT + 0.8, y + 0.1);
          pdf.paragraph(lines, LEFT + 4.4, y, 5.8, { color: "#6f4b00" });
          y += lines.length * lh(5.8) + 1.1;
        });
      }
    },
  };
  const rows = splitRows(plan);
  const scale = W / Math.max(...rows.map((row) => row.end - row.start));
  return [
    inputs,
    ...rows.map((row, i): Segment => {
      const heading = i === 0 ? 5.6 : 0;
      return {
        height: heading + ROW_HEIGHT + (i === rows.length - 1 ? 0.6 : 2.4),
        draw: (top) => {
          if (i === 0) layoutHeading(pdf, plan, top, rows.length);
          drawLayoutRow(pdf, plan, row, scale, top + heading);
        },
      };
    }),
  ];
}

function drawTap(
  pdf: Pdf,
  tap: TapView,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  pdf.rect(x, y, w, h, "#ffffff", "#cfcfc8", 0.2, 0.7);
  const nameWidth = 8.6;
  const areaX = x + 2.4 + nameWidth;
  const slot = (w - 4.8 - nameWidth) / 7;
  const radius = Math.min(1.25, slot * 0.2);
  const labelSize = slot < 7 ? 4.2 : 4.7;
  const row = (name: string, pins: TapPin[], top: number, aux: boolean) => {
    const cy = top + 1.9;
    pdf.text(name, x + 2.4, cy, 4.5, {
      weight: "bold",
      color: FAINT,
      baseline: "middle",
    });
    pins.forEach((pin, index) => {
      const cx = areaX + slot * (aux ? index + 1 : index + 0.5);
      drawPin(pdf, cx, cy, radius, pin);
      if (pin.earth) earthSymbol(pdf, cx, cy + radius + 0.9);
      else
        pdf.text(pin.label, cx, cy + radius + 0.8, labelSize, {
          color: pin.active ? TEXT : MUTED,
          align: "center",
        });
    });
  };
  let top = y + 2.4;
  if (tap.aux) {
    row("AUX", tap.aux, top, true);
    top += 8.4;
  }
  row("MAIN", tap.main, top, false);
}

function coreSegments(pdf: Pdf, letter: string, plan: GroupPlan): Segment[] {
  const view = buildCoreView(plan.electrical);
  const gap = 1.2;
  const columnWidth = (W - gap * 12) / 13;
  const useLines = view.busbar.map((core) =>
    pdf.wrap(core.available ? core.use : "Not available", columnWidth - 0.4, 5),
  );
  const maxUse = Math.max(...useLines.map((lines) => lines.length));
  const busbar: Segment = {
    height: 9 + 4.6 + 9.6 + maxUse * lh(5) + 4,
    draw: (top) => {
      pdf.text(`Core diagram, BOM ${letter}`, LEFT, top, 8.5, {
        weight: "bold",
        color: INK,
      });
      pdf.text(`${view.cores} core`, RIGHT, top + 0.7, 6.5, {
        color: MUTED,
        align: "right",
      });
      pdf.line(LEFT, top + 5.6, RIGHT, top + 5.6, LINE, 0.22);
      const y = top + 9;
      smallLabel(pdf, `Busbar, ${view.cores} core`, LEFT, y);
      const rowTop = y + 4.6;
      view.busbar.forEach((core, index) => {
        const x = LEFT + index * (columnWidth + gap);
        const cx = x + columnWidth / 2;
        if (core.available)
          pdf.text(String(core.position), cx, rowTop, 5, {
            color: FAINT,
            align: "center",
          });
        const barTop = rowTop + 2.8;
        if (core.available) toneBar(pdf, x, barTop, columnWidth, 2.4, core.tone);
        else pdf.dashedRect(x, barTop, columnWidth, 2.4, "#c8c8c0");
        pdf.text(core.label, cx, barTop + 3.5, 6.4, {
          weight: "bold",
          color: core.available ? INK : FAINT,
          align: "center",
        });
        pdf.paragraph(useLines[index], cx, barTop + 6.6, 5, {
          color: core.available ? MUTED : FAINT,
          align: "center",
        });
      });
    },
  };
  const count = view.taps.length + (view.emergencyPlaceholder ? 1 : 0);
  const slots = Math.max(2, count);
  const columnGap = 6;
  const tapWidth = (W - columnGap * (slots - 1)) / slots;
  const boxHeight = 2.4 + (view.cores === 13 ? 8.4 : 0) + 8 + 1.8;
  const noteSize = 5.6;
  const tapNotes = view.taps.map((tap) =>
    tap.notes.map((note) => pdf.wrap(note, tapWidth, noteSize)),
  );
  const notesHeight = Math.max(
    0,
    ...tapNotes.map((notes) =>
      notes.reduce((sum, lines) => sum + lines.length * lh(noteSize) + 1, 0),
    ),
  );
  const placeholderLines = view.emergencyPlaceholder
    ? pdf.wrap(view.emergencyPlaceholder, tapWidth - 8, noteSize)
    : [];
  const taps: Segment = {
    height: 4.4 + boxHeight + 2.2 + notesHeight + 2.6,
    draw: (top) => {
      view.taps.forEach((tap, index) => {
        const x = LEFT + index * (tapWidth + columnGap);
        smallLabel(pdf, tap.title, x, top);
        drawTap(pdf, tap, x, top + 4.4, tapWidth, boxHeight);
        let y = top + 4.4 + boxHeight + 2.2;
        tapNotes[index].forEach((lines) => {
          y += pdf.paragraph(lines, x, y, noteSize, { color: MUTED }) + 1;
        });
      });
      if (view.emergencyPlaceholder) {
        const x = LEFT + view.taps.length * (tapWidth + columnGap);
        smallLabel(pdf, "Emergency tap", x, top);
        pdf.dashedRect(x, top + 4.4, tapWidth, boxHeight, "#c8c8c0");
        const textHeight = placeholderLines.length * lh(noteSize);
        pdf.paragraph(
          placeholderLines,
          x + tapWidth / 2,
          top + 4.4 + (boxHeight - textHeight) / 2,
          noteSize,
          { color: FAINT, align: "center" },
        );
      }
    },
  };
  const pins =
    plan.electrical.greyPins +
      plan.electrical.greenPins +
      plan.electrical.factoryPins >
    0;
  const noticeWidth = W - 9;
  const warningLines = pins ? pdf.wrap(PINS_WARNING, noticeWidth, 6.2) : [];
  const contractorLines = pins
    ? pdf.wrap(PINS_CONTRACTOR_NOTE, noticeWidth, 6.2)
    : [];
  const noticeHeight = pins
    ? 3 + lh(6.8) + 1 + (warningLines.length + contractorLines.length) * lh(6.2) + 1.6 + 3
    : 0;
  const legend: Segment = {
    height: 6 + (pins ? noticeHeight + 3 : 0) + 1,
    draw: (top) => {
      let x = LEFT;
      const items: { tone: CoreTone | null; label: string }[] = [
        ...view.legend.map((tone) => ({ tone, label: TONE_LABELS[tone] })),
        ...(view.cores === 7
          ? [{ tone: null, label: "Not available on 7 core" }]
          : []),
      ];
      items.forEach((item) => {
        if (item.tone) toneBar(pdf, x, top + 1.1, 4.2, 1.7, item.tone);
        else pdf.dashedRect(x, top + 1.1, 4.2, 1.7, "#c8c8c0");
        pdf.text(item.label, x + 5.4, top + 0.65, 5.4, { color: MUTED });
        x += 5.4 + pdf.width(item.label, 5.4) + 4.6;
      });
      if (!pins) return;
      const y = top + 6 + 3;
      pdf.rect(LEFT, y, W, noticeHeight, "#fff5f6");
      pdf.rect(LEFT, y, 0.8, noticeHeight, RED);
      pdf.text("Additional connector pins required", LEFT + 5, y + 3, 6.8, {
        weight: "bold",
        color: "#b8001f",
      });
      let textTop = y + 3 + lh(6.8) + 1;
      textTop += pdf.paragraph(warningLines, LEFT + 5, textTop, 6.2, {
        color: "#5e3b40",
      });
      pdf.paragraph(contractorLines, LEFT + 5, textTop + 1.6, 6.2, {
        color: "#8a5a60",
      });
    },
  };
  return [busbar, taps, legend];
}

type BomColumn = {
  key: keyof Pick<BomRow, "reference" | "tk" | "toc" | "name" | "quantity" | "notes">;
  title: string;
  width: number;
  align: Align;
};

const BOM_COLUMNS: BomColumn[] = [
  { key: "reference", title: "Reference", width: 19, align: "left" },
  { key: "tk", title: "TK number", width: 16.5, align: "left" },
  { key: "toc", title: "TOC number", width: 19, align: "left" },
  { key: "name", title: "Product name", width: 50, align: "left" },
  { key: "quantity", title: "Qty", width: 11.5, align: "right" },
  { key: "notes", title: "Notes / remarks", width: 66, align: "left" },
];

function bomBlock(
  pdf: Pdf,
  letter: string,
  plan: GroupPlan,
  notes: Record<string, string>,
): Block {
  const settings = plan.electrical.settings;
  const pad = 1.6;
  const heading: Segment = {
    height: 10 + (plan.pendingRuns ? 4.6 : 0),
    draw: (top) => {
      const badgeWidth = bomBadge(pdf, letter, LEFT, top, 6.4);
      const titleX = LEFT + badgeWidth + 3.5;
      pdf.text("System components", titleX, top + 3.2, 9, {
        weight: "bold",
        color: INK,
        baseline: "middle",
      });
      pdf.text(
        `${settings.cores} core / ${settings.control} / ${settings.endCap}`,
        titleX + pdf.width("System components", 9, "bold") + 3,
        top + 3.2,
        6.4,
        { color: MUTED, baseline: "middle" },
      );
      if (plan.pendingRuns)
        pdf.text(
          `${plan.pendingRuns} incomplete or infeasible ${plan.pendingRuns === 1 ? "run is" : "runs are"} excluded from this BOM.`,
          LEFT,
          top + 8.6,
          6,
          { color: "#8a5a00" },
        );
    },
  };
  const header: Segment = {
    height: 6.6,
    draw: (top) => {
      pdf.rect(LEFT, top, W, 6.6, "#f1f1ef");
      pdf.line(LEFT, top + 6.6, RIGHT, top + 6.6, LINE, 0.22);
      let x = LEFT;
      BOM_COLUMNS.forEach((column) => {
        pdf.text(
          column.title.toUpperCase(),
          column.align === "right" ? x + column.width - pad : x + pad,
          top + 3.3,
          5,
          {
            weight: "bold",
            color: MUTED,
            align: column.align,
            baseline: "middle",
          },
        );
        x += column.width;
      });
    },
  };
  const rows: Segment[] = plan.rows.map((row) => {
    const cells = BOM_COLUMNS.map((column) => {
      const value =
        column.key === "notes"
          ? (notes[row.id] ?? row.notes)
          : column.key === "quantity"
            ? formatQty(row.quantity)
            : String(row[column.key] ?? "");
      const size =
        column.key === "notes" ? 5.7 : column.key === "quantity" ? 6.6 : 6.3;
      const weight: Weight =
        column.key === "reference" || column.key === "quantity"
          ? "bold"
          : "normal";
      const empty = !value.trim();
      const lines = empty
        ? ["-"]
        : pdf.wrap(value, column.width - pad * 2, size, weight);
      return { column, size, weight, lines, empty };
    });
    const height =
      Math.max(...cells.map((cell) => cell.lines.length * lh(cell.size))) + 3.4;
    return {
      height,
      draw: (top) => {
        let x = LEFT;
        cells.forEach((cell) => {
          pdf.paragraph(
            cell.lines,
            cell.column.align === "right"
              ? x + cell.column.width - pad
              : x + pad,
            top + 1.8,
            cell.size,
            {
              weight: cell.weight,
              color: cell.empty
                ? FAINT
                : cell.column.key === "notes"
                  ? MUTED
                  : INK,
              align: cell.column.align,
            },
          );
          x += cell.column.width;
        });
        pdf.line(LEFT, top + height, RIGHT, top + height, HAIR, 0.15);
      },
    };
  });
  if (!rows.length)
    rows.push({
      height: 10,
      draw: (top) => {
        pdf.text(
          "No complete runs in this BOM yet. Enter the run length and the number of runs to calculate the components.",
          LEFT + pad,
          top + 3.4,
          6.3,
          { color: FAINT },
        );
        pdf.line(LEFT, top + 10, RIGHT, top + 10, HAIR, 0.15);
      },
    });
  const footer: Segment = {
    height: 6,
    draw: (top) => {
      if (!plan.rows.length) return;
      pdf.text(plural(plan.rows.length, "component type"), LEFT, top + 1.8, 5.6, {
        color: MUTED,
      });
      pdf.text(`Quantities include all runs in BOM ${letter}`, RIGHT, top + 1.8, 5.6, {
        color: MUTED,
        align: "right",
      });
    },
  };
  const continuation: Segment = {
    height: 5 + header.height,
    draw: (top) => {
      pdf.text(`BOM ${letter}, continued`, LEFT, top, 6.2, {
        weight: "bold",
        color: MUTED,
      });
      header.draw(top + 5);
    },
  };
  return {
    segments: [heading, header, ...rows, footer],
    gap: 9,
    continuation,
  };
}

function longDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function pdfString(value: string) {
  if (Array.from(value).every((char) => char.charCodeAt(0) < 128)) return value;
  let result = "\u00fe\u00ff";
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    result += String.fromCharCode(code >> 8, code & 255);
  }
  return result;
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function decorate(pdf: Pdf, projectName: string, dateText: string) {
  const { doc } = pdf;
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    if (page > 1) {
      const name = pdf.fit(projectName, 125, 7, "bold");
      pdf.text(name, LEFT, 8.6, 7, { weight: "bold", color: INK });
      pdf.text(
        " - E-Line planner",
        LEFT + pdf.width(name, 7, "bold"),
        8.6,
        7,
        { color: MUTED },
      );
      pdf.text(dateText, RIGHT, 8.8, 6.4, { color: MUTED, align: "right" });
      pdf.line(LEFT, 13.4, RIGHT, 13.4, LINE, 0.22);
    }
    pdf.line(LEFT, 285, RIGHT, 285, HAIR, 0.2);
    pdf.text(
      "E-Line Pro system planner. Verify the final specification before installation.",
      LEFT,
      287,
      5.8,
      { color: FAINT },
    );
    pdf.text(`Page ${page} of ${total}`, RIGHT, 287, 5.8, {
      color: MUTED,
      align: "right",
    });
  }
}

export function hasExportableRuns(plans: GroupPlan[]) {
  return plans.some((plan) => plan.runs.some((run) => run.units > 0));
}

export function buildPdf(input: PdfInput): Blob {
  const pdf = new Pdf();
  const { doc } = pdf;
  const flow = new Flow(pdf);
  const projectName = input.projectName.trim() || "E-Line Pro";
  const dateText = longDate(input.date);
  const included = input.groups
    .map((group, index) => ({ group, plan: input.plans[index] }))
    .filter(({ plan }) => plan && plan.runs.some((run) => run.units > 0));
  const layouts = included.reduce(
    (sum, { plan }) => sum + plan.runs.filter((run) => run.units > 0).length,
    0,
  );
  const lead: Segment[] = [
    titleSegment(
      pdf,
      projectName,
      `${dateText}  \u00b7  ${plural(included.length, "BOM")}  \u00b7  ${plural(layouts, "run layout")}`,
    ),
    sectionSegment(pdf, "01", "E-Line runs"),
  ];
  included.forEach(({ group, plan }) => {
    const settings = plan.electrical.settings;
    const pins =
      plan.electrical.greyPins +
        plan.electrical.greenPins +
        plan.electrical.factoryPins >
      0;
    group.runs
      .map((run, index) => ({ run, index, runPlan: plan.runs[index] }))
      .filter(({ runPlan }) => runPlan.units > 0)
      .forEach(({ run, index, runPlan }, position) => {
        const segments = runSegments(pdf, run, index, runPlan, settings, group.letter);
        if (position === 0)
          segments.unshift(
            ...lead.splice(0),
            groupHeaderSegment(pdf, group.letter, settings, pins),
          );
        flow.place({ segments, gap: 7 });
      });
    flow.place({ segments: coreSegments(pdf, group.letter, plan), gap: 10 });
  });
  included.forEach(({ group, plan }, index) => {
    const block = bomBlock(pdf, group.letter, plan, input.notes);
    if (index === 0)
      block.segments.unshift(sectionSegment(pdf, "02", "Bill of materials"));
    flow.place(block);
  });
  decorate(pdf, projectName, dateText);
  const title = `${projectName} - E-Line planner`;
  const subject = "E-Line Pro run layouts, core diagrams and bills of materials";
  doc.setProperties({
    title: pdfString(title),
    subject,
    author: PDF_CREATOR,
    creator: PDF_CREATOR,
  });
  doc.setCreationDate(input.date);
  doc.setDisplayMode("fullpage", "single");
  const iso = input.date.toISOString();
  doc.addMetadata(
    `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(title)}</rdf:li></rdf:Alt></dc:title><dc:creator><rdf:Seq><rdf:li>${PDF_CREATOR}</rdf:li></rdf:Seq></dc:creator><dc:description><rdf:Alt><rdf:li xml:lang="x-default">${subject}</rdf:li></rdf:Alt></dc:description><xmp:CreatorTool>${PDF_CREATOR}</xmp:CreatorTool><xmp:CreateDate>${iso}</xmp:CreateDate><xmp:ModifyDate>${iso}</xmp:ModifyDate><xmp:MetadataDate>${iso}</xmp:MetadataDate></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`,
    true as unknown as string,
  );
  return doc.output("blob");
}
