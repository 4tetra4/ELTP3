import { CATALOGUE_VERSION, LEGACY_PRODUCT_IDS, PRODUCTS } from "./catalogue";
import { fillReferences } from "./references";
import {
  alphabet,
  DEFAULT_SETTINGS,
  letterIndex,
  newRun,
  syncUid,
  uid,
  type BomGroup,
  type Run,
  type Settings,
} from "./types";

export const PROJECT_FORMAT = "E-Line planner project";
export const PROJECT_VERSION = 1;

export interface ProjectState {
  projectName: string;
  settings: Settings;
  groups: BomGroup[];
  notes: Record<string, string>;
}

type Data = Record<string, unknown>;
type GroupOverrides = BomGroup["overrides"];

const isRecord = (value: unknown): value is Data =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, fallback = "", limit = 500): string =>
  typeof value === "string"
    ? value.slice(0, limit)
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : fallback;

const numeric = (value: unknown): string => {
  const raw = text(value).trim();
  if (raw === "") return "";
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? raw : "";
};

function choose<T extends string | number>(
  value: unknown,
  options: readonly T[],
): T | undefined {
  return options.find((option) => option === value);
}

const SETTING_OPTIONS = {
  cores: [7, 13],
  control: ["DALI", "ET"],
  emergency: ["Battery", "CBS"],
  testing: ["Manual", "DST"],
  lives: [1, 2, 3],
  neutrals: [1, 2, 3],
  suspension: [1.5, 3, 5],
  endCap: ["IP20", "IP50"],
} as const;

function readOverrides(value: unknown): GroupOverrides {
  const overrides: GroupOverrides = {};
  if (!isRecord(value)) return overrides;
  for (const [key, options] of Object.entries(SETTING_OPTIONS)) {
    const picked = choose(value[key], options as readonly (string | number)[]);
    if (picked !== undefined) Object.assign(overrides, { [key]: picked });
  }
  if (typeof value.height === "string" || typeof value.height === "number")
    overrides.height = numeric(value.height);
  return overrides;
}

function readSettings(value: unknown): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  if (!isRecord(value)) return settings;
  Object.assign(settings, readOverrides(value));
  if (typeof value.longTrunking === "boolean")
    settings.longTrunking = value.longTrunking;
  return settings;
}

function productId(value: unknown, category: "sensor" | "emergency"): string {
  const raw = text(value);
  if (category === "sensor" && raw === "manual") return raw;
  const id = LEGACY_PRODUCT_IDS[raw] ?? raw;
  return PRODUCTS[id]?.category === category ? id : "";
}

function readRun(value: unknown, used: Set<string>): Run {
  const run = newRun();
  if (!isRecord(value)) return run;
  const id = text(value.id);
  if (id && !used.has(id)) run.id = id;
  used.add(run.id);
  run.target = numeric(value.target);
  run.copies = numeric(value.copies);
  const adjusted = Number(value.adjustedUnits);
  run.adjustedUnits =
    value.adjustedUnits !== null &&
    Number.isInteger(adjusted) &&
    adjusted >= 4 &&
    adjusted % 2 === 0
      ? adjusted
      : null;
  if (isRecord(value.luminaire)) {
    const luminaire = value.luminaire;
    run.luminaire = {
      reference: text(luminaire.reference, "", 40),
      name: text(luminaire.name, run.luminaire.name, 200),
      tk: text(luminaire.tk, "", 60),
      toc: text(luminaire.toc, "", 60),
      units: choose(luminaire.units, [4, 6] as const) ?? 4,
      configured: luminaire.configured === true,
    };
  }
  run.luminaireQty = numeric(value.luminaireQty);
  run.emergencyEnabled = value.emergencyEnabled === true;
  run.emergencyQty = run.emergencyEnabled ? numeric(value.emergencyQty) : "";
  run.sensorId = productId(value.sensorId, "sensor");
  run.sensorQty = run.sensorId ? numeric(value.sensorQty) : "";
  run.sensorRef = text(value.sensorRef, "", 40).trim();
  if (isRecord(value.manualSensor)) {
    const sensor = value.manualSensor;
    run.manualSensor = {
      name: text(sensor.name, "", 200),
      tk: text(sensor.tk, "", 60),
      toc: text(sensor.toc, "", 60),
    };
    if (!run.sensorRef && run.sensorId === "manual")
      run.sensorRef = text(sensor.reference, "", 40).trim();
  }
  run.moduleId = productId(value.moduleId, "emergency");
  run.moduleQty = run.moduleId ? numeric(value.moduleQty) : "";
  run.moduleRef = text(value.moduleRef, "", 40).trim();
  return run;
}

function migrateNotes(groups: BomGroup[], notes: Record<string, string>) {
  for (const group of groups)
    for (const run of group.runs)
      for (const [product, reference] of [
        [run.sensorId, run.sensorRef],
        [run.moduleId, run.moduleRef],
      ]) {
        if (!product || product === "manual") continue;
        const legacy = `${group.id}-${product}`;
        const current = `${legacy}-${reference.trim()}`;
        if (notes[legacy] !== undefined && notes[current] === undefined)
          notes[current] = notes[legacy];
      }
}

export function serializeProject(state: ProjectState, savedAt: Date): string {
  return JSON.stringify(
    {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      catalogueVersion: CATALOGUE_VERSION,
      savedAt: savedAt.toISOString(),
      projectName: state.projectName,
      settings: state.settings,
      groups: state.groups,
      notes: state.notes,
    },
    null,
    2,
  );
}

export function parseProject(source: string): ProjectState {
  let data: unknown;
  try {
    data = JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(
      "The selected file is not a valid E-Line planner project (.elpt) file.",
    );
  }
  if (!isRecord(data) || !Array.isArray(data.groups))
    throw new Error(
      "The selected file does not contain E-Line planner settings and runs.",
    );
  if (typeof data.version === "number" && data.version > PROJECT_VERSION)
    throw new Error(
      "This project was saved with a newer version of the E-Line planner. Please use the latest version to open it.",
    );
  const usedGroups = new Set<string>();
  const usedRuns = new Set<string>();
  const usedLetters = new Set<string>();
  const groups: BomGroup[] = data.groups.slice(0, 200).map((value, index) => {
    const source = isRecord(value) ? value : {};
    const id = text(source.id);
    const groupId = id && !usedGroups.has(id) ? id : uid("bom");
    usedGroups.add(groupId);
    let letter = text(source.letter).toUpperCase();
    if (letterIndex(letter) < 0 || !letter || usedLetters.has(letter)) {
      let next = index;
      while (usedLetters.has(alphabet(next))) next++;
      letter = alphabet(next);
    }
    usedLetters.add(letter);
    const runs = Array.isArray(source.runs)
      ? source.runs.slice(0, 500).map((run) => readRun(run, usedRuns))
      : [];
    return {
      id: groupId,
      letter,
      overrides: readOverrides(source.overrides),
      runs,
    };
  });
  if (!groups.length)
    throw new Error("The selected project file does not contain any BOM.");
  const notes: Record<string, string> = {};
  if (isRecord(data.notes))
    for (const [key, value] of Object.entries(data.notes))
      if (typeof value === "string") notes[key] = value.slice(0, 4000);
  fillReferences(groups);
  migrateNotes(groups, notes);
  syncUid([...usedGroups, ...usedRuns]);
  return {
    projectName: text(data.projectName, "", 90).trim(),
    settings: readSettings(data.settings),
    groups,
    notes,
  };
}
