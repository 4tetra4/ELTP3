import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  FileDown,
  FileText,
  FolderOpen,
  Plus,
  Save,
  ShieldAlert,
} from "lucide-react";
import { BillOfMaterials } from "./components/BillOfMaterials";
import { CoreDiagram } from "./components/CoreDiagram";
import { RunCard } from "./components/RunCard";
import { GroupSettings, ProjectSettings } from "./components/Settings";
import { FieldLabel, Modal, Segment, Toast, Tooltip } from "./components/ui";
import { buildPdf, hasExportableRuns } from "./pdf/exportPdf";
import { GRID_MM } from "./planner/catalogue";
import {
  calculateGroup,
  DALI_WARNING,
  maximumQuantity,
  nearestRunUnits,
  PINS_CONTRACTOR_NOTE,
  PINS_WARNING,
  resolveElectrical,
} from "./planner/engine";
import {
  parseProject,
  serializeProject,
  type ProjectState,
} from "./planner/projectFile";
import {
  defaultReference,
  isAutoReference,
  productOf,
  referenceOf,
  type ReferenceKind,
} from "./planner/references";
import {
  alphabet,
  DEFAULT_SETTINGS,
  formatM,
  formatMm,
  letterIndex,
  newGroup,
  newRun,
  quantity,
  type BomGroup,
  type Luminaire,
  type QuantityField,
  type Run,
  type Settings,
} from "./planner/types";
import {
  chooseSaveTarget,
  exportFileName,
  openTextFile,
  PDF_FILE,
  PROJECT_FILE,
  writeSaveTarget,
  type SaveTarget,
} from "./utils/files";

interface Notice {
  id: string;
  title: string;
  description: string;
  locked?: boolean;
  action?: string;
  onAction?: () => void;
}

interface DetailDialog {
  kind: "luminaire" | "sensor";
  groupId: string;
  runId: string;
}

export default function App() {
  const [projectName, setProjectName] = useState("");
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [groups, setGroups] = useState<BomGroup[]>(() => [newGroup()]);
  const [expanded, setExpanded] = useState(true);
  const [started, setStarted] = useState(false);
  const [detail, setDetail] = useState<DetailDialog | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const nextGroupIndex = useRef(1);
  const previousPins = useRef("");
  const previousForced = useRef("");
  const plans = useMemo(
    () => groups.map((group) => calculateGroup(group, settings)),
    [groups, settings],
  );
  const notify = useCallback(
    (notice: Notice) =>
      setNotices((previous) =>
        previous.some((item) => item.id === notice.id)
          ? previous
          : [...previous, notice],
      ),
    [],
  );
  const collapse = useCallback(() => setExpanded(false), []);
  const closeToast = useCallback(() => setToast(null), []);
  const pinsSignature = plans
    .map((plan) =>
      [
        plan.groupId,
        plan.electrical.greyPins > 0 ? "grey" : "",
        plan.electrical.greenPins > 0 ? "green" : "",
        plan.electrical.factoryPins > 0 ? "factory" : "",
      ].filter(Boolean),
    )
    .filter((parts) => parts.length > 1)
    .map((parts) => parts.join(":"))
    .join("|");

  useEffect(() => {
    if (pinsSignature && pinsSignature !== previousPins.current)
      notify({
        id: "pins",
        title: "Additional connector pins required",
        description: PINS_WARNING,
        locked: true,
        action: "Understand",
      });
    previousPins.current = pinsSignature;
  }, [pinsSignature, notify]);

  const forcedSignature = groups
    .map((group, index) =>
      (group.overrides.cores ?? settings.cores) === 7 &&
      plans[index]?.electrical.settings.cores === 13
        ? group.id
        : "",
    )
    .filter(Boolean)
    .join("|");

  useEffect(() => {
    const before = new Set(previousForced.current.split("|").filter(Boolean));
    previousForced.current = forcedSignature;
    const fresh = forcedSignature
      .split("|")
      .filter((id) => id && !before.has(id));
    if (!fresh.length) return;
    const details = fresh
      .map((id) => {
        const index = groups.findIndex((group) => group.id === id);
        return index < 0
          ? ""
          : `BOM ${groups[index].letter}: ${plans[index].electrical.reasons.join(" ")}`;
      })
      .filter(Boolean);
    const single = fresh.length === 1;
    notify({
      id: "cores",
      title: "13-core trunking is now required",
      description: `${details.join(" ")} The trunking and feed-in of ${single ? "this BOM have" : "these BOMs have"} been changed to 13 core. ${single ? "It returns" : "They return"} to 7 core automatically when these requirements no longer apply.`,
    });
  }, [forcedSignature]);

  const getRun = (groupId: string, runId: string) =>
    groups
      .find((group) => group.id === groupId)
      ?.runs.find((run) => run.id === runId);
  const patchRun = (groupId: string, runId: string, patch: Partial<Run>) =>
    setGroups((previous) =>
      previous.map((group) =>
        group.id === groupId
          ? {
              ...group,
              runs: group.runs.map((run) =>
                run.id === runId ? { ...run, ...patch } : run,
              ),
            }
          : group,
      ),
    );
  const coreNotice = (reasons: string[]) =>
    notify({
      id: "cores",
      title: "13-core trunking is required",
      description: `${reasons.join(" ")} The planner has kept the 13-core system. 7 cores can be used with one neutral and without auxiliary emergency circuits (CBS emergency, or battery emergency with three switched lives). DALI control and DST monitoring work on 7 cores.`,
    });

  const changeSettings = (patch: Partial<Settings>, groupId?: string) => {
    const group = groups.find((item) => item.id === groupId);
    const current = group
      ? plans.find((plan) => plan.groupId === groupId)!.electrical.settings
      : settings;
    const relevantRuns = group
      ? group.runs
      : groups
          .filter((item) => item.overrides.control === undefined)
          .flatMap((item) => item.runs);
    const proposed = { ...current, ...patch };
    if (patch.control === "ET" && relevantRuns.some((run) => run.sensorId)) {
      proposed.control = "DALI";
      notify({
        id: "dali",
        title: "Sensors need a DALI system",
        description: DALI_WARNING,
      });
    }
    const resolved = resolveElectrical(proposed, group ? group.runs : []);
    if (proposed.cores === 7 && resolved.settings.cores === 13)
      coreNotice(resolved.reasons);
    if (patch.suspension === 5 && current.suspension !== 5)
      notify({
        id: "suspension",
        title: "Is a 5 m suspension kit required?",
        description:
          "The 5 m suspension kit is normally used only on a small number of specialist data-centre projects. Please double-check that this length is genuinely required and choose a shorter kit where possible to reduce material use.",
      });
    if (!group) setSettings(resolved.settings);
    else {
      const nextPatch = {
        ...patch,
        ...(resolved.settings.cores !== proposed.cores
          ? { cores: resolved.settings.cores }
          : {}),
        ...(resolved.settings.control !== current.control || patch.control
          ? { control: resolved.settings.control }
          : {}),
      };
      setGroups((previous) =>
        previous.map((item) => {
          if (item.id !== groupId) return item;
          const overrides = { ...item.overrides };
          for (const [key, value] of Object.entries(nextPatch)) {
            if (key === "longTrunking") continue;
            const field = key as keyof typeof overrides;
            if (value === settings[field]) delete overrides[field];
            else Object.assign(overrides, { [field]: value });
          }
          return { ...item, overrides };
        }),
      );
    }
  };

  const updateRun = (groupId: string, runId: string, patch: Partial<Run>) => {
    const run = getRun(groupId, runId);
    if (!run) return;
    const group = groups.find((item) => item.id === groupId)!;
    const plan = plans.find((item) => item.groupId === groupId)!;
    if (patch.target !== undefined && Number(patch.target) > 10000) {
      patch.target = "10000";
      notify({
        id: "length-limit",
        title: "Run length limit",
        description:
          "The interactive planner supports a maximum of 10,000 m per run. The length has been set to this limit.",
      });
    }
    if (patch.sensorId && plan.electrical.settings.control === "ET") {
      if (group.overrides.control !== undefined)
        setGroups((previous) =>
          previous.map((item) =>
            item.id === groupId
              ? {
                  ...item,
                  overrides: { ...item.overrides, control: "DALI" },
                }
              : item,
          ),
        );
      else
        setSettings((previous) => ({
          ...previous,
          control: "DALI",
        }));
      notify({
        id: "dali",
        title: "Sensors need a DALI system",
        description: DALI_WARNING,
      });
    }
    if (
      patch.sensorId !== undefined &&
      patch.sensorId !== run.sensorId &&
      isAutoReference(run.sensorRef, "sensor")
    )
      patch.sensorRef = defaultReference(
        groups,
        runId,
        "sensor",
        patch.sensorId,
      );
    if (
      patch.moduleId !== undefined &&
      patch.moduleId !== run.moduleId &&
      isAutoReference(run.moduleRef, "module")
    )
      patch.moduleRef = defaultReference(
        groups,
        runId,
        "module",
        patch.moduleId,
      );
    const next = { ...run, ...patch };
    if (patch.moduleId && next.moduleQty && Number(next.target) > 0) {
      const units =
        next.adjustedUnits ?? nearestRunUnits(Number(next.target) * 1000);
      const maximum = maximumQuantity(next, "moduleQty", units);
      if (quantity(next.moduleQty) > maximum) {
        patch.moduleQty = String(maximum);
        notify({
          id: "capacity",
          title: "Not enough space in this run",
          description: `This emergency module has a different physical length. Its quantity has been adjusted to the largest feasible value, ${maximum}. Other quantities have been kept.`,
        });
      }
    }
    patchRun(groupId, runId, patch);
  };

  const updateQuantity = (
    groupId: string,
    runId: string,
    field: QuantityField,
    value: string,
  ) => {
    const run = getRun(groupId, runId);
    const plan = plans
      .find((group) => group.groupId === groupId)
      ?.runs.find((item) => item.runId === runId);
    if (!run || !plan) return;
    const requested = quantity(value);
    const maximum = maximumQuantity(run, field, plan.units);
    const next = value === "" ? "" : String(Math.min(requested, maximum));
    patchRun(groupId, runId, { [field]: next });
    if (requested > maximum)
      notify({
        id: "capacity",
        title: "Not enough space in this run",
        description: `The requested quantity of ${requested} cannot fit the ${formatM(plan.lengthMm)} m run alongside the other geartrays. The field has been set to the largest feasible quantity: ${maximum}. Increase the run length to add more.`,
      });
  };

  const updateLuminaire = (
    groupId: string,
    runId: string,
    patch: Partial<Luminaire>,
  ) => {
    const run = getRun(groupId, runId);
    if (!run) return;
    const luminaire = { ...run.luminaire, ...patch, configured: true };
    if (patch.name !== undefined) {
      if (/L225/i.test(patch.name)) luminaire.units = 6;
      else if (/L150/i.test(patch.name)) luminaire.units = 4;
    }
    const next = { ...run, luminaire };
    if (luminaire.units !== run.luminaire.units && Number(run.target) > 0) {
      const units =
        run.adjustedUnits ?? nearestRunUnits(Number(run.target) * 1000);
      const maxNormal = maximumQuantity(next, "luminaireQty", units);
      if (quantity(next.luminaireQty) > maxNormal)
        next.luminaireQty = String(maxNormal);
      const maxEmergency = maximumQuantity(next, "emergencyQty", units);
      if (quantity(next.emergencyQty) > maxEmergency)
        next.emergencyQty = String(maxEmergency);
      if (
        next.luminaireQty !== run.luminaireQty ||
        next.emergencyQty !== run.emergencyQty
      )
        notify({
          id: "capacity",
          title: "Luminaire quantities adjusted",
          description:
            "The longer luminaire geartray does not fit the existing quantities. Normal and emergency luminaire quantities have been reduced to the largest feasible combination. Sensor and standalone emergency quantities have been kept.",
        });
    }
    patchRun(groupId, runId, next);
  };

  const openLuminaire = (groupId: string, runId: string) => {
    const run = getRun(groupId, runId);
    if (!run) return;
    if (!run.luminaire.configured)
      patchRun(groupId, runId, {
        luminaire: { ...run.luminaire, configured: true },
      });
    setDetail({ kind: "luminaire", groupId, runId });
  };

  const setReference = (
    groupId: string,
    runId: string,
    kind: ReferenceKind,
    value: string,
  ) =>
    patchRun(
      groupId,
      runId,
      kind === "sensor" ? { sensorRef: value } : { moduleRef: value },
    );

  const restoreReference = (
    groupId: string,
    runId: string,
    kind: ReferenceKind,
  ) => {
    const run = getRun(groupId, runId);
    if (!run || referenceOf(run, kind) || !productOf(run, kind)) return;
    setReference(
      groupId,
      runId,
      kind,
      defaultReference(groups, runId, kind, productOf(run, kind)),
    );
  };

  const closeDetail = () => {
    const was = detail;
    setDetail(null);
    if (was?.kind === "sensor")
      restoreReference(was.groupId, was.runId, "sensor");
    if (was?.kind === "luminaire")
      setTimeout(() => {
        document
          .getElementById(`${was.runId}-copies`)
          ?.closest(".run-card")
          ?.querySelector<HTMLInputElement>(".luminaire-field .quantity-input")
          ?.focus();
      }, 60);
  };

  const deleteRun = (groupId: string, run: Run, index: number) => {
    const remove = () => {
      setGroups((previous) =>
        previous.map((group) =>
          group.id === groupId
            ? {
                ...group,
                runs: group.runs.filter((item) => item.id !== run.id),
              }
            : group,
        ),
      );
      setToast(
        `Run ${String(index + 1).padStart(2, "0")} removed. The BOM has been recalculated.`,
      );
    };
    if (run.target || run.copies || run.luminaire.configured)
      notify({
        id: `delete-${run.id}`,
        title: `Delete Run ${String(index + 1).padStart(2, "0")}?`,
        description:
          "This run and its quantities will be removed from the bill of materials. Other runs and BOM settings will not change.",
        action: "Delete run",
        onAction: remove,
      });
    else remove();
  };

  const addRun = (groupId: string) => {
    const run = newRun();
    setGroups((previous) =>
      previous.map((group) =>
        group.id === groupId ? { ...group, runs: [...group.runs, run] } : group,
      ),
    );
    setTimeout(() => document.getElementById(`${run.id}-length`)?.focus(), 70);
  };

  const addGroup = () => {
    const group = newGroup(alphabet(nextGroupIndex.current++));
    setGroups((previous) => [...previous, group]);
    setTimeout(
      () => document.getElementById(`${group.runs[0].id}-length`)?.focus(),
      70,
    );
  };

  const copy = async (text: string, label: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext)
        await navigator.clipboard.writeText(text);
      else {
        const element = document.createElement("textarea");
        element.value = text;
        element.style.position = "fixed";
        element.style.opacity = "0";
        document.body.appendChild(element);
        element.select();
        const success = document.execCommand("copy");
        element.remove();
        if (!success) throw new Error("Clipboard unavailable");
      }
      setToast(`${label} copied to clipboard.`);
      return true;
    } catch {
      setToast(
        "Clipboard access is unavailable. Allow clipboard permission in your browser and try again.",
      );
      return false;
    }
  };

  const detailRun = detail ? getRun(detail.groupId, detail.runId) : null;
  const notice = notices[0];
  const closeNotice = () => setNotices((previous) => previous.slice(1));
  const displayName = projectName.trim() || "E-Line Pro";

  const savedMessage = (label: string, target: SaveTarget) =>
    target.kind === "picker"
      ? `${label} saved as "${target.fileName}".`
      : `${label} saved as "${target.fileName}" in your downloads folder. Your browser does not offer a save dialog here; to choose the location every time, enable "Ask where to save each file" in the browser settings.`;

  const saveProject = async () => {
    const date = new Date();
    const fileName = exportFileName(displayName, PROJECT_FILE.extension, date);
    const target = await chooseSaveTarget(fileName, PROJECT_FILE);
    if (!target) return;
    try {
      const content = serializeProject(
        { projectName: displayName, settings, groups, notes },
        date,
      );
      await writeSaveTarget(
        target,
        new Blob([content], { type: "application/json" }),
      );
      if (!projectName.trim()) setProjectName(displayName);
      setToast(savedMessage("Project", target));
    } catch {
      setToast("The project could not be saved. Please try again.");
    }
  };

  const applyProject = (state: ProjectState, fileName: string) => {
    setProjectName(state.projectName || "E-Line Pro");
    setSettings(state.settings);
    setGroups(state.groups);
    setNotes(state.notes);
    setDetail(null);
    nextGroupIndex.current = Math.max(
      state.groups.length,
      ...state.groups.map((group) => letterIndex(group.letter) + 1),
    );
    const hasRuns = state.groups.some((group) =>
      group.runs.some((run) => Number(run.target) > 0),
    );
    setStarted(hasRuns);
    setExpanded(!hasRuns);
    setToast(`Project "${fileName}" loaded.`);
  };

  const loadProject = async () => {
    let file: { name: string; text: string } | null;
    try {
      file = await openTextFile(".elpt,application/json");
    } catch {
      setToast("The selected file could not be read. Please try again.");
      return;
    }
    if (!file) return;
    let state: ProjectState;
    try {
      state = parseProject(file.text);
    } catch (error) {
      notify({
        id: "load-error",
        title: "This file cannot be loaded",
        description:
          error instanceof Error
            ? error.message
            : "The selected file is not a valid E-Line planner project.",
      });
      return;
    }
    const loaded = file;
    const hasContent = groups.some((group) =>
      group.runs.some(
        (run) => run.target || run.copies || run.luminaire.configured,
      ),
    );
    if (hasContent)
      notify({
        id: "load-confirm",
        title: `Load "${state.projectName || loaded.name}"?`,
        description:
          "The current project settings, runs and BOM notes will be replaced by the loaded project. Save the current project first if you want to keep it.",
        action: "Load project",
        onAction: () => applyProject(state, loaded.name),
      });
    else applyProject(state, loaded.name);
  };

  const exportPdf = async () => {
    if (exporting) return;
    if (!hasExportableRuns(plans)) {
      notify({
        id: "pdf-empty",
        title: "Nothing to export yet",
        description:
          "Enter at least one run length before exporting the PDF. The PDF contains the run inputs with their BOM settings, the run layouts, the core diagrams and the bills of materials.",
      });
      return;
    }
    const date = new Date();
    const fileName = exportFileName(displayName, PDF_FILE.extension, date);
    const target = await chooseSaveTarget(fileName, PDF_FILE);
    if (!target) return;
    setExporting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      const blob = buildPdf({
        projectName: displayName,
        groups,
        plans,
        notes,
        date,
      });
      await writeSaveTarget(target, blob);
      setToast(savedMessage("PDF", target));
    } catch {
      setToast("The PDF could not be created. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <header className="site-header">
        <div className="header-inner page-width">
          <div className="brand">
            <h1>
              E-Line <strong>Pro</strong>
            </h1>
            <span>System planner</span>
          </div>
          <nav className="header-actions" aria-label="Project file actions">
            <Tooltip content="Save the project settings and runs as an E-Line planner project file (.elpt). You will be asked where to save it.">
              <button
                type="button"
                className="button button-outline"
                onClick={() => void saveProject()}
              >
                <Save size={15} strokeWidth={1.6} />
                <span>Save</span>
              </button>
            </Tooltip>
            <Tooltip content="Open a saved E-Line planner project file (.elpt). The settings, runs and BOM notes are restored.">
              <button
                type="button"
                className="button button-outline"
                onClick={() => void loadProject()}
              >
                <FolderOpen size={16} strokeWidth={1.6} />
                <span>Load</span>
              </button>
            </Tooltip>
            <Tooltip content="Export the run inputs with their BOM settings, the run layouts, core diagrams and bills of materials as an A4 vector PDF. You will be asked where to save it.">
              <button
                type="button"
                className="button button-red"
                disabled={exporting}
                aria-busy={exporting}
                onClick={() => void exportPdf()}
              >
                <FileText size={15} strokeWidth={1.6} />
                <span>{exporting ? "Exporting PDF" : "Export to PDF"}</span>
              </button>
            </Tooltip>
            <Tooltip content="AutoCAD export will be available in a future version.">
              <button
                type="button"
                aria-disabled="true"
                className="button button-dark"
              >
                <FileDown size={15} strokeWidth={1.6} />
                <span>Export to AutoCAD</span>
              </button>
            </Tooltip>
          </nav>
        </div>
      </header>
      <main className="page-width main-content">
        <ProjectSettings
          name={projectName}
          onName={setProjectName}
          settings={settings}
          onChange={(patch) => changeSettings(patch)}
          expanded={expanded}
          onExpand={() => setExpanded(true)}
          onCollapse={collapse}
          started={started}
        />
        <section className="runs-section" aria-labelledby="runs-heading">
          <div className="section-heading">
            <span className="section-number">02</span>
            <h2 id="runs-heading">E-Line runs</h2>
          </div>
          <div className="run-groups">
            {groups.map((group, groupIndex) => {
              const plan = plans[groupIndex];
              return (
                <div className="run-group" key={group.id}>
                  <GroupSettings
                    group={group}
                    electrical={plan.electrical}
                    project={settings}
                    onChange={(patch) => changeSettings(patch, group.id)}
                    onReset={(keys) =>
                      setGroups((previous) =>
                        previous.map((item) => {
                          if (item.id !== group.id) return item;
                          const overrides = { ...item.overrides };
                          keys.forEach((key) => delete overrides[key]);
                          return { ...item, overrides };
                        }),
                      )
                    }
                    onPins={() =>
                      notify({
                        id: "pins",
                        title: "Additional connector pins required",
                        description: PINS_WARNING,
                        locked: true,
                        action: "Understand",
                      })
                    }
                  />
                  <div className="run-list">
                    {group.runs.map((run, index) => (
                      <RunCard
                        key={run.id}
                        run={run}
                        index={index}
                        plan={plan.runs[index]}
                        settings={plan.electrical.settings}
                        onChange={(patch) => updateRun(group.id, run.id, patch)}
                        onQuantity={(field, value) =>
                          updateQuantity(group.id, run.id, field, value)
                        }
                        onReference={(kind, value) =>
                          setReference(group.id, run.id, kind, value)
                        }
                        onRestoreReference={(kind) =>
                          restoreReference(group.id, run.id, kind)
                        }
                        onEditLuminaire={() => openLuminaire(group.id, run.id)}
                        onEditSensor={() =>
                          setDetail({
                            kind: "sensor",
                            groupId: group.id,
                            runId: run.id,
                          })
                        }
                        onStart={() => {
                          setStarted(true);
                          setExpanded(false);
                        }}
                        onDelete={() => deleteRun(group.id, run, index)}
                      />
                    ))}
                  </div>
                  {group.runs.length === 0 && (
                    <div className="no-runs">
                      This BOM has no runs. Add a run below to start planning.
                    </div>
                  )}
                  <CoreDiagram
                    letter={group.letter}
                    electrical={plan.electrical}
                  />
                  <div className="add-run-actions">
                    <button
                      type="button"
                      className="button button-outline add-run-button"
                      onClick={() => addRun(group.id)}
                    >
                      <Plus size={16} strokeWidth={1.5} />
                      <span>Add a further run using the same BOM</span>
                      <span className="button-bom-label">
                        BOM {group.letter}
                      </span>
                    </button>
                    {groupIndex === groups.length - 1 && (
                      <button
                        type="button"
                        className="button button-outline add-run-button"
                        onClick={addGroup}
                      >
                        <Plus size={16} strokeWidth={1.5} />
                        <span>Add a further run using a new BOM</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="bom-section" aria-labelledby="bom-heading">
          <div className="section-heading">
            <span className="section-number">03</span>
            <h2 id="bom-heading">Bill of materials</h2>
          </div>
          <div className="bom-groups">
            {groups.map((group, index) => (
              <BillOfMaterials
                key={group.id}
                group={group}
                plan={plans[index]}
                notes={notes}
                onNote={(id, text) =>
                  setNotes((previous) => ({ ...previous, [id]: text }))
                }
                onCopy={copy}
              />
            ))}
          </div>
        </section>
        <footer className="page-footer">
          <span>
            <strong>E-Line Pro</strong> System planner
          </span>
          <span>Verify the final specification before installation.</span>
        </footer>
      </main>
      {notice ? (
        <Modal
          key={notice.id}
          title={notice.title}
          eyebrow={notice.locked ? "Installation notice" : "Planning notice"}
          description={notice.description}
          locked={notice.locked}
          onClose={() => {
            if (!notice.locked) closeNotice();
          }}
          action={notice.action || "OK"}
          onAction={() => {
            closeNotice();
            notice.onAction?.();
          }}
          variant={notice.locked ? "pins-modal" : ""}
        >
          {notice.locked && (
            <div className="pins-callout">
              <ShieldAlert size={18} />
              <span>{PINS_CONTRACTOR_NOTE}</span>
            </div>
          )}
        </Modal>
      ) : detail && detailRun ? (
        <Modal
          key={`${detail.kind}-${detail.runId}`}
          title={
            detail.kind === "luminaire"
              ? "Add luminaire details"
              : "Add sensor details"
          }
          eyebrow={
            detail.kind === "luminaire"
              ? "Luminaire specification"
              : "Sensor specification"
          }
          description="Enter the product information for this run. Changes are applied as you type."
          onClose={closeDetail}
        >
          {detail.kind === "luminaire" ? (
            <div
              className="detail-form"
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  (event.target as HTMLElement).tagName === "INPUT"
                ) {
                  event.preventDefault();
                  const fields = [
                    ...event.currentTarget.querySelectorAll<HTMLInputElement>(
                      "input",
                    ),
                  ];
                  const i = fields.indexOf(event.target as HTMLInputElement);
                  if (fields[i + 1]) fields[i + 1].focus();
                  else closeDetail();
                }
              }}
            >
              <div className="detail-product-row">
                <div>
                  <FieldLabel
                    htmlFor="luminaire-reference"
                    info="Use your project luminaire reference, for example A1 or B1. The emergency variant adds /E automatically."
                  >
                    Reference
                  </FieldLabel>
                  <input
                    id="luminaire-reference"
                    data-autofocus
                    placeholder="e.g. A1"
                    value={detailRun.luminaire.reference}
                    onChange={(event) =>
                      updateLuminaire(detail.groupId, detail.runId, {
                        reference: event.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="luminaire-name">Product name</FieldLabel>
                  <input
                    id="luminaire-name"
                    value={detailRun.luminaire.name}
                    placeholder="Enter product name"
                    onChange={(event) =>
                      updateLuminaire(detail.groupId, detail.runId, {
                        name: event.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="detail-number-row">
                <div>
                  <FieldLabel htmlFor="luminaire-tk">TK number</FieldLabel>
                  <input
                    id="luminaire-tk"
                    placeholder="optional"
                    value={detailRun.luminaire.tk}
                    onChange={(event) =>
                      updateLuminaire(detail.groupId, detail.runId, {
                        tk: event.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="luminaire-toc">
                    TOC / Config ID
                  </FieldLabel>
                  <input
                    id="luminaire-toc"
                    placeholder="optional"
                    value={detailRun.luminaire.toc}
                    onChange={(event) =>
                      updateLuminaire(detail.groupId, detail.runId, {
                        toc: event.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="detail-length">
                <FieldLabel info="Nominal 1.5 m corresponds to a physical length of 1,475 mm. Nominal 2.25 m corresponds to 2,212.5 mm. A product name containing L225 automatically selects 2.25 m.">
                  Nominal luminaire length
                </FieldLabel>
                <Segment
                  label="Nominal luminaire length"
                  value={detailRun.luminaire.units}
                  options={[
                    { value: 4, label: "1.5 m" },
                    { value: 6, label: "2.25 m" },
                  ]}
                  onChange={(units) =>
                    updateLuminaire(detail.groupId, detail.runId, { units })
                  }
                />
                <span className="physical-length-note">
                  {formatMm(detailRun.luminaire.units * GRID_MM)} mm physical
                  length
                </span>
              </div>
            </div>
          ) : (
            <div className="detail-form">
              <div className="detail-product-row">
                <div>
                  <FieldLabel htmlFor="sensor-reference">Reference</FieldLabel>
                  <input
                    id="sensor-reference"
                    data-autofocus
                    placeholder="e.g. P1"
                    maxLength={40}
                    value={detailRun.sensorRef}
                    onChange={(event) =>
                      setReference(
                        detail.groupId,
                        detail.runId,
                        "sensor",
                        event.target.value,
                      )
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="sensor-name">Product name</FieldLabel>
                  <input
                    id="sensor-name"
                    placeholder="Enter product name"
                    value={detailRun.manualSensor.name}
                    onChange={(event) =>
                      patchRun(detail.groupId, detail.runId, {
                        manualSensor: {
                          ...detailRun.manualSensor,
                          name: event.target.value,
                        },
                      })
                    }
                  />
                </div>
              </div>
              <div className="detail-number-row">
                <div>
                  <FieldLabel htmlFor="sensor-tk">TK number</FieldLabel>
                  <input
                    id="sensor-tk"
                    placeholder="optional"
                    value={detailRun.manualSensor.tk}
                    onChange={(event) =>
                      patchRun(detail.groupId, detail.runId, {
                        manualSensor: {
                          ...detailRun.manualSensor,
                          tk: event.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="sensor-toc">TOC / Config ID</FieldLabel>
                  <input
                    id="sensor-toc"
                    placeholder="optional"
                    value={detailRun.manualSensor.toc}
                    onChange={(event) =>
                      patchRun(detail.groupId, detail.runId, {
                        manualSensor: {
                          ...detailRun.manualSensor,
                          toc: event.target.value,
                        },
                      })
                    }
                  />
                </div>
              </div>
              <div className="manual-sensor-note">
                Fixed {formatMm(GRID_MM)} mm geartray. Coverage and quantity
                recommendations are not available for manually entered sensors.
              </div>
            </div>
          )}
        </Modal>
      ) : null}
      {toast && <Toast message={toast} onClose={closeToast} />}
      <a className="skip-link" href="#runs-heading">
        Skip to run parameters
        <ArrowRight size={14} />
      </a>
    </>
  );
}
