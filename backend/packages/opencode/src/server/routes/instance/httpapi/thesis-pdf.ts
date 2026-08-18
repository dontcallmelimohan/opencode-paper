// [论文助手定制] 论文导出 PDF：把排版好的 HTML（由前端把 Markdown 渲染成带学术样式的页面）
// 用系统 Chrome/Chromium 的 headless 打印能力转成 PDF。
// Chrome 路径：优先取环境变量 OPENCODE_CHROME_PATH，否则探测常见安装路径 / PATH 里的 google-chrome、chromium。
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { which } from "@opencode-ai/core/util/which"

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/opt/homebrew/bin/chromium",
]

const PRINT_TIMEOUT_MS = 30_000

const findChrome = (): string | null => {
  const envPath = process.env.OPENCODE_CHROME_PATH?.trim()
  if (envPath && existsSync(envPath)) return envPath
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  return which("google-chrome") ?? which("chromium") ?? which("google-chrome-stable") ?? null
}

// [论文助手定制] HTML → PDF：写临时 HTML，Chrome headless 打印到临时 PDF，读回 Buffer 后清理。
export async function htmlToPdf(html: string): Promise<Buffer> {
  const chrome = findChrome()
  if (!chrome) throw new Error("未找到 Chrome/Chromium，无法导出 PDF（可设置 OPENCODE_CHROME_PATH 环境变量指定路径）")
  const dir = await mkdtemp(path.join(tmpdir(), "thesis-pdf-"))
  const input = path.join(dir, "input.html")
  const output = path.join(dir, "output.pdf")
  try {
    await writeFile(input, html, "utf8")
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        chrome,
        ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${output}`, `file://${input}`],
        { stdio: ["ignore", "ignore", "pipe"] },
      )
      let stderr = ""
      proc.stderr?.on("data", (chunk) => (stderr += String(chunk)))
      const timer = setTimeout(() => {
        proc.kill("SIGKILL")
        reject(new Error("Chrome 打印超时"))
      }, PRINT_TIMEOUT_MS)
      proc.on("error", (error) => {
        clearTimeout(timer)
        reject(error)
      })
      proc.on("close", (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error(`Chrome 打印失败（exit ${code}）：${stderr.slice(0, 300)}`))
      })
    })
    return await readFile(output)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
