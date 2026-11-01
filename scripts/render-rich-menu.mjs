// Renders public/line/rich-menu-main.svg to the PNG uploaded to LINE (2500x1686, < 1 MB).
// Uses Chrome through Playwright so Thai text is shaped with the system's Thai fonts.
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const svgPath = "public/line/rich-menu-main.svg";
const pngPath = "public/line/rich-menu-main.png";
const width = 2500;
const height = 1686;
const maxBytes = 1024 * 1024;

const svg = await readFile(svgPath, "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#05070a}svg{display:block}</style></head><body>${svg}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width, height } });
  if (png.length >= maxBytes) throw new Error(`Rendered PNG is ${png.length} bytes; LINE rich menu images must be under 1 MB.`);
  await writeFile(pngPath, png);
  console.log(`Wrote ${pngPath} (${width}x${height}, ${png.length} bytes)`);
} finally {
  await browser.close();
}
