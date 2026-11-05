import { Check, Copy, ListTree, TriangleAlert } from "lucide-react";
import { useState } from "react";
import {
  formatQty,
  type BomGroup,
  type BomRow,
  type GroupPlan,
} from "../planner/types";
import { Info } from "./ui";

type Column = "reference" | "tk" | "toc" | "name" | "quantity" | "notes";
const columns: { key: Column; title: string; copy: boolean }[] = [
  { key: "reference", title: "Reference", copy: true },
  { key: "tk", title: "TK number", copy: false },
  { key: "toc", title: "TOC number", copy: true },
  { key: "name", title: "Product name", copy: true },
  { key: "quantity", title: "Quantity", copy: true },
  { key: "notes", title: "Notes / remarks", copy: false },
];

export function BillOfMaterials({
  group,
  plan,
  notes,
  onNote,
  onCopy,
}: {
  group: BomGroup;
  plan: GroupPlan;
  notes: Record<string, string>;
  onNote: (id: string, text: string) => void;
  onCopy: (text: string, label: string) => Promise<boolean>;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const settings = plan.electrical.settings;
  const getValue = (row: BomRow, key: Column) =>
    key === "notes" ? (notes[row.id] ?? row.notes) : String(row[key]);
  const copy = async (text: string, label: string, id: string) => {
    if (await onCopy(text, label)) {
      setCopied(id);
      setTimeout(
        () => setCopied((current) => (current === id ? null : current)),
        1600,
      );
    }
  };
  return (
    <div className="bom-group">
      <div className="bom-group-heading">
        <span className="bom-badge">BOM {group.letter}</span>
        <h3>System components</h3>
        <span className="bom-specification">
          {settings.cores} core / {settings.control} / {settings.endCap}
        </span>
        <span className="copy-instruction">
          <Copy size={12} />
          Click a cell or column to copy
        </span>
      </div>
      {plan.pendingRuns > 0 && (
        <div className="bom-pending">
          <TriangleAlert size={13} />
          {plan.pendingRuns} incomplete or infeasible{" "}
          {plan.pendingRuns === 1 ? "run is" : "runs are"} excluded from this
          BOM.
        </div>
      )}
      <div className="bom-table-scroll">
        <table className="bom-table">
          <colgroup>
            <col className="reference-col" />
            <col className="tk-col" />
            <col className="toc-col" />
            <col className="product-col" />
            <col className="quantity-col" />
            <col className="notes-col" />
          </colgroup>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>
                  <button
                    type="button"
                    disabled={!plan.rows.length}
                    aria-label={`Copy ${column.title} column, BOM ${group.letter}`}
                    onClick={() =>
                      copy(
                        plan.rows
                          .map((row) =>
                            getValue(row, column.key).replace(/\r?\n/g, " "),
                          )
                          .join("\n"),
                        `${column.title} column`,
                        column.key,
                      )
                    }
                  >
                    {column.title}
                    {column.copy &&
                      (copied === column.key ? (
                        <Check size={12} className="copied-icon" />
                      ) : (
                        <Copy size={12} />
                      ))}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`cell-${column.key} ${copied === `${row.id}-${column.key}` ? "just-copied" : ""}`}
                  >
                    {column.key === "notes" ? (
                      <textarea
                        aria-label={`Notes for ${row.reference}, ${row.name}`}
                        value={notes[row.id] ?? row.notes}
                        rows={Math.min(
                          4,
                          Math.max(
                            1,
                            Math.ceil((notes[row.id] ?? row.notes).length / 58),
                          ),
                        )}
                        onClick={() => {
                          void copy(
                            notes[row.id] ?? row.notes,
                            "Notes",
                            `${row.id}-notes`,
                          );
                        }}
                        onChange={(event) => onNote(row.id, event.target.value)}
                      />
                    ) : (
                      <button
                        type="button"
                        className="cell-copy"
                        aria-label={`Copy ${column.title}: ${getValue(row, column.key) || "empty"}`}
                        onClick={() =>
                          copy(
                            getValue(row, column.key),
                            column.title,
                            `${row.id}-${column.key}`,
                          )
                        }
                      >
                        {column.key === "quantity"
                          ? formatQty(row.quantity)
                          : row[column.key] || (
                              <span className="empty-cell">-</span>
                            )}
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {!plan.rows.length && (
              <tr className="bom-empty-row">
                <td colSpan={6}>
                  <div className="bom-empty">
                    <ListTree size={26} strokeWidth={1.2} />
                    <div>
                      <strong>Your bill of materials starts here</strong>
                      <p>
                        Enter a run length and number of runs. Components will
                        calculate automatically.
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {plan.rows.length > 0 && (
        <div className="bom-table-footer">
          <span>{plan.rows.length} component types</span>
          <span>
            Quantities include all runs in BOM {group.letter}
            <Info>
              All lengths are kept at full decimal precision internally.
              Displayed millimetres are rounded to whole numbers and metres to a
              maximum of two decimals. Clipboard values use the same display
              precision.
            </Info>
          </span>
        </div>
      )}
    </div>
  );
}
