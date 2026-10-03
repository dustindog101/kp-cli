/** @param {unknown} value */
export function clean(value) {
  return String(value ?? "—")
    .replace(/[\x00-\x1f\x7f-\x9f]/g, " ")
    .trim();
}
/** @param {string[]} headers @param {unknown[][]} rows */
export function table(headers, rows) {
  const cells = rows.map((row) => row.map(clean));
  const width = Math.max(
    16,
    Math.min(
      64,
      Math.floor(
        ((process.stdout.columns || 120) - headers.length * 2) / headers.length,
      ),
    ),
  );
  const widths = headers.map((header, i) =>
    Math.min(
      width,
      Math.max(header.length, ...cells.map((row) => (row[i] || "").length)),
    ),
  );
  /** @param {string[]} row */
  const line = (row) =>
    row
      .map((cell, i) =>
        (cell.length > widths[i]
          ? cell.slice(0, widths[i] - 1) + "…"
          : cell
        ).padEnd(widths[i]),
      )
      .join("  ")
      .trimEnd();
  return [
    line(headers),
    line(widths.map((w) => "─".repeat(w))),
    ...cells.map(line),
  ].join("\n");
}
/** @param {unknown} data @param {boolean} json @param {(data: any) => string} [render] */
export function emit(
  data,
  json,
  render = (data) => JSON.stringify(data, null, 2),
) {
  process.stdout.write(
    json
      ? JSON.stringify({ schemaVersion: 1, ok: true, data }) + "\n"
      : render(data) + "\n",
  );
}
