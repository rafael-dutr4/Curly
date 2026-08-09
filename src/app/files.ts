import { t } from "../i18n/locale.ts";
import { download } from "./download.ts";

/**
 * Opening and saving real `.curly` files.
 *
 * The File System Access API is the good path: it hands back a handle, so
 * saving again writes to the same file instead of dropping another copy in
 * the downloads folder. It only exists in Chromium browsers, and it is only
 * exposed in a secure context, so everything here has a fallback that works
 * anywhere: a file input for opening, a download for saving.
 *
 * The types are declared locally rather than relying on the DOM library
 * shipping them, which keeps this compiling whatever version of TypeScript is
 * in use, and makes the feature detection honest.
 */

interface WritableStreamLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

export interface FileHandleLike {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableStreamLike>;
}

interface FilePickers {
  showOpenFilePicker?(options?: unknown): Promise<FileHandleLike[]>;
  showSaveFilePicker?(options?: unknown): Promise<FileHandleLike>;
}

/**
 * A function rather than a constant: the description is shown by the operating
 * system's own file dialog, so it has to be produced in whatever language the
 * interface is speaking at the moment the picker opens.
 */
function pickerOptions(): { types: { description: string; accept: Record<string, string[]> }[] } {
  return {
    types: [{ description: t("files.pickerDescription"), accept: { "text/plain": [".curly"] } }],
  };
}

export interface OpenedFile {
  readonly name: string;
  readonly text: string;
  readonly handle: FileHandleLike | null;
}

function pickers(): FilePickers {
  return globalThis as unknown as FilePickers;
}

export function canUseFilePicker(): boolean {
  return typeof pickers().showOpenFilePicker === "function";
}

/** Returns null when the user cancels, which is not an error. */
export async function openModel(): Promise<OpenedFile | null> {
  const picker = pickers().showOpenFilePicker;

  if (picker) {
    try {
      const [handle] = await picker(pickerOptions());
      if (!handle) return null;
      const file = await handle.getFile();
      return { name: handle.name, text: await file.text(), handle };
    } catch {
      // AbortError when the dialog is dismissed. Nothing to report.
      return null;
    }
  }

  return openWithInput();
}

/**
 * Save to the open file when there is one, otherwise ask where to put it.
 * Returns the handle to keep, or null when the save became a download.
 */
export async function saveModel(
  text: string,
  handle: FileHandleLike | null,
  suggestedName = "model.curly",
): Promise<FileHandleLike | null> {
  if (handle) {
    try {
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return handle;
    } catch {
      // The handle can go stale, for instance if permission was revoked.
      // Falling through asks again rather than losing the save.
    }
  }

  const picker = pickers().showSaveFilePicker;
  if (picker) {
    try {
      const chosen = await picker({ ...pickerOptions(), suggestedName });
      const writable = await chosen.createWritable();
      await writable.write(text);
      await writable.close();
      return chosen;
    } catch {
      return null;
    }
  }

  download(suggestedName, text, "text/plain");
  return null;
}

function openWithInput(): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".curly,text/plain";
    input.style.display = "none";

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      resolve(file ? { name: file.name, text: await file.text(), handle: null } : null);
    });

    // A cancelled file input fires nothing in older browsers, so the promise
    // would hang. `cancel` covers the browsers that do report it, and the
    // element is left harmless in the ones that do not.
    input.addEventListener("cancel", () => {
      input.remove();
      resolve(null);
    });

    document.body.append(input);
    input.click();
  });
}
