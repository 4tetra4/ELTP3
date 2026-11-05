interface WritableFile {
  write: (data: Blob | string) => Promise<void>;
  close: () => Promise<void>;
}

interface SaveHandle {
  name?: string;
  createWritable: () => Promise<WritableFile>;
}

interface SavePickerOptions {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption?: boolean;
}

type PickerWindow = Window & {
  showSaveFilePicker?: (options: SavePickerOptions) => Promise<SaveHandle>;
};

export type SaveTarget =
  | { kind: "picker"; handle: SaveHandle; fileName: string }
  | { kind: "download"; fileName: string };

export interface FileKind {
  extension: string;
  mime: string;
  description: string;
}

export const PDF_FILE: FileKind = {
  extension: "pdf",
  mime: "application/pdf",
  description: "PDF document",
};

export const PROJECT_FILE: FileKind = {
  extension: "elpt",
  mime: "application/json",
  description: "E-Line planner project",
};

export function fileDate(date: Date): string {
  return `${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, "0")}_${String(date.getDate()).padStart(2, "0")}`;
}

export function exportFileName(
  projectName: string,
  extension: string,
  date: Date,
): string {
  const cleaned = projectName
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 120)
    .trim();
  return `${cleaned || "E-Line Pro"} - E-Line planner - ${fileDate(date)}.${extension}`;
}

export function canPickSaveLocation(): boolean {
  return typeof (window as PickerWindow).showSaveFilePicker === "function";
}

export async function chooseSaveTarget(
  fileName: string,
  kind: FileKind,
): Promise<SaveTarget | null> {
  const pickerWindow = window as PickerWindow;
  if (typeof pickerWindow.showSaveFilePicker === "function") {
    try {
      const handle = await pickerWindow.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: kind.description,
            accept: { [kind.mime]: [`.${kind.extension}`] },
          },
        ],
      });
      return { kind: "picker", handle, fileName: handle.name || fileName };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        return null;
    }
  }
  return { kind: "download", fileName };
}

export async function writeSaveTarget(
  target: SaveTarget,
  blob: Blob,
): Promise<void> {
  if (target.kind === "picker") {
    const writable = await target.handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = target.fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function openTextFile(accept: string): Promise<{
  name: string;
  text: string;
} | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    let settled = false;
    const finish = () => {
      settled = true;
      input.remove();
    };
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      finish();
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then(
        (text) => resolve({ name: file.name, text }),
        (error) => reject(error),
      );
    });
    input.addEventListener("cancel", () => {
      if (!settled) {
        finish();
        resolve(null);
      }
    });
    document.body.appendChild(input);
    input.click();
  });
}
