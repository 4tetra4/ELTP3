import type { BomGroup, Run } from "./types";

export type ReferenceKind = "sensor" | "module";

export const REFERENCE_PREFIX: Record<ReferenceKind, string> = {
  sensor: "P",
  module: "E",
};

export const REFERENCE_FALLBACK: Record<ReferenceKind, string> = {
  sensor: "Sensor",
  module: "Emergency module",
};

export const productOf = (run: Run, kind: ReferenceKind) =>
  kind === "sensor" ? run.sensorId : run.moduleId;

export const referenceOf = (run: Run, kind: ReferenceKind) =>
  (kind === "sensor" ? run.sensorRef : run.moduleRef).trim();

const referenceField = (kind: ReferenceKind) =>
  kind === "sensor" ? "sensorRef" : "moduleRef";

export function isAutoReference(value: string, kind: ReferenceKind): boolean {
  const trimmed = value.trim();
  return (
    trimmed === "" ||
    new RegExp(`^${REFERENCE_PREFIX[kind]}\\d+$`, "i").test(trimmed)
  );
}

export function defaultReference(
  groups: BomGroup[],
  runId: string,
  kind: ReferenceKind,
  productId: string,
): string {
  if (!productId) return "";
  const others = groups
    .flatMap((group) => group.runs)
    .filter((run) => run.id !== runId && productOf(run, kind));
  if (productId !== "manual") {
    const shared = others.find(
      (run) => productOf(run, kind) === productId && referenceOf(run, kind),
    );
    if (shared) return referenceOf(shared, kind);
  }
  const prefix = REFERENCE_PREFIX[kind];
  const used = new Set(
    others.map((run) => referenceOf(run, kind).toUpperCase()),
  );
  let number = 1;
  while (used.has(`${prefix}${number}`)) number++;
  return `${prefix}${number}`;
}

export function fillReferences(groups: BomGroup[]) {
  for (const kind of ["sensor", "module"] as const)
    for (const run of groups.flatMap((group) => group.runs)) {
      const product = productOf(run, kind);
      if (product && !referenceOf(run, kind))
        run[referenceField(kind)] = defaultReference(
          groups,
          run.id,
          kind,
          product,
        );
    }
}
