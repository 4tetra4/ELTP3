import { EMERGENCY_CONVERSION, GRID_MM, PRODUCTS } from "./catalogue";
import { REFERENCE_FALLBACK, referenceOf } from "./references";
import {
  formatM,
  formatMm,
  quantity,
  type BomGroup,
  type BomRow,
  type ElectricalPlan,
  type GroupPlan,
  type Placement,
  type Product,
  type QuantityField,
  type Run,
  type RunPlan,
  type SensorPlan,
  type Settings,
  type TrunkPlacement,
} from "./types";

export const PINS_WARNING =
  "Pins were added as the standard 5 pole busbar electrical tap has no sufficient connectors pins to connect all the cores required this specification. The contractor has to install this on site and might need to rewire the fitting. The contractor needs to be aware of this.";
export const PINS_CONTRACTOR_NOTE =
  "Share this requirement with the contractor and conversion team before installation. Factory-fitted connectors are shown in the schematic but are not added again to the BOM.";
export const DALI_WARNING =
  "Sensors can't be added to non-DALI system. It would require SOF luminaire and sensors, more feed-ins, complicated installing and cost more than a full DALI system. The setting has been changed to DALI, please also change the luminaire to DALI.";

export function resolveElectrical(
  requested: Settings,
  runs: Run[],
): ElectricalPlan {
  const settings = { ...requested };
  const reasons: string[] = [];
  const total = (count: (run: Run) => number) =>
    runs.reduce(
      (sum, run) => sum + count(run) * Math.max(1, quantity(run.copies)),
      0,
    );
  const moduleSystem = (run: Run) => PRODUCTS[run.moduleId]?.emergencySystem;
  const converted = total((run) =>
    run.emergencyEnabled ? quantity(run.emergencyQty) : 0,
  );
  const batteryModules = total((run) =>
    moduleSystem(run) === "Battery" ? quantity(run.moduleQty) : 0,
  );
  const cbsModules = total((run) =>
    moduleSystem(run) === "CBS" ? quantity(run.moduleQty) : 0,
  );
  const luminaires = total(
    (run) =>
      quantity(run.luminaireQty) +
      (run.emergencyEnabled ? quantity(run.emergencyQty) : 0),
  );
  if (runs.some((run) => !!run.sensorId)) settings.control = "DALI";
  const convertedBattery = settings.emergency === "Battery" ? converted : 0;
  const convertedCbs = settings.emergency === "CBS" ? converted : 0;
  const batteryEmergency = convertedBattery > 0 || batteryModules > 0;
  const cbsAuxiliary = convertedCbs > 0 || cbsModules > 0;
  const batteryAuxiliary = settings.lives === 3 && batteryEmergency;
  const batteryAuxPair: [2, 4] | [10, 12] = cbsAuxiliary ? [10, 12] : [2, 4];
  const auxiliaryEmergency = cbsAuxiliary || batteryAuxiliary;
  if (settings.neutrals > 1)
    reasons.push(
      `${settings.neutrals} neutral cores are required. The additional neutrals use a grey connector on the auxiliary side of the electrical tap, positions 6 and 8.`,
    );
  if (cbsAuxiliary)
    reasons.push(
      `CBS emergency ${convertedCbs > 0 && cbsModules > 0 ? "luminaires and LBLT039ML-PRO modules use" : convertedCbs > 0 ? "luminaires use" : "modules (LBLT039ML-PRO) use"} auxiliary core positions 2 and 4.`,
    );
  if (batteryAuxiliary)
    reasons.push(
      `Battery emergency with three switched lives takes the non-switched live from auxiliary core positions ${batteryAuxPair[0]} and ${batteryAuxPair[1]}.`,
    );
  if (reasons.length) settings.cores = 13;
  return {
    settings,
    requiresAux: reasons.length > 0,
    auxiliaryEmergency,
    cbsAuxiliary,
    batteryAuxiliary,
    batteryAuxPair,
    reasons,
    batteryEmergency,
    batteryMainEmergency: batteryEmergency && settings.lives < 3,
    hasEmergency: batteryEmergency || cbsAuxiliary,
    convertedBattery,
    convertedCbs,
    batteryModules,
    cbsModules,
    greyPins: settings.neutrals > 1 ? luminaires : 0,
    greenPins: settings.lives === 3 ? batteryModules : 0,
    factoryPins:
      (settings.emergency === "CBS" || settings.lives === 3 ? converted : 0) +
      cbsModules,
  };
}

export function nearestRunUnits(targetMm: number): number {
  return targetMm > 0
    ? Math.max(4, Math.round(targetMm / (GRID_MM * 2)) * 2)
    : 0;
}

export function trunkingUnits(units: number, useLong: boolean): number[] {
  if (units < 4 || units % 2 !== 0) return [];
  const sizes = useLong ? [12, 8, 6, 4] : [8, 6, 4];
  const result: number[] = [];
  let left = units;
  for (const size of sizes) {
    while (left >= size && left - size !== 2) {
      result.push(size);
      left -= size;
    }
  }
  return left === 0 ? result : [];
}

export function balancedCovers(units: number): number[] {
  if (!units) return [];
  const count = Math.ceil(units / 6);
  const size = Math.floor(units / count);
  return Array.from(
    { length: count },
    (_, index) => size + (index < units % count ? 1 : 0),
  );
}

interface Interval {
  start: number;
  end: number;
}
interface UnitPlacement {
  start: number;
  width: number;
  kind: Placement["kind"];
  index: number;
}

function freeIntervals(occupied: UnitPlacement[], units: number): Interval[] {
  const intervals: Interval[] = [];
  let cursor = 0;
  for (const item of [...occupied].sort((a, b) => a.start - b.start)) {
    if (item.start > cursor) intervals.push({ start: cursor, end: item.start });
    cursor = item.start + item.width;
  }
  if (cursor < units) intervals.push({ start: cursor, end: units });
  return intervals;
}

function placeModules(
  intervals: Interval[],
  count: number,
  width: number,
  units: number,
): number[] | null {
  if (!count) return [];
  let free = [...intervals];
  const result: number[] = [];
  const first = free.find(
    (interval) => interval.end - interval.start >= width,
  )?.start;
  const lastInterval = [...free]
    .reverse()
    .find((interval) => interval.end - interval.start >= width);
  if (first === undefined || !lastInterval) return null;
  const last = lastInterval.end - width;
  for (let index = 0; index < count; index++) {
    const target =
      count === 1
        ? (units - width) / 2
        : first + (index * (last - first)) / (count - 1);
    const capacity = free.reduce(
      (sum, interval) =>
        sum + Math.floor((interval.end - interval.start) / width),
      0,
    );
    let best: { intervalIndex: number; start: number; score: number } | null =
      null;
    for (const [intervalIndex, interval] of free.entries()) {
      if (interval.end - interval.start < width) continue;
      const near = Math.max(
        interval.start,
        Math.min(interval.end - width, Math.round(target)),
      );
      const candidates = new Set([
        interval.start,
        interval.end - width,
        near,
        Math.max(interval.start, near - 1),
        Math.min(interval.end - width, near + 1),
      ]);
      for (const start of candidates) {
        const remaining =
          capacity -
          Math.floor((interval.end - interval.start) / width) +
          Math.floor((start - interval.start) / width) +
          Math.floor((interval.end - start - width) / width);
        const score = Math.abs(start - target);
        if (remaining >= count - index - 1 && (!best || score < best.score))
          best = { intervalIndex, start, score };
      }
    }
    if (!best) return null;
    const interval = free[best.intervalIndex];
    free = free.flatMap((current, i) =>
      i !== best!.intervalIndex
        ? [current]
        : [
            { start: interval.start, end: best!.start },
            { start: best!.start + width, end: interval.end },
          ].filter((part) => part.end > part.start),
    );
    result.push(best.start);
  }
  return result.sort((a, b) => a - b);
}

export function occupiedUnits(run: Run): number {
  return (
    (quantity(run.luminaireQty) +
      (run.emergencyEnabled ? quantity(run.emergencyQty) : 0)) *
      run.luminaire.units +
    (run.sensorId ? quantity(run.sensorQty) : 0) +
    (PRODUCTS[run.moduleId]
      ? (quantity(run.moduleQty) * PRODUCTS[run.moduleId].lengthMm!) / GRID_MM
      : 0)
  );
}

function baseGeometry(run: Run, units: number): UnitPlacement[] | null {
  if (occupiedUnits(run) > units) return null;
  const normalCount = quantity(run.luminaireQty);
  const emergencyCount = run.emergencyEnabled ? quantity(run.emergencyQty) : 0;
  const count = normalCount + emergencyCount;
  const width = run.luminaire.units;
  const moduleWidth = PRODUCTS[run.moduleId]?.lengthMm
    ? PRODUCTS[run.moduleId].lengthMm! / GRID_MM
    : 0;
  const moduleCount = moduleWidth ? quantity(run.moduleQty) : 0;
  const emergencyIndices = new Set<number>();
  if (emergencyCount === 1) emergencyIndices.add(Math.floor((count - 1) / 2));
  else
    for (let i = 0; i < emergencyCount; i++)
      emergencyIndices.add(
        Math.round((i * (count - 1)) / (emergencyCount - 1)),
      );
  const gaps =
    count > 1
      ? Array.from(
          { length: count - 1 },
          (_, i) =>
            Math.round(((i + 1) * (units - count * width)) / (count - 1)) -
            Math.round((i * (units - count * width)) / (count - 1)),
        )
      : [];
  if (moduleWidth === 2 && count > 1) {
    while (
      gaps.reduce((sum, gap) => sum + Math.floor(gap / 2), 0) < moduleCount
    ) {
      const odd = gaps
        .map((size, index) => ({ size, index }))
        .filter((gap) => gap.size % 2 === 1)
        .sort((a, b) => b.size - a.size);
      if (odd.length < 2) return null;
      gaps[odd[0].index]--;
      gaps[odd[odd.length - 1].index]++;
    }
  }
  let cursor = 0;
  const placements: UnitPlacement[] = [];
  for (let index = 0; index < count; index++) {
    placements.push({
      start: cursor,
      width,
      kind: emergencyIndices.has(index) ? "emergencyLuminaire" : "luminaire",
      index,
    });
    cursor += width + (gaps[index] ?? 0);
  }
  const modulePositions = placeModules(
    freeIntervals(placements, units),
    moduleCount,
    moduleWidth,
    units,
  );
  if (!modulePositions) return null;
  modulePositions.forEach((start, index) =>
    placements.push({
      start,
      width: moduleWidth,
      kind: "emergencyModule",
      index,
    }),
  );
  return placements;
}

export function fitsRun(run: Run, units: number): boolean {
  return units >= 4 && baseGeometry(run, units) !== null;
}

export function maximumQuantity(
  run: Run,
  field: QuantityField,
  units: number,
): number {
  const width =
    field === "luminaireQty" || field === "emergencyQty"
      ? run.luminaire.units
      : field === "moduleQty"
        ? (PRODUCTS[run.moduleId]?.lengthMm ?? GRID_MM) / GRID_MM
        : 1;
  const without = { ...run, [field]: "0" };
  let high = Math.max(0, Math.floor((units - occupiedUnits(without)) / width));
  let low = 0;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fitsRun({ ...run, [field]: String(middle) }, units)) low = middle;
    else high = middle - 1;
  }
  return low;
}

export function sensorCoverage(
  product: Product,
  height: number,
): { tangential: number; radial: number | null; estimated: boolean } | null {
  const data = product.coverage;
  if (!data) return null;
  const h = Math.max(data.minHeight, Math.min(data.maxHeight, height));
  if (data.estimated) {
    const p = data.points[0];
    const ratio = Math.min(h / p.height, p.height / h);
    return {
      tangential: Math.max(p.tangential * ratio, p.width ?? 0),
      radial: p.radial ? Math.max(p.radial * ratio, p.radialWidth ?? 0) : null,
      estimated: true,
    };
  }
  const sorted = [...data.points].sort((a, b) => a.height - b.height);
  let high = sorted.findIndex((point) => point.height >= h);
  if (high < 0) high = sorted.length - 1;
  if (high === 0) high = 1;
  const a = sorted[high - 1];
  const b = sorted[high];
  const ratio = (h - a.height) / (b.height - a.height);
  const tangential = a.tangential + ratio * (b.tangential - a.tangential);
  const radial =
    a.radial !== undefined && b.radial !== undefined
      ? a.radial + ratio * (b.radial - a.radial)
      : null;
  return {
    tangential: Math.max(tangential, a.width ?? 0),
    radial,
    estimated: false,
  };
}

function upperBound(values: number[], limit: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid] <= limit + 0.0001) low = mid + 1;
    else high = mid;
  }
  return low;
}

function evenlySelect(
  candidates: number[],
  count: number,
  units: number,
): number[] {
  const selected: number[] = [];
  let previous = -1;
  for (let index = 0; index < count; index++) {
    const target = (units * (index + 0.5)) / count - 0.5;
    const max = candidates.length - (count - index);
    const insertion = upperBound(candidates, target);
    let best = Math.max(previous + 1, Math.min(max, insertion));
    if (
      best > previous + 1 &&
      Math.abs(candidates[best - 1] - target) <=
        Math.abs(candidates[best] - target)
    )
      best--;
    if (best >= candidates.length) break;
    selected.push(candidates[best]);
    previous = best;
  }
  return selected;
}

function planSensors(
  run: Run,
  units: number,
  settings: Settings,
  candidates: number[],
): { positions: number[]; plan: SensorPlan } {
  const count = run.sensorId ? quantity(run.sensorQty) : 0;
  const height = Number(settings.height);
  const wallGapMm =
    2000 + ((Math.max(3, Math.min(15, height || 3)) - 3) / 12) * 2000;
  const plan: SensorPlan = {
    minimum: null,
    coverageMm: null,
    radialMm: null,
    wallGapMm,
    covered: true,
    wallsCovered: true,
    inHeightRange: true,
    warnings: [],
  };
  const fallback = () => ({
    positions: evenlySelect(candidates, count, units),
    plan,
  });
  if (!run.sensorId || run.sensorId === "manual") return fallback();
  const product = PRODUCTS[run.sensorId];
  if (!height || height <= 0) {
    plan.warnings.push(
      "Enter a mounting height to calculate sensor coverage and the recommended quantity.",
    );
    plan.covered = false;
    return fallback();
  }
  const coverage = sensorCoverage(product, height);
  if (!coverage || !units) return fallback();
  plan.coverageMm = coverage.tangential * 1000;
  plan.radialMm = coverage.radial === null ? null : coverage.radial * 1000;
  plan.inHeightRange =
    height >= product.coverage!.minHeight &&
    height <= product.coverage!.maxHeight;
  if (!plan.inHeightRange)
    plan.warnings.push(
      `Mounting height ${height} m is outside the ${product.coverage!.minHeight}-${product.coverage!.maxHeight} m range. Coverage is only an estimate at the nearest supported height.`,
    );
  const centers = candidates.map((start) => (start + 0.5) * GRID_MM);
  const radius = plan.coverageMm / 2;
  const runEnd = units * GRID_MM;
  if (!centers.length) {
    plan.covered = false;
    plan.wallsCovered = false;
    plan.warnings.push(
      "There are no free positions for sensors in this run. Increase the run length or reduce the luminaire or emergency module quantities.",
    );
    return { positions: [], plan };
  }
  const left = Math.max(-wallGapMm, centers[0] - radius);
  const right = Math.min(
    runEnd + wallGapMm,
    centers[centers.length - 1] + radius,
  );
  plan.wallsCovered =
    left <= -wallGapMm + 0.0001 && right >= runEnd + wallGapMm - 0.0001;
  const runEndsCovered = left <= 0.0001 && right >= runEnd - 0.0001;
  const needed = Array<number>(centers.length).fill(Infinity);
  for (let i = centers.length - 1; i >= 0; i--) {
    if (centers[i] + radius >= right - 0.0001) needed[i] = 1;
    else {
      const next = upperBound(centers, centers[i] + plan.coverageMm) - 1;
      if (next > i) needed[i] = 1 + needed[next];
    }
  }
  let minimum = Infinity;
  for (let i = 0; i < upperBound(centers, left + radius); i++)
    minimum = Math.min(minimum, needed[i]);
  plan.minimum = Number.isFinite(minimum) ? minimum : null;
  let selected: number[] = [];
  let previous = -1;
  if (count >= minimum && count <= centers.length) {
    for (let index = 0; index < count; index++) {
      const target = left + ((right - left) * (index + 0.5)) / count;
      const maximumCenter =
        index === 0 ? left + radius : centers[previous] + plan.coverageMm;
      const maximumIndex = Math.min(
        upperBound(centers, maximumCenter) - 1,
        centers.length - (count - index),
      );
      let best = -1;
      for (let j = previous + 1; j <= maximumIndex; j++) {
        if (
          needed[j] <= count - index &&
          (best === -1 ||
            Math.abs(centers[j] - target) < Math.abs(centers[best] - target))
        )
          best = j;
      }
      if (best < 0) break;
      selected.push(candidates[best]);
      previous = best;
    }
  }
  if (selected.length !== count)
    selected = evenlySelect(candidates, count, units);
  const actualCenters = selected.map((start) => (start + 0.5) * GRID_MM);
  plan.covered =
    actualCenters.length > 0 &&
    actualCenters[0] - radius <= left + 0.0001 &&
    actualCenters[actualCenters.length - 1] + radius >= right - 0.0001 &&
    actualCenters.every(
      (center, index) =>
        index === 0 ||
        center - actualCenters[index - 1] <= plan.coverageMm! + 0.0001,
    );
  if (plan.minimum === null)
    plan.warnings.push(
      "Continuous coverage along the run is not possible from the free positions between the luminaires and emergency modules. Choose a sensor with greater reach, adjust the mounting height, or change the geartray layout.",
    );
  else {
    if (!plan.covered)
      plan.warnings.push(
        `Full coverage requires at least ${plan.minimum} sensor${plan.minimum === 1 ? "" : "s"}${plan.wallsCovered ? `, including ${formatM(wallGapMm)} m wall zones at both ends` : " along the run length"}. Apply the recommendation to reposition the sensors.`,
      );
    if (!runEndsCovered)
      plan.warnings.push(
        "The ends of the run cannot be fully covered because luminaires or emergency modules occupy the positions near the ends. Choose a sensor with greater reach or change the geartray layout.",
      );
  }
  if (coverage.estimated)
    plan.warnings.push(
      "Coverage is estimated from the 3.5 m reference height; confirm the final detection area with the manufacturer.",
    );
  return { positions: selected, plan };
}

export function emergencySuffix(settings: Settings): string {
  return settings.emergency === "CBS"
    ? "CBS"
    : settings.testing === "DST"
      ? "DST"
      : "EM3";
}

export function calculateRun(run: Run, settings: Settings): RunPlan {
  const targetMm = Math.max(0, Number(run.target) || 0) * 1000;
  const units =
    targetMm > 0 ? (run.adjustedUnits ?? nearestRunUnits(targetMm)) : 0;
  const lengthMm = units * GRID_MM;
  const trunking: TrunkPlacement[] = [];
  const suspensions: number[] = [];
  let cursor = 0;
  const lengths = trunkingUnits(units, settings.longTrunking);
  lengths.forEach((size, index) => {
    const nominal = (
      { 4: "L150", 6: "L225", 8: "L300", 12: "L450" } as Record<number, string>
    )[size];
    const product =
      PRODUCTS[
        `trunk-${nominal}-${settings.cores}-${index === lengths.length - 1 ? "end" : "continuous"}`
      ];
    const length = size * GRID_MM;
    trunking.push({ product, startMm: cursor, lengthMm: length });
    if (index === 0) suspensions.push(200);
    if (size === 12) suspensions.push(cursor + length / 2);
    suspensions.push(cursor + length - 200);
    cursor += length;
  });
  const base = units > 0 ? baseGeometry(run, units) : null;
  const free = base
    ? freeIntervals(base, units).flatMap((interval) =>
        Array.from(
          { length: interval.end - interval.start },
          (_, i) => interval.start + i,
        ),
      )
    : [];
  const sensor = planSensors(run, units, settings, free);
  const all: UnitPlacement[] = [
    ...(base ?? []),
    ...sensor.positions.map((start, index): UnitPlacement => ({
      start,
      width: 1,
      kind: "sensor",
      index,
    })),
  ];
  const luminaireRef = run.luminaire.reference.trim();
  const sensorRef = referenceOf(run, "sensor");
  const moduleRef = referenceOf(run, "module");
  const placements: Placement[] = all.map((item) => {
    const product =
      item.kind === "sensor"
        ? PRODUCTS[run.sensorId]
        : item.kind === "emergencyModule"
          ? PRODUCTS[run.moduleId]
          : undefined;
    const isEmergency = item.kind === "emergencyLuminaire";
    const [reference, label] =
      item.kind === "sensor"
        ? [sensorRef || REFERENCE_FALLBACK.sensor, sensorRef || "S"]
        : item.kind === "emergencyModule"
          ? [moduleRef || REFERENCE_FALLBACK.module, moduleRef || "E"]
          : [
              `${luminaireRef || "Luminaire"}${isEmergency ? "/E" : ""}`,
              `${luminaireRef || "L"}${isEmergency ? "/E" : ""}`,
            ];
    return {
      id: `${run.id}-${item.kind}-${item.index}`,
      kind: item.kind,
      startMm: item.start * GRID_MM,
      lengthMm: item.width * GRID_MM,
      reference,
      label,
      name:
        product?.name ??
        (item.kind === "sensor"
          ? run.manualSensor.name || "Manual sensor"
          : `${run.luminaire.name}${isEmergency ? ` ${emergencySuffix(settings)}` : ""}`),
      productId: product?.id,
    };
  });
  if (base)
    for (const gap of freeIntervals(all, units)) {
      let start = gap.start;
      for (const size of balancedCovers(gap.end - gap.start)) {
        const product = PRODUCTS[`cover-${size}`];
        placements.push({
          id: `${run.id}-cover-${start}`,
          kind: "cover",
          reference: "Blank cover",
          label: formatMm(size * GRID_MM),
          name: product.name,
          startMm: start * GRID_MM,
          lengthMm: size * GRID_MM,
          productId: product.id,
        });
        start += size;
      }
    }
  placements.sort((a, b) => a.startMm - b.startMm);
  const warnings: string[] = [];
  if (units && !base)
    warnings.push(
      `The selected geartrays need ${formatM(occupiedUnits(run) * GRID_MM)} m and cannot fit this ${formatM(lengthMm)} m run. Increase the run length or reduce a quantity.`,
    );
  const luminaireCount =
    quantity(run.luminaireQty) +
    (run.emergencyEnabled ? quantity(run.emergencyQty) : 0);
  if (luminaireCount === 1 && units > run.luminaire.units)
    warnings.push(
      "One luminaire cannot occupy both ends of the run. It is placed at the start; add a second luminaire to light both edges.",
    );
  if (
    run.emergencyEnabled &&
    quantity(run.emergencyQty) === 1 &&
    luminaireCount > 1
  )
    warnings.push(
      "A single emergency luminaire is placed centrally. Two emergency luminaires are needed to equip both ends.",
    );
  if (units && !quantity(run.copies))
    warnings.push(
      "Enter the number of runs to include this layout in the bill of materials.",
    );
  let longerUnits: number | null = null;
  if (units) {
    longerUnits = Math.max(units + 2, Math.ceil(occupiedUnits(run) / 2) * 2, 4);
    while (!fitsRun(run, longerUnits)) longerUnits += 2;
  }
  return {
    runId: run.id,
    units,
    targetMm,
    lengthMm,
    deviationMm: lengthMm - targetMm,
    trunking,
    placements,
    suspensions,
    sensor: sensor.plan,
    feasible: !!base,
    ready: units > 0 && quantity(run.copies) > 0,
    warnings,
    shorterUnits: units > 4 && fitsRun(run, units - 2) ? units - 2 : null,
    longerUnits,
  };
}

const categoryLabel: Record<string, string> = {
  trunking: "Trunking",
  cover: "Blank cover",
  suspension: "Suspension",
  feed: "Feed-in",
  endCap: "End cap",
  pin: "Pin",
  sensor: "Sensor",
  emergency: "Emergency module",
};
const categoryOrder: Record<string, number> = {
  luminaire: 0,
  sensor: 1,
  emergency: 2,
  trunking: 3,
  cover: 4,
  suspension: 5,
  feed: 6,
  endCap: 7,
  pin: 8,
};

export function calculateGroup(group: BomGroup, project: Settings): GroupPlan {
  const electrical = resolveElectrical(
    { ...project, ...group.overrides },
    group.runs,
  );
  const settings = electrical.settings;
  const plans = group.runs.map((run) => calculateRun(run, settings));
  const rows = new Map<string, BomRow>();
  const add = (row: BomRow) => {
    if (!row.quantity) return;
    const existing = rows.get(row.id);
    if (existing) existing.quantity += row.quantity;
    else rows.set(row.id, { ...row });
  };
  const addProduct = (
    product: Product,
    count: number,
    note?: string,
    reference?: string,
    key?: string,
  ) => {
    add({
      id: `${group.id}-${key ?? product.id}`,
      reference: reference ?? categoryLabel[product.category],
      tk: product.tk,
      toc: product.toc,
      name: product.name,
      quantity: count,
      notes: note ?? product.note,
      category: product.category,
    });
  };
  group.runs.forEach((run, index) => {
    const plan = plans[index];
    if (!plan.ready || !plan.feasible) return;
    const copies = quantity(run.copies);
    const normal = quantity(run.luminaireQty);
    const converted = run.emergencyEnabled ? quantity(run.emergencyQty) : 0;
    const ref = run.luminaire.reference.trim() || "Luminaire";
    const luminaireKey = [
      ref,
      run.luminaire.name,
      run.luminaire.tk,
      run.luminaire.toc,
      run.luminaire.units,
    ].join("|");
    add({
      id: `${group.id}-luminaire-${luminaireKey}`,
      category: "luminaire",
      reference: ref,
      tk: run.luminaire.tk,
      toc: run.luminaire.toc,
      name: run.luminaire.name,
      quantity: normal * copies,
      notes: `${formatMm(run.luminaire.units * GRID_MM)} mm geartray. Live tap selectable across the available switched lives.`,
    });
    const special = settings.emergency === "Battery" && settings.lives === 3;
    const conversionNote = special
      ? `Special conversion: supply and fit ${PRODUCTS["pin-green"].name} (TOC ${PRODUCTS["pin-green"].toc}) in auxiliary positions ${electrical.batteryAuxPair[0]} and ${electrical.batteryAuxPair[1]} during conversion. Wire the non-switched emergency supply to core ${electrical.batteryAuxPair[0]} because L1, L2 and L3 are all required as switched lives.${electrical.cbsAuxiliary ? " Positions 2 and 4 are reserved for the separate CBS supply." : ""} Instruct the conversion team accordingly. Connector included in conversion, not separately counted in the BOM.`
      : settings.emergency === "CBS"
        ? "CBS integral emergency conversion. Auxiliary green connector fitted during conversion, not separately counted. Confirm the final luminaire TK / configuration ID."
        : "Integral battery emergency conversion. Non-switched live on L2; switched live on L1 or L3. Additional main-side single pin included in conversion. Confirm the final luminaire TK / configuration ID.";
    add({
      id: `${group.id}-emergency-${luminaireKey}`,
      category: "luminaire",
      reference: `${ref}/E`,
      tk: EMERGENCY_CONVERSION.tk,
      toc: "",
      name: `${run.luminaire.name} ${emergencySuffix(settings)}${special ? " - Special version, see the comment" : ""}`,
      quantity: converted * copies,
      notes: `${formatMm(run.luminaire.units * GRID_MM)} mm geartray. ${conversionNote}${run.luminaire.toc ? ` Base luminaire TOC / configuration: ${run.luminaire.toc}; confirm the converted product ID.` : ""}`,
    });
    const sensorRef = referenceOf(run, "sensor");
    const moduleRef = referenceOf(run, "module");
    if (run.sensorId === "manual")
      add({
        id: `${group.id}-manual-${sensorRef}-${run.manualSensor.name}-${run.manualSensor.tk}-${run.manualSensor.toc}`,
        category: "sensor",
        reference: sensorRef || REFERENCE_FALLBACK.sensor,
        tk: run.manualSensor.tk,
        toc: run.manualSensor.toc,
        name: run.manualSensor.name || "Manual sensor",
        quantity: quantity(run.sensorQty) * copies,
        notes: `${formatMm(GRID_MM)} mm geartray. Manually specified; coverage and quantity recommendations are unavailable.`,
      });
    else if (PRODUCTS[run.sensorId])
      addProduct(
        PRODUCTS[run.sensorId],
        quantity(run.sensorQty) * copies,
        `${formatMm(GRID_MM)} mm geartray. ${PRODUCTS[run.sensorId].note}`,
        sensorRef || REFERENCE_FALLBACK.sensor,
        `${run.sensorId}-${sensorRef}`,
      );
    if (PRODUCTS[run.moduleId])
      addProduct(
        PRODUCTS[run.moduleId],
        quantity(run.moduleQty) * copies,
        undefined,
        moduleRef || REFERENCE_FALLBACK.module,
        `${run.moduleId}-${moduleRef}`,
      );
    plan.trunking.forEach((item) => addProduct(item.product, copies));
    plan.placements
      .filter((item) => item.kind === "cover")
      .forEach((item) =>
        addProduct(
          PRODUCTS[item.productId!],
          copies,
          `${formatMm(item.lengthMm)} mm uncut blank cover.`,
        ),
      );
    addProduct(
      PRODUCTS[`suspension-${settings.suspension}`],
      plan.suspensions.length * copies,
    );
    addProduct(
      PRODUCTS[`feed-${settings.cores}`],
      (plan.lengthMm >= 50000 ? 2 : 1) * copies,
    );
    addProduct(PRODUCTS[`cap-${settings.endCap}`], 2 * copies);
    if (settings.neutrals > 1)
      addProduct(PRODUCTS["pin-grey"], (normal + converted) * copies);
    if (
      settings.lives === 3 &&
      PRODUCTS[run.moduleId]?.emergencySystem === "Battery"
    )
      addProduct(
        PRODUCTS["pin-green"],
        quantity(run.moduleQty) * copies,
        `Two-pole battery emergency connector in auxiliary positions ${electrical.batteryAuxPair[0]} and ${electrical.batteryAuxPair[1]}. Contractor must fit and wire on site.${electrical.cbsAuxiliary ? " Positions 2 and 4 are reserved for the separate CBS supply." : ""}`,
      );
  });
  return {
    groupId: group.id,
    electrical,
    runs: plans,
    rows: [...rows.values()].sort(
      (a, b) => categoryOrder[a.category] - categoryOrder[b.category],
    ),
    pendingRuns: plans.filter(
      (plan) => plan.units > 0 && (!plan.feasible || !plan.ready),
    ).length,
  };
}
