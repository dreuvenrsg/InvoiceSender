// Minimal CSV serialization (RFC 4180 quoting).

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** rows: array of objects; columns: [{ key, header }] */
export function toCsv(rows, columns) {
  const lines = [columns.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(row[c.key])).join(","));
  }
  return lines.join("\n") + "\n";
}
