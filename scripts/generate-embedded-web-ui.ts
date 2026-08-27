import { readdirSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const repo = resolve(import.meta.dir, "..")
const appDist = join(repo, "thesis-web/packages/app/dist")
const backendDir = join(repo, "backend/packages/opencode")
const outFile = join(backendDir, "opencode-web-ui.gen.ts")
const files: string[] = []

function walk(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
      continue
    }
    if (entry.name.endsWith(".map")) continue
    files.push(relative(appDist, full).replaceAll("\\", "/"))
  }
}

walk(appDist)
files.sort()

const lines = [
  "// Generated from thesis-web/packages/app/dist",
  ...files.map((file, index) => {
    const spec = relative(backendDir, join(appDist, file)).replaceAll("\\", "/")
    return `import file_${index} from ${JSON.stringify(spec.startsWith(".") ? spec : `./${spec}`)} with { type: "file" };`
  }),
  "",
  "export default {",
  ...files.map((file, index) => `  ${JSON.stringify(file)}: file_${index},`),
  "}",
]

writeFileSync(outFile, lines.join("\n"))
console.log(`wrote ${outFile} with ${files.length} files`)
