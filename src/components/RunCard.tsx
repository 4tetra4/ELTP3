import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Lightbulb,
  Pencil,
  Plus,
  Ruler,
  Trash2,
  TriangleAlert,
  WandSparkles,
  X,
} from "lucide-react";
import { EMERGENCY_MODULES, PRODUCTS, SENSORS } from "../planner/catalogue";
import { emergencySuffix } from "../planner/engine";
import type { ReferenceKind } from "../planner/references";
import {
  formatM,
  formatMm,
  quantity,
  type Placement,
  type QuantityField,
  type Run,
  type RunPlan,
  type Settings,
} from "../planner/types";
import { FieldLabel, Info, Tooltip } from "./ui";

function advance(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Enter" && event.key !== "Tab") return;
  const element = event.target as HTMLElement;
  if (element.tagName === "BUTTON") return;
  if (
    event.key === "Tab" &&
    !(element instanceof HTMLInputElement && element.type === "number")
  )
    return;
  const entries = [
    ...document.querySelectorAll<HTMLElement>("[data-entry]:not(:disabled)"),
  ];
  const next = entries[entries.indexOf(element) + (event.shiftKey ? -1 : 1)];
  if (next) {
    event.preventDefault();
    next.focus();
  } else if (event.key === "Enter") {
    event.preventDefault();
    element.blur();
  }
}

function ReferenceBox({
  kind,
  value,
  label,
  onChange,
  onRestore,
}: {
  kind: ReferenceKind;
  value: string;
  label: string;
  onChange: (value: string) => void;
  onRestore: () => void;
}) {
  return (
    <Tooltip
      className="reference-anchor"
      hoverOnly
      content="Reference used in the run layout, the PDF and the BOM. Click to edit."
    >
      <label className={`reference-box ${kind}`}>
        <span aria-hidden="true">{value || " "}</span>
        <input
          value={value}
          maxLength={40}
          spellCheck={false}
          autoComplete="off"
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => {
            if (!value.trim()) onRestore();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            const next = event.currentTarget
              .closest(".product-quantity-row")
              ?.querySelector<HTMLInputElement>(".quantity-input:not(:disabled)");
            if (next) next.focus();
            else event.currentTarget.blur();
          }}
        />
      </label>
    </Tooltip>
  );
}

function GearTooltip({ item }: { item: Placement }) {
  return (
    <div className="product-tooltip">
      <strong>{item.reference}</strong>
      <span>{item.name}</span>
      <span className="tooltip-dimension">
        Physical length <b>{formatMm(item.lengthMm)} mm</b>
      </span>
    </div>
  );
}

export function RunLayout({
  plan,
  settings,
}: {
  plan: RunPlan;
  settings: Settings;
}) {
  const legends = [
    ["luminaire", "Luminaire"],
    ["emergencyLuminaire", "Emergency luminaire"],
    ["sensor", "Sensor"],
    ["emergencyModule", "Emergency module"],
    ["cover", "Blank cover"],
    [
      "suspension",
      `Suspension${plan.units ? ` (${plan.suspensions.length})` : ""}`,
    ],
  ];
  return (
    <div className="run-layout">
      <div className="layout-heading">
        <span>Run layout</span>
        <div className="layout-legend">
          {legends.map(([kind, label]) => (
            <span key={kind}>
              <i className={`legend-swatch ${kind}`} />
              {label}
            </span>
          ))}
        </div>
        <Info>
          Physical component positions are calculated in 368.75 mm increments.
          Blank covers are never cut. Hover over an element to see its
          reference, product name and physical length.
        </Info>
      </div>
      {plan.units > 0 ? (
        <div className="layout-scroll">
          <div
            className="layout-drawing"
            style={{
              minWidth:
                plan.units > 160 ? Math.min(2200, plan.units * 6) : undefined,
            }}
          >
            <div className="suspension-track">
              {plan.suspensions.map((position, index) => (
                <span
                  className="suspension-position"
                  key={position}
                  style={{ left: `${(position / plan.lengthMm) * 100}%` }}
                >
                  <Tooltip
                    content={
                      <div className="product-tooltip">
                        <strong>Suspension {index + 1}</strong>
                        <span>
                          {PRODUCTS[`suspension-${settings.suspension}`].name}
                        </span>
                        <span className="tooltip-dimension">
                          Position <b>{formatMm(position)} mm</b>
                        </span>
                        <span className="tooltip-dimension">
                          Cable length{" "}
                          <b>{formatMm(settings.suspension * 1000)} mm</b>
                        </span>
                      </div>
                    }
                  >
                    <span
                      className="suspension-marker"
                      tabIndex={0}
                      aria-label={`Suspension at ${formatMm(position)} mm`}
                    />
                  </Tooltip>
                </span>
              ))}
            </div>
            <div className="trunking-track">
              {plan.trunking.map((item, index) => (
                <span
                  key={index}
                  className="layout-positioned"
                  style={{
                    left: `${(item.startMm / plan.lengthMm) * 100}%`,
                    width: `${(item.lengthMm / plan.lengthMm) * 100}%`,
                  }}
                >
                  <Tooltip
                    className="layout-tooltip-target"
                    content={
                      <div className="product-tooltip">
                        <strong>Trunking</strong>
                        <span>{item.product.name}</span>
                        <span className="tooltip-dimension">
                          Physical length <b>{formatMm(item.lengthMm)} mm</b>
                        </span>
                      </div>
                    }
                  >
                    <span className="trunking-piece" tabIndex={0}>
                      {item.lengthMm / plan.lengthMm > 0.035
                        ? `${item.product.nominal}${item.product.end ? " E" : ""}`
                        : ""}
                    </span>
                  </Tooltip>
                </span>
              ))}
            </div>
            <div
              className={`geartray-track ${!plan.feasible ? "infeasible-track" : ""}`}
            >
              {plan.placements.map((item) => (
                <span
                  className="layout-positioned"
                  key={item.id}
                  style={{
                    left: `${(item.startMm / plan.lengthMm) * 100}%`,
                    width: `${(item.lengthMm / plan.lengthMm) * 100}%`,
                  }}
                >
                  <Tooltip
                    className="layout-tooltip-target"
                    content={<GearTooltip item={item} />}
                  >
                    <span
                      tabIndex={0}
                      className={`geartray-piece ${item.kind}`}
                      aria-label={`${item.reference}, ${item.name}, ${formatMm(item.lengthMm)} mm`}
                    >
                      {item.lengthMm / plan.lengthMm > 0.018 ? item.label : ""}
                    </span>
                  </Tooltip>
                </span>
              ))}
              {!plan.feasible && (
                <span className="layout-invalid-label">
                  Geartray quantities exceed the available run length
                </span>
              )}
            </div>
            <div className="layout-axis">
              <span>0 m</span>
              <span>{formatM(plan.lengthMm)} m</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="layout-empty">
          <div className="empty-layout-line">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="layout-empty-prompt">
            <Ruler size={15} />
            Enter a run length to preview your layout
          </span>
        </div>
      )}
    </div>
  );
}

export function RunCard({
  run,
  index,
  plan,
  settings,
  onChange,
  onQuantity,
  onReference,
  onRestoreReference,
  onEditLuminaire,
  onEditSensor,
  onStart,
  onDelete,
}: {
  run: Run;
  index: number;
  plan: RunPlan;
  settings: Settings;
  onChange: (patch: Partial<Run>) => void;
  onQuantity: (field: QuantityField, value: string) => void;
  onReference: (kind: ReferenceKind, value: string) => void;
  onRestoreReference: (kind: ReferenceKind) => void;
  onEditLuminaire: () => void;
  onEditSensor: () => void;
  onStart: () => void;
  onDelete: () => void;
}) {
  const configured = run.luminaire.configured;
  const [emergencyBadge, setEmergencyBadge] = useState<HTMLSpanElement | null>(
    null,
  );
  const [badgeWidth, setBadgeWidth] = useState(0);
  useLayoutEffect(() => {
    if (!emergencyBadge) {
      setBadgeWidth(0);
      return;
    }
    const update = () =>
      setBadgeWidth(emergencyBadge.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(emergencyBadge);
    return () => observer.disconnect();
  }, [emergencyBadge]);
  const inputQuantity = (
    field: QuantityField,
    label: string,
    disabled = false,
  ) => (
    <input
      className="quantity-input"
      data-entry
      type="number"
      min="0"
      step="1"
      aria-label={`${label}, run ${index + 1}`}
      placeholder="Qty"
      value={run[field]}
      disabled={disabled || !plan.units}
      onChange={(event) => onQuantity(field, event.target.value)}
    />
  );
  const sensorWarnings = plan.sensor.warnings;
  const recommend = plan.sensor.minimum;
  const displayReference = run.luminaire.reference;
  return (
    <article
      className="run-card"
      onKeyDown={advance}
      aria-label={`Run ${index + 1}`}
    >
      <header className="run-card-header">
        <span className="run-index">{String(index + 1).padStart(2, "0")}</span>
        <h3>Run {String(index + 1).padStart(2, "0")}</h3>
        <span className="run-header-divider" />
        <span className="quantities-caption">Quantities per run</span>
        <Tooltip content="Delete this run and remove its components from the BOM.">
          <button
            type="button"
            className="icon-button delete-run"
            aria-label={`Delete run ${index + 1}`}
            onClick={onDelete}
          >
            <Trash2 size={15} strokeWidth={1.5} />
          </button>
        </Tooltip>
      </header>
      <div
        className="run-inputs"
        style={
          badgeWidth
            ? ({ "--ref-min": `${badgeWidth}px` } as CSSProperties)
            : undefined
        }
      >
        <div className="run-length-field">
          <FieldLabel htmlFor={`${run.id}-length`}>Run length</FieldLabel>
          <div className="unit-input">
            <input
              id={`${run.id}-length`}
              data-entry
              type="number"
              min="0"
              max="10000"
              step="0.01"
              value={run.target}
              placeholder="Length"
              aria-label={`Run length, run ${index + 1}`}
              onFocus={onStart}
              onChange={(event) =>
                onChange({ target: event.target.value, adjustedUnits: null })
              }
            />
            <span>m</span>
          </div>
        </div>
        <div className="run-count-field">
          <FieldLabel htmlFor={`${run.id}-copies`}>No. of runs</FieldLabel>
          <input
            id={`${run.id}-copies`}
            data-entry
            type="number"
            min="0"
            step="1"
            value={run.copies}
            placeholder="Qty"
            aria-label={`Number of runs, run ${index + 1}`}
            onChange={(event) =>
              onChange({
                copies:
                  event.target.value === ""
                    ? ""
                    : String(quantity(event.target.value)),
              })
            }
            onBlur={() => {
              if (quantity(run.copies) > 0 && !configured) onEditLuminaire();
            }}
            onKeyDown={(event) => {
              if (
                (event.key === "Enter" || event.key === "Tab") &&
                !event.shiftKey &&
                quantity(run.copies) > 0 &&
                !configured
              ) {
                event.preventDefault();
                event.stopPropagation();
                onEditLuminaire();
              }
            }}
          />
        </div>
        <div className="luminaire-field">
          <FieldLabel info="Enter the normal luminaire quantity per run. Emergency quantities are additional luminaires, not a subset of the normal quantity. Click the product to edit its details.">
            Luminaire
          </FieldLabel>
          <div className="product-quantity-row">
            <button
              type="button"
              data-entry
              className={`luminaire-trigger ${configured ? "is-configured" : ""}`}
              aria-label={`Edit luminaire details, run ${index + 1}`}
              onClick={onEditLuminaire}
            >
              {configured ? (
                <>
                  <span className="luminaire-reference">
                    {displayReference || <Lightbulb size={15} />}
                  </span>
                  <span className="luminaire-product">
                    {run.luminaire.name || "Enter product name"}
                  </span>
                  <Pencil size={14} />
                </>
              ) : (
                <>
                  <span className="add-luminaire-icon">
                    <Plus size={14} />
                  </span>
                  <span>Add luminaire details</span>
                  <Pencil size={14} />
                </>
              )}
            </button>
            {inputQuantity("luminaireQty", "Luminaire quantity", !configured)}
          </div>
          {configured &&
            (run.emergencyEnabled ? (
              <div className="product-quantity-row emergency-entry">
                <div className="luminaire-trigger is-configured is-emergency">
                  <button
                    type="button"
                    className="emergency-edit"
                    aria-label={`Edit emergency luminaire details, run ${index + 1}`}
                    onClick={onEditLuminaire}
                  >
                    <span
                      className="luminaire-reference"
                      ref={setEmergencyBadge}
                    >
                      {displayReference ? `${displayReference}/E` : "L/E"}
                    </span>
                    <span className="luminaire-product">
                      {run.luminaire.name || "Enter product name"}{" "}
                      {emergencySuffix(settings)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button remove-emergency"
                    aria-label="Remove emergency luminaire"
                    onClick={() =>
                      onChange({ emergencyEnabled: false, emergencyQty: "" })
                    }
                  >
                    <X size={13} />
                  </button>
                </div>
                {inputQuantity("emergencyQty", "Emergency luminaire quantity")}
              </div>
            ) : (
              <button
                type="button"
                className="add-emergency"
                onClick={() => onChange({ emergencyEnabled: true })}
              >
                <Plus size={12} />
                Add emergency
              </button>
            ))}
        </div>
        <div className="sensor-field">
          <div className="sensor-field-label">
            <FieldLabel info="Sensors share the DALI line. Recommendations use tangential coverage, actual available positions and wall zones. Click the wand to apply the minimum quantity.">
              Sensor
            </FieldLabel>
            <span className="sensor-tools">
              {sensorWarnings.length > 0 && (
                <Tooltip content={sensorWarnings.join(" ")}>
                  <span
                    tabIndex={0}
                    aria-label="Sensor coverage warning"
                    className="sensor-warning"
                  >
                    <TriangleAlert size={15} strokeWidth={1.6} />
                  </span>
                </Tooltip>
              )}
              {run.sensorId &&
                run.sensorId !== "manual" &&
                recommend !== null && (
                  <Tooltip
                    content={`Use the recommended minimum of ${recommend} sensor${recommend === 1 ? "" : "s"} per run. ${plan.sensor.wallsCovered ? "Positions include both wall zones." : "Positions cover the run length and as much of the wall zones as the free positions near the run ends allow."}`}
                  >
                    <button
                      type="button"
                      className="recommend-button"
                      aria-label={`Apply recommended sensor quantity: ${recommend}`}
                      onClick={() => onQuantity("sensorQty", String(recommend))}
                    >
                      <WandSparkles size={15} />
                    </button>
                  </Tooltip>
                )}
            </span>
          </div>
          <div className="product-quantity-row">
            <div
              className={`select-wrap ${!run.sensorId ? "is-placeholder" : "has-reference"}`}
            >
              {run.sensorId && (
                <ReferenceBox
                  kind="sensor"
                  value={run.sensorRef}
                  label={`Sensor reference, run ${index + 1}`}
                  onChange={(value) => onReference("sensor", value)}
                  onRestore={() => onRestoreReference("sensor")}
                />
              )}
              <select
                data-entry
                aria-label={`Sensor, run ${index + 1}`}
                value={run.sensorId}
                onChange={(event) => {
                  onChange({
                    sensorId: event.target.value,
                    ...(event.target.value ? {} : { sensorQty: "" }),
                  });
                  if (event.target.value === "manual") onEditSensor();
                }}
              >
                <option value="">Select sensor</option>
                {SENSORS.map((sensor) => (
                  <option key={sensor.id} value={sensor.id}>
                    {sensor.name}
                  </option>
                ))}
                <option value="manual">
                  {run.manualSensor.name || "Manual entry..."}
                </option>
              </select>
              <ChevronDown size={13} />
              {run.sensorId === "manual" && (
                <button
                  type="button"
                  className="manual-sensor-edit icon-button"
                  aria-label="Edit manual sensor"
                  onClick={onEditSensor}
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
            {inputQuantity("sensorQty", "Sensor quantity", !run.sensorId)}
          </div>
          {run.sensorId &&
            run.sensorId !== "manual" &&
            plan.sensor.coverageMm !== null && (
              <div className="sensor-coverage-note">
                {formatM(plan.sensor.coverageMm)} m coverage
                {recommend !== null && <span> / {recommend} recommended</span>}
              </div>
            )}
        </div>
        <div className="standalone-field">
          <FieldLabel info="Standalone emergency modules use their own geartray and do not replace luminaire positions. OA is open-area, CO is corridor, and LBLT039ML-PRO is a CBS module.">
            Standalone emergency
          </FieldLabel>
          <div className="product-quantity-row">
            <div
              className={`select-wrap ${!run.moduleId ? "is-placeholder" : "has-reference"}`}
            >
              {run.moduleId && (
                <ReferenceBox
                  kind="module"
                  value={run.moduleRef}
                  label={`Standalone emergency reference, run ${index + 1}`}
                  onChange={(value) => onReference("module", value)}
                  onRestore={() => onRestoreReference("module")}
                />
              )}
              <select
                data-entry
                value={run.moduleId}
                aria-label={`Standalone emergency, run ${index + 1}`}
                onChange={(event) =>
                  onChange({
                    moduleId: event.target.value,
                    ...(event.target.value ? {} : { moduleQty: "" }),
                  })
                }
              >
                <option value="">Select module</option>
                {EMERGENCY_MODULES.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </div>
            {inputQuantity(
              "moduleQty",
              "Standalone emergency quantity",
              !run.moduleId,
            )}
          </div>
        </div>
      </div>
      {plan.warnings.length > 0 && (
        <div
          className={`run-warnings ${plan.units && !plan.feasible ? "has-error" : ""}`}
        >
          <TriangleAlert size={13} />
          <span>
            {plan.warnings[0]}
            {plan.warnings.length > 1 && (
              <Info>{plan.warnings.slice(1).join(" ")}</Info>
            )}
          </span>
        </div>
      )}
      <div className="run-summary">
        <div>
          <span>Target length</span>
          <strong>
            {plan.units ? (
              <>
                {formatM(plan.targetMm)} <small>m</small>
              </>
            ) : (
              <span className="empty-value">-</span>
            )}
          </strong>
        </div>
        <div>
          <span>Actual length</span>
          <strong>
            {plan.units ? (
              <>
                {formatM(plan.lengthMm)} <small>m</small>
              </>
            ) : (
              <span className="empty-value">-</span>
            )}
          </strong>
        </div>
        <div>
          <span>Deviation</span>
          <strong
            className={
              plan.units && Math.abs(plan.deviationMm) > 0.001
                ? "deviation-value"
                : ""
            }
          >
            {plan.units ? (
              <>
                {plan.deviationMm > 0 ? "+" : ""}
                {formatMm(plan.deviationMm)} <small>mm</small>
              </>
            ) : (
              <span className="empty-value">-</span>
            )}
          </strong>
        </div>
        <div className="adjust-run">
          <span>
            Adjust run
            <Info>
              Move to the next buildable trunking length without changing the
              original target. Shorter is disabled if the geartrays cannot fit.
            </Info>
          </span>
          <div>
            <button
              type="button"
              disabled={plan.shorterUnits === null}
              onClick={() => onChange({ adjustedUnits: plan.shorterUnits })}
              aria-label={`Shorten run ${index + 1}`}
            >
              <ArrowLeft size={13} />
              Shorter
            </button>
            <button
              type="button"
              disabled={plan.longerUnits === null}
              onClick={() => onChange({ adjustedUnits: plan.longerUnits })}
              aria-label={`Lengthen run ${index + 1}`}
            >
              Longer
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>
      <RunLayout plan={plan} settings={settings} />
    </article>
  );
}
