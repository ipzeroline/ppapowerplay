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

if (missing.length || invalid.length) {
  console.error("Production check failed.");
  for (const name of missing) console.error(`- Missing ${name}`);
  for (const message of invalid) console.error(`- ${message}`);
  process.exit(1);
}

console.log("Production check passed: LINE-only mode and required production env are configured.");
