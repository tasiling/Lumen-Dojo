import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
const allowFailure = process.argv.includes("--allow-failure");
const menuName = "Lumen Dojo Rich Menu v1";
const apiBase = "https://api.line.me";
const dataBase = "https://api-data.line.me";

const menu = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: menuName,
  chatBarText: "行光野採",
  areas: [
    { bounds: { x: 45, y: 45, width: 780, height: 650 }, action: { type: "message", label: "野採圖片", text: "野採圖片" } },
    { bounds: { x: 855, y: 45, width: 790, height: 650 }, action: { type: "message", label: "剪藏網址", text: "剪藏網址" } },
    { bounds: { x: 1675, y: 45, width: 780, height: 650 }, action: { type: "message", label: "最近一筆", text: "最近一筆" } },
    { bounds: { x: 45, y: 720, width: 780, height: 635 }, action: { type: "message", label: "待整理", text: "待整理" } },
    { bounds: { x: 855, y: 720, width: 790, height: 635 }, action: { type: "message", label: "豆倉", text: "豆倉" } },
    { bounds: { x: 1675, y: 720, width: 780, height: 635 }, action: { type: "message", label: "使用說明", text: "幫助" } },
  ],
};

async function lineRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LINE Rich Menu API ${response.status}${detail ? `：${detail.slice(0, 300)}` : ""}`);
  }
  return response;
}

async function ensureRichMenu() {
  if (!token) throw new Error("缺少 LINE_CHANNEL_ACCESS_TOKEN");
  const list = await lineRequest(`${apiBase}/v2/bot/richmenu/list`).then((response) => response.json());
  let richMenuId = list.richmenus?.find((item) => item.name === menuName)?.richMenuId;
  let created = false;
  if (!richMenuId) {
    const result = await lineRequest(`${apiBase}/v2/bot/richmenu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(menu),
    }).then((response) => response.json());
    richMenuId = result.richMenuId;
    created = true;
  }
  if (!richMenuId) throw new Error("LINE 沒有回傳 richMenuId");

  const contentResponse = await fetch(`${dataBase}/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!contentResponse.ok) {
    const image = await readFile(fileURLToPath(new URL("../public/line-rich-menu.jpg", import.meta.url)));
    await lineRequest(`${dataBase}/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: image,
    });
  }
  await lineRequest(`${apiBase}/v2/bot/user/all/richmenu/${encodeURIComponent(richMenuId)}`, { method: "POST" });
  console.log(`[LINE] Rich Menu ${created ? "created" : "ready"}: ${richMenuId}`);
}

ensureRichMenu().catch((error) => {
  console.error(`[LINE] Rich Menu setup skipped: ${error instanceof Error ? error.message : String(error)}`);
  if (!allowFailure) process.exitCode = 1;
});
