/**
 * The project name.
 *
 * It is the name of the model, and it decides what every export is called, so
 * a folder of exports says which model each one came from instead of three
 * files all called `curly.something.json`.
 *
 * It is not stored in the model file. The name of a thing is not part of the
 * thing, and putting it in the source would mean a rename is a diff. It comes
 * from the file the model was opened from, and can be edited directly.
 */

export const DEFAULT_PROJECT_NAME = "untitled";

/** `blog.curly` -> `blog`, and `notes.v2.curly` -> `notes.v2`. */
export function nameFromFileName(fileName: string): string {
  const base = fileName.split("/").at(-1) ?? fileName;
  const cut = base.lastIndexOf(".");
  // A leading dot is part of the name, not an extension.
  const stem = cut > 0 ? base.slice(0, cut) : base;
  return stem.trim() || DEFAULT_PROJECT_NAME;
}

/**
 * Make a name safe to hand to a download.
 *
 * A name is typed by a person, so it can contain slashes, quotes and spaces.
 * Slashes in particular would be read as a path by the browser, so everything
 * outside a small safe set becomes a dash.
 */
export function toFileName(name: string, suffix: string): string {
  const safe = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return `${safe || DEFAULT_PROJECT_NAME}${suffix}`;
}
