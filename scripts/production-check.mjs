import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), false);
const readEnv = (name) => process.env[name] || "";

const required = [
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "NEXT_PUBLIC_LINE_LIFF_ID",
  "LINE_CHANNEL_ID",
  "APP_REQUIRE_LINE",
  "NEXT_PUBLIC_REQUIRE_LINE",
  "APP_BASE_URL",
  "ADMIN_ACCESS_KEY",
];

const missing = required.filter((name) => !readEnv(name));
const invalid = [];
if ((readEnv("SESSION_SECRET") || readEnv("ADMIN_ACCESS_KEY")).length < 32) invalid.push("Session signing secret must contain at least 32 characters");

if (readEnv("APP_REQUIRE_LINE") !== "true") invalid.push("APP_REQUIRE_LINE must be true");
if (readEnv("NEXT_PUBLIC_REQUIRE_LINE") !== "true") invalid.push("NEXT_PUBLIC_REQUIRE_LINE must be true");
if (!/^https:\/\//.test(readEnv("APP_BASE_URL"))) invalid.push("APP_BASE_URL must be an https:// URL for production");
// Same rule as lib/promptpay.ts: mobile (10 digits from 0), tax ID (13) or e-wallet (15). A typo would
// silently turn the PromptPay QR off, so a set-but-invalid value fails the check.
const promptPayId = readEnv("PROMPTPAY_ID").replace(/[\s-]/g, "");
if (promptPayId && !/^(0\d{9}|\d{13}|\d{15})$/.test(promptPayId)) invalid.push("PROMPTPAY_ID must be a 10-digit mobile number, 13-digit tax ID or 15-digit e-wallet ID");
if (readEnv("LINE_PUSH_ENABLED") === "true" && !readEnv("LINE_CHANNEL_ACCESS_TOKEN")) invalid.push("LINE_PUSH_ENABLED=true requires LINE_CHANNEL_ACCESS_TOKEN");

if (missing.length || invalid.length) {
  console.error("Production check failed.");
  for (const name of missing) console.error(`- Missing ${name}`);
  for (const message of invalid) console.error(`- ${message}`);
  process.exit(1);
}

if (!promptPayId) console.warn("Warning: PROMPTPAY_ID is not set. Members get staff-confirmed payment requests without a PromptPay QR.");
// Payment slips are financial records: a deploy that replaces the app folder must not delete them.
// Compare real paths so symlinked release folders (and macOS /tmp) are judged correctly.
const realPath = (target) => {
  let current = path.resolve(target);
  const missing = [];
  while (!existsSync(current) && path.dirname(current) !== current) {
    missing.unshift(path.basename(current));
    current = path.dirname(current);
  }
  return path.join(realpathSync(current), ...missing);
};
const slipDir = readEnv("SLIP_STORAGE_DIR");
const slipRelative = slipDir ? path.relative(realPath(process.cwd()), realPath(slipDir)) : "";
if (!slipDir || slipRelative === "" || (!slipRelative.startsWith("..") && !path.isAbsolute(slipRelative))) {
  console.warn("Warning: SLIP_STORAGE_DIR is not set or is inside the app folder. Point it at a persistent, backed-up volume so payment slips survive redeploys.");
}
console.log("Production check passed: LINE-only mode and required production env are configured.");
