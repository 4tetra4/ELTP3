import { useState } from "react";
import { Cable, ChevronDown, ChevronUp } from "lucide-react";
import {
  buildCoreView,
  TONE_LABELS,
  type TapPin,
  type TapView,
} from "../planner/cores";
import type { ElectricalPlan } from "../planner/types";
import { Info, Tooltip } from "./ui";

function Earth() {
  return (
    <svg
      width="13"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      aria-label="Protective earth"
    >
      <path d="M8 1v7M2 8h12M4 11h8M6 14h4" />
    </svg>
  );
}

function PinRow({ name, pins }: { name: string; pins: TapPin[] }) {
  return (
    <div className={`tap-row ${name === "AUX" ? "aux-row" : "main-row"}`}>
      <span className="tap-row-name">{name}</span>
      <div className="tap-pins">
        {pins.map((pin) => (
          <div className="tap-pin" key={`${name}-${pin.position}`}>
            <span
              className={`pin-dot ${pin.active ? `filled ${pin.tone}` : ""}`}
            />
            <span>{pin.earth ? <Earth /> : pin.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tap({ tap }: { tap: TapView }) {
  return (
    <div className="tap-column">
      <div className="diagram-label">
        {tap.title}
        <Info>{tap.info}</Info>
      </div>
      <div className="tap-diagram">
        {tap.aux && <PinRow name="AUX" pins={tap.aux} />}
        <PinRow name="MAIN" pins={tap.main} />
      </div>
      {tap.notes.map((note) => (
        <p className="diagram-note" key={note}>
          {note}
        </p>
      ))}
    </div>
  );
}

export function CoreDiagram({
  letter,
  electrical,
}: {
  letter: string;
  electrical: ElectricalPlan;
}) {
  const [expanded, setExpanded] = useState(false);
  const view = buildCoreView(electrical);
  const columns = view.taps.length + (view.emergencyPlaceholder ? 1 : 0);
  return (
    <div className={`core-panel ${expanded ? "is-expanded" : ""}`}>
      <button
        type="button"
        className="core-heading"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <Cable size={16} />
        <span>
          Core diagram<span className="core-heading-bom">, BOM {letter}</span>
        </span>
        <span className="core-heading-info">
          <Tooltip content="Busbar core assignments and the five-pin main electrical tap. Auxiliary two-pole connectors can only occupy pairs 2-4, 6-8 or 10-12. Emergency cores and connectors are shown in green.">
            <span className="small-info">i</span>
          </Tooltip>
        </span>
        <span className="core-heading-end">
          {view.cores} core
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>
      {expanded && (
        <div className="core-content">
          <div className="diagram-label">Busbar, {view.cores} core</div>
          <div className="busbar-scroll">
            <div className="busbar-diagram">
              {view.busbar.map((core) => (
                <div
                  className={`busbar-core ${!core.available ? "not-available" : ""}`}
                  key={core.position}
                >
                  <span className="core-position">
                    {core.available ? core.position : ""}
                  </span>
                  <span
                    className={`core-line ${core.available ? core.tone : ""}`}
                  />
                  <span className="core-label">{core.label}</span>
                  <span className="core-use">
                    {core.available ? core.use : "Not available"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className={`tap-grid ${columns > 2 ? "mixed-tap-grid" : ""}`}>
            {view.taps.map((tap) => (
              <Tap tap={tap} key={tap.key} />
            ))}
            {view.emergencyPlaceholder && (
              <div className="tap-column">
                <div className="diagram-label">Emergency tap</div>
                <div className="tap-placeholder">
                  {view.emergencyPlaceholder}
                </div>
              </div>
            )}
          </div>
          <div className="core-legend" aria-label="Core colour legend">
            {view.legend.map((tone) => (
              <span key={tone}>
                <i className={`core-line ${tone}`} />
                {TONE_LABELS[tone]}
              </span>
            ))}
            {view.cores === 7 && (
              <span>
                <i className="core-line legend-unavailable" />
                Not available on 7 core
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
