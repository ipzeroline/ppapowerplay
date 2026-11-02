// A database error that means this build's migration has not run yet (npm run db:init): a column or
// table the code reads does not exist. Returns the database's message, or null for any other error.
export function missingSchema(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const { code, sqlMessage, message } = error as { code?: unknown; sqlMessage?: unknown; message?: unknown };
  if (code !== "ER_BAD_FIELD_ERROR" && code !== "ER_NO_SUCH_TABLE") return null;
  return typeof sqlMessage === "string" ? sqlMessage : typeof message === "string" ? message : String(code);
}
