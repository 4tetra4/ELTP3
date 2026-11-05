export type CoreCount = 7 | 13;
export type CircuitCount = 1 | 2 | 3;
export type ProductCategory =
  | "trunking"
  | "cover"
  | "feed"
  | "endCap"
  | "pin"
  | "suspension"
  | "sensor"
  | "emergency"
  | "conversion";

export interface CoveragePoint {
  height: number;
  tangential: number;
  radial?: number;
  width?: number;
  radialWidth?: number;
}

export interface Coverage {
  shape: "round" | "square" | "rectangle" | "ellipse";
  minHeight: number;
  maxHeight: number;
  points: CoveragePoint[];
  estimated?: boolean;
}

export interface Product {
  id: string;
  category: ProductCategory;
  name: string;
  tk: string;
  toc: string;
  lengthMm?: number;
  widthMm?: number;
  cores?: CoreCount;
  nominal?: string;
  end?: boolean;
  protection?: "IP20" | "IP50";
  suspensionM?: number;
  emergencySystem?: "Battery" | "CBS";
  factoryAuxPins?: boolean;
  coverage?: Coverage;
  note: string;
}

export interface Settings {
  cores: CoreCount;
  control: "DALI" | "ET";
  emergency: "Battery" | "CBS";
  testing: "Manual" | "DST";
  lives: CircuitCount;
  neutrals: CircuitCount;
  height: string;
  suspension: 1.5 | 3 | 5;
  endCap: "IP20" | "IP50";
  longTrunking: boolean;
}

export interface Luminaire {
  reference: string;
  name: string;
  tk: string;
  toc: string;
  units: 4 | 6;
  configured: boolean;
}

export interface ManualSensor {
  name: string;
  tk: string;
  toc: string;
}

export interface Run {
  id: string;
  target: string;
  copies: string;
  adjustedUnits: number | null;
  luminaire: Luminaire;
  luminaireQty: string;
  emergencyEnabled: boolean;
  emergencyQty: string;
  sensorId: string;
  sensorRef: string;
  sensorQty: string;
  manualSensor: ManualSensor;
  moduleId: string;
  moduleRef: string;
  moduleQty: string;
}

export interface BomGroup {
  id: string;
  letter: string;
  overrides: Partial<Omit<Settings, "longTrunking">>;
  runs: Run[];
}

export type QuantityField =
  "luminaireQty" | "emergencyQty" | "sensorQty" | "moduleQty";
export type PlacementKind =
  "luminaire" | "emergencyLuminaire" | "sensor" | "emergencyModule" | "cover";

export interface Placement {
  id: string;
  kind: PlacementKind;
  reference: string;
  label: string;
  name: string;
  startMm: number;
  lengthMm: number;
  productId?: string;
}

export interface TrunkPlacement {
  product: Product;
  startMm: number;
  lengthMm: number;
}

export interface SensorPlan {
  minimum: number | null;
  coverageMm: number | null;
  radialMm: number | null;
  wallGapMm: number;
  covered: boolean;
  wallsCovered: boolean;
  inHeightRange: boolean;
  warnings: string[];
}

export interface RunPlan {
  runId: string;
  units: number;
  lengthMm: number;
  targetMm: number;
  deviationMm: number;
  trunking: TrunkPlacement[];
  placements: Placement[];
  suspensions: number[];
  sensor: SensorPlan;
  feasible: boolean;
  ready: boolean;
  warnings: string[];
  shorterUnits: number | null;
  longerUnits: number | null;
}

export interface ElectricalPlan {
  settings: Settings;
  requiresAux: boolean;
  greyPins: number;
  greenPins: number;
  factoryPins: number;
  batteryEmergency: boolean;
  batteryMainEmergency: boolean;
  auxiliaryEmergency: boolean;
  cbsAuxiliary: boolean;
  batteryAuxiliary: boolean;
  batteryAuxPair: [2, 4] | [10, 12];
  hasEmergency: boolean;
  convertedBattery: number;
  convertedCbs: number;
  batteryModules: number;
  cbsModules: number;
  reasons: string[];
}

export interface BomRow {
  id: string;
  reference: string;
  tk: string;
  toc: string;
  name: string;
  quantity: number;
  notes: string;
  category: string;
}

export interface GroupPlan {
  groupId: string;
  electrical: ElectricalPlan;
  runs: RunPlan[];
  rows: BomRow[];
  pendingRuns: number;
}

export const DEFAULT_SETTINGS: Settings = {
  cores: 13,
  control: "DALI",
  emergency: "Battery",
  testing: "Manual",
  lives: 2,
  neutrals: 1,
  height: "3",
  suspension: 1.5,
  endCap: "IP50",
  longTrunking: false,
};

let nextId = 0;
export const uid = (prefix: string) => `${prefix}-${++nextId}`;
export function syncUid(ids: string[]) {
  for (const id of ids) {
    const match = /-(\d+)$/.exec(id);
    if (match) nextId = Math.max(nextId, Number(match[1]));
  }
}

export function newRun(): Run {
  return {
    id: uid("run"),
    target: "",
    copies: "",
    adjustedUnits: null,
    luminaire: {
      reference: "",
      name: "782IP50 LW19 50-840DD L150 01",
      tk: "",
      toc: "",
      units: 4,
      configured: false,
    },
    luminaireQty: "",
    emergencyEnabled: false,
    emergencyQty: "",
    sensorId: "",
    sensorRef: "",
    sensorQty: "",
    manualSensor: { name: "", tk: "", toc: "" },
    moduleId: "",
    moduleRef: "",
    moduleQty: "",
  };
}

export function alphabet(index: number): string {
  let result = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
}

export function letterIndex(letter: string): number {
  let value = 0;
  for (const char of letter.toUpperCase()) {
    const code = char.charCodeAt(0) - 64;
    if (code < 1 || code > 26) return -1;
    value = value * 26 + code;
  }
  return value - 1;
}

export function newGroup(letter = "A"): BomGroup {
  return { id: uid("bom"), letter, overrides: {}, runs: [newRun()] };
}

export const quantity = (value: string) =>
  Number.isFinite(Number(value))
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(Number(value))))
    : 0;
const metresFormat = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 2,
});
const integerFormat = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
});
export const formatM = (millimetres: number) =>
  metresFormat.format(millimetres / 1000);
export const formatMm = (millimetres: number) =>
  integerFormat.format(millimetres);
export const formatQty = (value: number) => integerFormat.format(value);
