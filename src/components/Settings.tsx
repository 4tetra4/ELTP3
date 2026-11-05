import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Cable,
  ChevronDown,
  ChevronUp,
  Layers3,
  Pencil,
  RotateCcw,
  X,
} from "lucide-react";
import type { BomGroup, ElectricalPlan, Settings } from "../planner/types";
import { FieldLabel, Info, Segment, Tooltip } from "./ui";

const descriptions = {
  cores:
    "The pre-wired trunking is available with 7 or 13 cores. DALI uses main-side cores 9 and 11 and works on 7 cores. 13 cores are required when auxiliary connector pins are needed: additional neutrals, CBS emergency (including LBLT039ML-PRO) or battery emergency with three switched lives.",
  control:
    "DALI provides dimming and a shared line for sensors and DST monitoring on main-side cores 9 and 11. ET uses switchable luminaire drivers.",
  emergency:
    "Battery uses self-contained emergency batteries. CBS uses a central battery supply and a factory-fitted auxiliary connector, so CBS emergency fittings require 13 cores.",
  testing:
    "Manual testing applies to battery emergency systems. DST is DALI Self Test and shares the DALI line with luminaires and sensors.",
  lives:
    "Number of switched live circuits required. With three switched lives, the emergency non-switched supply must use the auxiliary side.",
  neutrals:
    "Some projects require separate neutrals because of their circuit-breaker arrangement. Additional neutrals require a grey auxiliary connector on every luminaire.",
  height:
    "Optional mounting height in metres. Used to interpolate tangential sensor coverage and allow for wall zones at each end of the run.",
  suspension:
    "Cable suspension kit length. Each L150, L225 and L300 section needs one suspension; each L450 needs two. The first section needs one additional suspension.",
  endCap:
    "Every run requires two end caps. IP20 has a smooth exterior for decorative applications. IP50 has visible outer knock-outs for industrial use.",
  longTrunking:
    "L450 is 4,425 mm long and is preferred when enabled. Longer profiles are more easily damaged in transit and may be difficult to bring into buildings.",
};

export function SettingControl({
  field,
  settings,
  onChange,
}: {
  field: keyof Settings;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  switch (field) {
    case "cores":
      return (
        <Segment
          label="Trunking cores"
          value={settings.cores}
          options={[
            { value: 7, label: "7 core" },
            { value: 13, label: "13 core" },
          ]}
          onChange={(cores) => onChange({ cores })}
        />
      );
    case "control":
      return (
        <Segment
          label="Control type"
          value={settings.control}
          options={[
            { value: "DALI", label: "DALI" },
            { value: "ET", label: "ET" },
          ]}
          onChange={(control) => onChange({ control })}
        />
      );
    case "emergency":
      return (
        <Segment
          label="Emergency system"
          value={settings.emergency}
          options={[
            { value: "Battery", label: "Battery" },
            { value: "CBS", label: "CBS" },
          ]}
          onChange={(emergency) => onChange({ emergency })}
        />
      );
    case "testing":
      return (
        <Segment
          label="Emergency testing"
          value={settings.testing}
          disabled={settings.emergency === "CBS"}
          options={[
            { value: "Manual", label: "Manual" },
            { value: "DST", label: "DST" },
          ]}
          onChange={(testing) => onChange({ testing })}
        />
      );
    case "lives":
      return (
        <Segment
          label="Live cores required"
          value={settings.lives}
          options={[
            { value: 1, label: "1" },
            { value: 2, label: "2" },
            { value: 3, label: "3" },
          ]}
          onChange={(lives) => onChange({ lives })}
        />
      );
    case "neutrals":
      return (
        <Segment
          label="Neutral cores required"
          value={settings.neutrals}
          options={[
            { value: 1, label: "1" },
            { value: 2, label: "2" },
            { value: 3, label: "3" },
          ]}
          onChange={(neutrals) => onChange({ neutrals })}
        />
      );
    case "height":
      return (
        <div className="unit-input height-input">
          <input
            type="number"
            min="0.1"
            max="100"
            step="0.1"
            aria-label="Mounting height"
            value={settings.height}
            placeholder="Optional"
            onChange={(event) => onChange({ height: event.target.value })}
          />
          <span>m</span>
        </div>
      );
    case "suspension":
      return (
        <Segment
          label="Suspension kit"
          value={settings.suspension}
          options={[
            { value: 1.5, label: "1.5 m" },
            { value: 3, label: "3 m" },
            { value: 5, label: "5 m" },
          ]}
          onChange={(suspension) => onChange({ suspension })}
        />
      );
    case "endCap":
      return (
        <Segment
          label="End cap"
          value={settings.endCap}
          options={[
            { value: "IP20", label: "IP20" },
            { value: "IP50", label: "IP50" },
          ]}
          onChange={(endCap) => onChange({ endCap })}
        />
      );
    case "longTrunking":
      return (
        <button
          type="button"
          role="switch"
          aria-checked={settings.longTrunking}
          aria-label="Enable 4.5 m trunking"
          className={`toggle-control ${settings.longTrunking ? "is-on" : ""}`}
          onClick={() => onChange({ longTrunking: !settings.longTrunking })}
        >
          <span className="toggle-track">
            <span />
          </span>
          {settings.longTrunking ? "Enabled" : "Disabled"}
        </button>
      );
  }
}

export function SettingsSummary({ settings }: { settings: Settings }) {
  return (
    <div className="settings-summary-values">
      <span>
        <Layers3 size={13} />
        {settings.cores} core
      </span>
      <span>{settings.control}</span>
      <span>
        {settings.emergency}
        {settings.emergency === "Battery"
          ? ` / ${settings.testing.toLowerCase()}`
          : ""}
      </span>
      <span>
        {settings.lives} {settings.lives === 1 ? "live" : "lives"},{" "}
        {settings.neutrals} {settings.neutrals === 1 ? "neutral" : "neutrals"}
      </span>
      {settings.height && <span>{settings.height} m mounting height</span>}
      <span>{settings.suspension} m suspension</span>
      <span>{settings.endCap}</span>
    </div>
  );
}

export function ProjectSettings({
  name,
  onName,
  settings,
  onChange,
  expanded,
  onExpand,
  onCollapse,
  started,
}: {
  name: string;
  onName: (name: string) => void;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  started: boolean;
}) {
  const section = useRef<HTMLElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nameFocus, setNameFocus] = useState(true);
  useEffect(() => {
    nameInput.current?.focus();
  }, []);
  useEffect(() => {
    if (!started) return;
    const outside = (event: PointerEvent) => {
      if (!section.current?.contains(event.target as Node)) onCollapse();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [started, onCollapse]);
  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    [],
  );
  const fields: { field: keyof Settings; label: string }[] = [
    { field: "cores", label: "Trunking cores" },
    { field: "control", label: "Control type" },
    { field: "emergency", label: "Emergency system" },
    { field: "testing", label: "Emergency testing" },
    { field: "lives", label: "Live cores required" },
    { field: "neutrals", label: "Neutral cores required" },
    { field: "height", label: "Mounting height" },
    { field: "suspension", label: "Suspension kit" },
    { field: "endCap", label: "End cap" },
    { field: "longTrunking", label: "4.5 m trunking" },
  ];
  return (
    <section
      className="project-section"
      ref={section}
      aria-labelledby="project-heading"
    >
      <div className="section-heading project-heading" id="project-heading">
        <span className="section-number">01</span>
        <h2>
          <span
            className={`project-name ${!name && nameFocus ? "is-empty" : ""}`}
          >
            <span className="name-measure" aria-hidden="true">
              {name || "Project name"}
            </span>
            <input
              ref={nameInput}
              aria-label="Project name"
              placeholder="Project name"
              value={name}
              maxLength={90}
              onFocus={() => setNameFocus(true)}
              onBlur={() => {
                setNameFocus(false);
                if (!name.trim()) onName("E-Line Pro");
              }}
              onChange={(event) => onName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (!name.trim()) onName("E-Line Pro");
                  nameInput.current?.blur();
                  section.current
                    ?.querySelector<HTMLButtonElement>(".segmented button")
                    ?.focus();
                }
              }}
            />
          </span>
          <span className="project-title-divider">-</span>{" "}
          <span>Project parameters</span>
        </h2>
        {started && expanded && (
          <button
            type="button"
            className="icon-button collapse-project"
            aria-label="Collapse project parameters"
            onClick={onCollapse}
          >
            <ChevronUp size={17} />
          </button>
        )}
      </div>
      {expanded ? (
        <div className="project-panel expanded-panel">
          {fields.map(({ field, label }) => (
            <div
              className={`setting ${field === "testing" && settings.emergency === "CBS" ? "setting-inactive" : ""}`}
              key={field}
            >
              <FieldLabel info={descriptions[field]}>{label}</FieldLabel>
              <SettingControl
                field={field}
                settings={settings}
                onChange={onChange}
              />
            </div>
          ))}
        </div>
      ) : (
        <button
          type="button"
          className="project-panel condensed-panel"
          aria-expanded="false"
          onClick={onExpand}
          onMouseEnter={() => {
            hoverTimer.current = setTimeout(onExpand, 1000);
          }}
          onMouseLeave={() => {
            if (hoverTimer.current) clearTimeout(hoverTimer.current);
          }}
        >
          <SettingsSummary settings={settings} />
          <span className="edit-parameters">
            <Pencil size={12} />
            Edit parameters
            <ChevronDown size={14} />
          </span>
        </button>
      )}
    </section>
  );
}

type SettingGroup =
  | "cores"
  | "control"
  | "emergency"
  | "circuits"
  | "height"
  | "suspension"
  | "endCap";
const groupFields: Record<
  SettingGroup,
  (keyof Omit<Settings, "longTrunking">)[]
> = {
  cores: ["cores"],
  control: ["control"],
  emergency: ["emergency", "testing"],
  circuits: ["lives", "neutrals"],
  height: ["height"],
  suspension: ["suspension"],
  endCap: ["endCap"],
};
const fieldNames: Partial<Record<keyof Settings, string>> = {
  cores: "Trunking cores",
  control: "Control type",
  emergency: "Emergency system",
  testing: "Emergency testing",
  lives: "Live cores required",
  neutrals: "Neutral cores required",
  height: "Mounting height",
  suspension: "Suspension kit",
  endCap: "End cap",
};

export function GroupSettings({
  group,
  electrical,
  project,
  onChange,
  onReset,
  onPins,
}: {
  group: BomGroup;
  electrical: ElectricalPlan;
  project: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onReset: (keys: (keyof Omit<Settings, "longTrunking">)[]) => void;
  onPins: () => void;
}) {
  const [open, setOpen] = useState<SettingGroup | null>(null);
  const element = useRef<HTMLDivElement>(null);
  const settings = electrical.settings;
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!element.current?.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const labels: { key: SettingGroup; content: ReactNode }[] = [
    {
      key: "cores",
      content: (
        <>
          <Layers3 size={11} />
          {settings.cores} core
        </>
      ),
    },
    { key: "control", content: settings.control },
    {
      key: "emergency",
      content: `${settings.emergency}${settings.emergency === "Battery" ? ` ${settings.testing.toLowerCase()}` : ""}`,
    },
    {
      key: "circuits",
      content: `${settings.lives} ${settings.lives === 1 ? "live" : "lives"}, ${settings.neutrals} ${settings.neutrals === 1 ? "neutral" : "neutrals"}`,
    },
    { key: "endCap", content: settings.endCap },
    { key: "height", content: `${settings.height || "Optional"} m height` },
    { key: "suspension", content: `Suspension ${settings.suspension} m` },
  ];
  return (
    <div className="group-settings" ref={element}>
      <span className="bom-badge">BOM {group.letter}</span>
      <div className="group-setting-chips">
        {labels.map(({ key, content }) => {
          const differs = groupFields[key].some(
            (field) => settings[field] !== project[field],
          );
          return (
            <div key={key} className="setting-chip-wrap">
              <Tooltip
                content={`${differs ? "Overrides the project settings" : "Uses the project settings"}. Click to change this BOM only.`}
              >
                <button
                  type="button"
                  aria-label={`Edit BOM ${group.letter} ${key}`}
                  aria-expanded={open === key}
                  className={`setting-chip ${differs ? "is-overridden" : ""} ${open === key ? "is-open" : ""}`}
                  onClick={() => setOpen(open === key ? null : key)}
                >
                  {content}
                </button>
              </Tooltip>
              {open === key && (
                <div
                  className="settings-popover"
                  role="dialog"
                  aria-label={`BOM ${group.letter} settings`}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      (event.target as HTMLElement).tagName === "INPUT"
                    ) {
                      event.preventDefault();
                      setOpen(null);
                    }
                  }}
                >
                  <div className="popover-heading">
                    <span>BOM {group.letter} override</span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Close settings"
                      onClick={() => setOpen(null)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {groupFields[key].map((field) => (
                    <div className="popover-setting" key={field}>
                      <FieldLabel info={descriptions[field]}>
                        {fieldNames[field]}
                      </FieldLabel>
                      <SettingControl
                        field={field}
                        settings={settings}
                        onChange={onChange}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="reset-setting"
                    onClick={() => {
                      onReset(groupFields[key]);
                      setOpen(null);
                    }}
                  >
                    <RotateCcw size={12} />
                    Use project settings
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {electrical.greyPins + electrical.greenPins + electrical.factoryPins >
          0 && (
          <Tooltip content="Additional auxiliary connectors are required. Click to review the installation notice.">
            <button
              type="button"
              className="setting-chip pins-chip"
              onClick={onPins}
            >
              <Cable size={11} />
              Pins
            </button>
          </Tooltip>
        )}
      </div>
      <span className="group-settings-hint">
        <Info>
          Click a setting to override it for this BOM. Red settings differ from
          the project defaults.
        </Info>
      </span>
    </div>
  );
}
