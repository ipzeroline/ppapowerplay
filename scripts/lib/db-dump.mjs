// Plain-SQL logical dump shared by scripts/db-backup.mjs and scripts/db-restore-check.mjs, so the
// server needs no mysqldump. Each statement ends with ";" at the end of a line. Data rows are one
// line each (the escape turns newlines inside values into \n); only table definitions span lines,
// and none of their inner lines ends with ";".

export const quoteId = (name) => `\`${String(name).replaceAll("`", "``")}\``;

export function dumpHeader() {
  return [
    "-- PPA database backup (npm run db:backup). Check it with npm run db:restore-check.",
    "SET NAMES utf8mb4;",
    // TIMESTAMP values are written and read back in UTC, so they restore unchanged on any server zone.
    "SET time_zone = '+00:00';",
    "SET FOREIGN_KEY_CHECKS = 0;",
    "SET UNIQUE_CHECKS = 0;",
    "",
  ].join("\n");
}

export function dumpFooter() {
  return "SET UNIQUE_CHECKS = 1;\nSET FOREIGN_KEY_CHECKS = 1;\n";
}

// INSERT statements of at most `batch` rows; `escape` is mysql2's (strings, numbers, NULL, Buffers).
export function insertStatements(table, columns, rows, escape, batch = 500) {
  const head = `INSERT INTO ${quoteId(table)} (${columns.map(quoteId).join(", ")}) VALUES `;
  const statements = [];
  for (let start = 0; start < rows.length; start += batch) {
    const values = rows.slice(start, start + batch).map((row) => `(${row.map((value) => escape(value)).join(", ")})`);
    statements.push(`${head}${values.join(", ")};`);
  }
  return statements;
}

// Statements of a dump, in order, without comment lines.
export function splitDump(text) {
  const statements = [];
  let current = "";
  for (const line of text.split("\n")) {
    if (!current && (!line.trim() || line.startsWith("--"))) continue;
    current = current ? `${current}\n${line}` : line;
    if (line.endsWith(";")) {
      statements.push(current);
      current = "";
    }
  }
  if (current.trim()) throw new Error("The backup ends in the middle of a statement (incomplete file?)");
  return statements;
}
