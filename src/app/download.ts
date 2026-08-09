/**
 * Handing a file to the user without a server.
 *
 * A Blob plus an object URL plus a click on a hidden link is the whole
 * mechanism. The URL is revoked afterwards, because it pins the blob in memory
 * for the life of the document otherwise, and a model exported twenty times
 * while working would keep every copy.
 */
export function download(filename: string, contents: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([contents], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, value: unknown): void {
  download(filename, `${JSON.stringify(value, null, 2)}\n`);
}

/** The same mechanism for something already binary, such as a rendered PNG. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
