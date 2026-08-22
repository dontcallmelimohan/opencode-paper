const { chromium } = require("@playwright/test")
;(async () => {
  const browser = await chromium.launch({ channel: "chrome" })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on("pageerror", (err) => console.log("[pageerror]", err.message))
  page.on("console", (msg) => { if (msg.type() === "error") console.log("[console]", msg.text()) })
  await page.goto("http://127.0.0.1:4173/L1VzZXJzL2xpbW9oYW4vdGhlc2lzLXdvcmtzcGFjZS_ljpXmiYAtYWU3cWw3/workbench", { waitUntil: "domcontentloaded", timeout: 20000 })
  await page.waitForTimeout(6000)
  const describe = async (label, loc) => {
    const el = loc.first()
    const vis = await el.isVisible().catch(() => false)
    const box = vis ? await el.boundingBox().catch(() => null) : null
    console.log(`${label}: visible=${vis} box=${box ? JSON.stringify({ x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) }) : "null"}`)
  }
  await describe("config-form(描述综述需求)", page.locator("text=描述综述需求"))
  await describe("rail-expand-btn(chevron-double-right)", page.locator('button[aria-label="展开配置面板"]'))
  await describe("doc-title(分章节综述大纲)", page.locator("text=分章节综述大纲"))
  await describe("doc-empty-hint", page.locator("text=填写左侧需求后点击"))
  await describe("toggle-文稿", page.locator("text=文稿"))
  await describe("toggle-会话", page.locator("text=会话"))
  const selects = await page.locator("select").count()
  console.log("select count:", selects)
  for (let i = 0; i < selects; i++) {
    const opts = await page.locator("select").nth(i).locator("option").allInnerTexts().catch(() => [])
    console.log(`select[${i}] options:`, JSON.stringify(opts))
  }
  // 检查 milkdown 编辑器是否渲染
  console.log("milkdown-editor:", await page.locator(".milkdown-editor").count())
  console.log("thesis-drawer:", await page.locator(".thesis-drawer").count())
  await browser.close()
})().catch((e) => { console.error(e.message); process.exit(1) })
