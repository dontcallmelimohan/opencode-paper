import { chromium } from "playwright"
const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on("console", (msg) => { if (msg.type() === "error") errors.push(`[console.error] ${msg.text()}`) })
page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`))
await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle", timeout: 20000 }).catch((e) => errors.push(`[goto] ${e.message}`))
await page.waitForTimeout(4000)
console.log("URL:", page.url())
console.log("BODY:", (await page.locator("body").innerText().catch(() => "?" )).slice(0, 300))
console.log("--- ERRORS ---")
console.log(errors.slice(0, 20).join("\n") || "(none)")
await browser.close()
