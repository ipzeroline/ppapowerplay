import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const fileEnv = {};

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    fileEnv[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
}

function env(name) {
  return process.env[name] ?? fileEnv[name] ?? "";
}

function requireEnv(name) {
  const value = env(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function lineFetch(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireEnv("LINE_CHANNEL_ACCESS_TOKEN")}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${init.method || "GET"} ${url} failed: ${res.status} ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

function buildRichMenu() {
  const liffId = requireEnv("NEXT_PUBLIC_LINE_LIFF_ID");
  const baseUrl = env("LINE_RICH_MENU_BASE_URL") || `https://liff.line.me/${liffId}`;
  const configPath = path.join(root, "config/line-rich-menu-main.json");
  const richMenu = JSON.parse(fs.readFileSync(configPath, "utf8"));

  for (const area of richMenu.areas) {
    area.action.uri = area.action.uri.replace("__PPA_LIFF_URL__", baseUrl);
  }

  return richMenu;
}

async function main() {
  const richMenu = buildRichMenu();
  const imagePath = path.join(root, "public/line/rich-menu-main.png");
  if (!fs.existsSync(imagePath)) {
    throw new Error("Missing public/line/rich-menu-main.png. Run `npm run line:rich-menu:image` first.");
  }

  if (env("LINE_RICH_MENU_DRY_RUN") === "true") {
    console.log(JSON.stringify(richMenu, null, 2));
    console.log(`Image: ${imagePath}`);
    return;
  }

  await lineFetch("https://api.line.me/v2/bot/richmenu/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(richMenu),
  });

  const { richMenuId } = await lineFetch("https://api.line.me/v2/bot/richmenu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(richMenu),
  });

  await lineFetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: fs.readFileSync(imagePath),
  });

  if (env("LINE_RICH_MENU_SET_DEFAULT") !== "false") {
    await lineFetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, { method: "POST" });
  }

  console.log(`Created rich menu: ${richMenuId}`);
  console.log(`Default: ${env("LINE_RICH_MENU_SET_DEFAULT") === "false" ? "no" : "yes"}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
