import { Agent } from "@/agent/agent"
import { Command } from "@/command"
import { Config } from "@/config/config"
import * as InstanceState from "@/effect/instance-state"
import { Format } from "@/format"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { which } from "@opencode-ai/core/util/which"
import { Git } from "@/git"
import { LSP } from "@/lsp/lsp"
import { Project } from "@/project/project"
import { Vcs } from "@/project/vcs"
import { Skill } from "@/skill"
import { Effect, Option, Schema } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import {
  ApiSkillInstallError,
  ApiThesisError,
  ApiVcsApplyError,
  ThesisDeleteBody,
  ThesisExportDocxBody,
  ThesisSaveManuscriptBody,
} from "../groups/instance"
import { markdownToDocx } from "../thesis-docx"
import { htmlToPdf } from "../thesis-pdf"
import type { ThesisDocxOptions } from "../thesis-docx"
import { markInstanceForDisposal } from "../lifecycle"
import { ProjectV2 } from "@opencode-ai/core/project"
import path from "path"

export const instanceHandlers = HttpApiBuilder.group(InstanceHttpApi, "instance", (handlers) =>
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const command = yield* Command.Service
    const config = yield* Config.Service
    const format = yield* Format.Service
    const fs = yield* FSUtil.Service
    const lsp = yield* LSP.Service
    const project = yield* Project.Service
    const projectV2 = yield* ProjectV2.Service
    const skill = yield* Skill.Service
    const vcs = yield* Vcs.Service

    const dispose = Effect.fn("InstanceHttpApi.dispose")(function* () {
      yield* markInstanceForDisposal(yield* InstanceState.context)
      return true
    })

    const getPath = Effect.fn("InstanceHttpApi.path")(function* () {
      const ctx = yield* InstanceState.context
      return {
        home: Global.Path.home,
        state: Global.Path.state,
        config: Global.Path.config,
        worktree: ctx.worktree,
        directory: ctx.directory,
      }
    })

    const getVcs = Effect.fn("InstanceHttpApi.vcs")(function* () {
      const [branch, default_branch] = yield* Effect.all([vcs.branch(), vcs.defaultBranch()], {
        concurrency: "unbounded",
      })
      return { branch, default_branch }
    })

    const getVcsStatus = Effect.fn("InstanceHttpApi.vcsStatus")(function* () {
      return yield* vcs.status()
    })

    const getVcsDiff = Effect.fn("InstanceHttpApi.vcsDiff")(function* (ctx: {
      query: { mode: Vcs.Mode; context?: number }
    }) {
      return yield* vcs.diff(ctx.query.mode, { context: ctx.query.context })
    })

    const getVcsDiffRaw = Effect.fn("InstanceHttpApi.vcsDiffRaw")(function* () {
      return yield* vcs.diffRaw()
    })

    const applyVcs = Effect.fn("InstanceHttpApi.vcsApply")(function* (ctx: { payload: Vcs.ApplyInput }) {
      return yield* vcs.apply(ctx.payload).pipe(
        Effect.mapError(
          (error) =>
            new ApiVcsApplyError({
              name: "VcsApplyError",
              data: {
                message: error.message,
                reason: error.reason,
              },
            }),
        ),
      )
    })

    const getCommand = Effect.fn("InstanceHttpApi.command")(function* () {
      return yield* command.list()
    })

    const getAgent = Effect.fn("InstanceHttpApi.agent")(function* () {
      return yield* agent.list()
    })

    const getSkill = Effect.fn("InstanceHttpApi.skill")(function* () {
      return yield* skill.all()
    })

    const skillInstallError = (message: string) =>
      new ApiSkillInstallError({ name: "SkillInstallError", data: { message } })

    const finalizeSkillInstall = Effect.fn("InstanceHttpApi.skillInstallFinalize")(function* (name: string) {
      yield* config.invalidateAll()
      yield* agent.reloadAll()
      yield* skill.reloadAll()
      const installed = (yield* agent.list()).find((item) => item.name === name)
      const installedSkill = (yield* skill.all()).find((item) => item.name === name)
      if (!installed || !installedSkill) {
        return yield* Effect.fail(
          skillInstallError(`Installed "${name}" but it is not visible yet; restart the server to pick it up.`),
        )
      }
      return { agent: installed, skill: installedSkill }
    })

    const installSkill = Effect.fn("InstanceHttpApi.skillInstall")(function* (ctx: {
      payload: { name: string; description?: string; content: string; prompt?: string }
    }) {
      const { name, description, content, prompt } = ctx.payload
      const trimmed = name.trim()
      if (!/^[\p{L}\p{N}_-]+$/u.test(trimmed) || trimmed.startsWith(".")) {
        return yield* Effect.fail(skillInstallError(`Invalid skill name: "${name}". Use letters, numbers, _ or -`))
      }

      // Install globally so the skill and its agent are available in every project.
      const skillPath = path.join(Global.Path.config, "skills", trimmed, "SKILL.md")
      const agentPath = path.join(Global.Path.config, "agent", `${trimmed}.md`)
      const frontmatter = `---\nname: ${trimmed}\ndescription: ${description ?? ""}\n---\n\n`

      const writeError = (error: unknown) =>
        new ApiSkillInstallError({
          name: "SkillInstallError",
          data: { message: `Failed to write skill files: ${error instanceof Error ? error.message : String(error)}` },
        })
      yield* fs
        .writeWithDirs(skillPath, frontmatter + content + "\n")
        .pipe(Effect.mapError(writeError))
      yield* fs
        .writeWithDirs(
          agentPath,
          `---\nmode: primary\ndescription: ${description ?? ""}\n---\n\n${
            prompt ?? `You are the ${trimmed} agent. Always follow the instructions in the ${trimmed} skill to complete the user's request.`
          }\n`,
        )
        .pipe(Effect.mapError(writeError))

      return yield* finalizeSkillInstall(trimmed)
    })

    const installSkillDirectory = Effect.fn("InstanceHttpApi.skillInstallDirectory")(function* (ctx: {
      payload: { directory: string }
    }) {
      const source = path.resolve(ctx.payload.directory.trim())
      if (!source) return yield* Effect.fail(skillInstallError("请选择 skill 文件夹"))
      const stat = yield* fs.stat(source).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (!stat || stat.type !== "Directory") {
        return yield* Effect.fail(skillInstallError(`所选路径不是有效的文件夹: ${source}`))
      }
      const skillText = yield* fs
        .readFileStringSafe(path.join(source, "SKILL.md"))
        .pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (skillText === undefined) {
        return yield* Effect.fail(skillInstallError(`该文件夹中没有 SKILL.md，不是有效的 skill: ${source}`))
      }

      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillText)?.[1] ?? ""
      const readFrontmatter = (key: string) => {
        const match = new RegExp(`^${key}:\\s*(.*)$`, "m").exec(frontmatter)
        if (!match) return undefined
        const inline = match[1].trim()
        if (inline && !/^[>|]?-?$/.test(inline)) return inline
        const lines: string[] = []
        for (const line of frontmatter.slice(match.index + match[0].length).split("\n")) {
          const trimmedLine = line.trim()
          if (!trimmedLine) continue
          if (/^[A-Za-z0-9_-]+:/.test(trimmedLine)) break
          lines.push(trimmedLine)
        }
        return lines.join(" ") || undefined
      }
      const manifestText = yield* fs
        .readFileStringSafe(path.join(source, "manifest.yaml"))
        .pipe(Effect.catch(() => Effect.succeed(undefined)))
      const readManifest = (key: string) => {
        if (manifestText === undefined) return undefined
        const match = new RegExp(`^${key}:\\s*(.*)$`, "m").exec(manifestText)
        if (!match) return undefined
        const inline = match[1].trim()
        if (inline && !/^[>|]?-?$/.test(inline)) return inline
        const lines: string[] = []
        for (const line of manifestText.slice(match.index + match[0].length).split("\n")) {
          const trimmedLine = line.trim()
          if (!trimmedLine) continue
          if (/^[A-Za-z0-9_-]+:/.test(trimmedLine)) break
          lines.push(trimmedLine)
        }
        return lines.join(" ") || undefined
      }

      const name = (readFrontmatter("name") ?? readManifest("name") ?? path.basename(source)).trim()
      if (!/^[\p{L}\p{N}_-]+$/u.test(name) || name.startsWith(".")) {
        return yield* Effect.fail(
          skillInstallError(`无法从文件夹识别有效的 skill 名称（仅支持字母、数字、下划线和短横线）: ${path.basename(source)}`),
        )
      }
      const description = readFrontmatter("description") ?? readManifest("description")

      const writeError = (error: unknown) =>
        skillInstallError(
          `Failed to install skill from folder: ${error instanceof Error ? error.message : String(error)}`,
        )
      const target = path.join(Global.Path.config, "skills", name)
      yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(Effect.catch(() => Effect.void))
      yield* fs.remove(target, { recursive: true }).pipe(Effect.catch(() => Effect.void))
      yield* fs.copy(source, target, { overwrite: true }).pipe(Effect.mapError(writeError))
      yield* fs
        .writeWithDirs(
          path.join(Global.Path.config, "agent", `${name}.md`),
          `---\nmode: primary\ndescription: ${description ?? ""}\n---\n\nYou are the ${name} agent. Always follow the instructions in the ${name} skill to complete the user's request.\n`,
        )
        .pipe(Effect.mapError(writeError))
      return yield* finalizeSkillInstall(name)
    })

    // [论文助手定制] Skill 管理：卸载。删除全局 skills/<name> 目录与 agent/<name>.md，
    // 然后重载 agent/skill 列表，使会话侧与 Skill 管理页立即不再出现该 skill。
    const uninstallSkill = Effect.fn("InstanceHttpApi.skillUninstall")(function* (ctx: {
      payload: { name: string }
    }) {
      const name = ctx.payload.name.trim()
      if (!/^[\p{L}\p{N}_-]+$/u.test(name) || name.startsWith(".")) {
        return yield* Effect.fail(skillInstallError(`Invalid skill name: "${name}". Use letters, numbers, _ or -`))
      }
      const skillPath = path.join(Global.Path.config, "skills", name)
      const agentPath = path.join(Global.Path.config, "agent", `${name}.md`)
      yield* fs.remove(skillPath, { recursive: true }).pipe(Effect.catch(() => Effect.void))
      yield* fs.remove(agentPath).pipe(Effect.catch(() => Effect.void))
      yield* config.invalidateAll()
      yield* agent.reloadAll()
      yield* skill.reloadAll()
      return { name }
    })

    // [论文助手定制] Skill 管理：zip 安装。前端把 zip 解压成 { path, content } 文件树上传，
    // 后端校验路径安全后写入全局 skills/<name>（含 SKILL.md / references / static 等），
    // 并创建同名 agent，行为与「选择本地 Skill 文件夹」一致，只是数据来源是 zip。
    const installSkillZip = Effect.fn("InstanceHttpApi.skillInstallZip")(function* (ctx: {
      payload: { name: string; description?: string; files: readonly { readonly path: string; readonly content: string }[] }
    }) {
      const { name, description, files } = ctx.payload
      const trimmed = name.trim()
      if (!/^[\p{L}\p{N}_-]+$/u.test(trimmed) || trimmed.startsWith(".")) {
        return yield* Effect.fail(skillInstallError(`Invalid skill name: "${name}". Use letters, numbers, _ or -`))
      }
      // 防路径穿越：只允许相对路径，禁止 .. 与绝对路径。
      for (const file of files) {
        const rel = file.path.replace(/\\/g, "/")
        if (rel.startsWith("/") || rel.split("/").some((segment) => segment === "..")) {
          return yield* Effect.fail(skillInstallError(`Invalid file path in zip: "${file.path}"`))
        }
      }
      const writeError = (error: unknown) =>
        new ApiSkillInstallError({
          name: "SkillInstallError",
          data: { message: `Failed to write skill files: ${error instanceof Error ? error.message : String(error)}` },
        })
      const target = path.join(Global.Path.config, "skills", trimmed)
      yield* fs.remove(target, { recursive: true }).pipe(Effect.catch(() => Effect.void))
      for (const file of files) {
        const filePath = path.join(target, file.path)
        yield* fs.writeWithDirs(filePath, file.content).pipe(Effect.mapError(writeError))
      }
      yield* fs
        .writeWithDirs(
          path.join(Global.Path.config, "agent", `${trimmed}.md`),
          `---\nmode: primary\ndescription: ${description ?? ""}\n---\n\nYou are the ${trimmed} agent. Always follow the instructions in the ${trimmed} skill to complete the user's request.\n`,
        )
        .pipe(Effect.mapError(writeError))
      return yield* finalizeSkillInstall(trimmed)
    })

    const thesisError = (message: string) =>
      new ApiThesisError({ name: "ThesisError", data: { message } })

    // [论文助手定制] 论文工作区根目录：优先用设置里的 thesisWorkspace，否则默认 ~/thesis-workspace。
    const thesisRoot = Effect.fn("InstanceHttpApi.thesisRoot")(function* () {
      const cfg = yield* config.get()
      const configured = cfg.thesisWorkspace?.trim()
      return configured
        ? configured.replace(/^~(?=\/|$)/, Global.Path.home)
        : path.join(Global.Path.home, "thesis-workspace")
    })

    // [论文助手定制] 扫描目录下所有文件（含子目录，跳过 .git），返回最新 mtime（毫秒）；目录不存在/无文件返回 0。
    // 用来表示「论文内容最后编辑时间」——只有真实修改了正文/资料里的文件，这个时间才会变。
    const thesisContentUpdatedAt = Effect.fn("InstanceHttpApi.thesisContentUpdatedAt")(function* (directory: string) {
      let latest = 0
      const scan = (current: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          const entries = yield* fs
            .readDirectoryEntries(current)
            .pipe(Effect.catch(() => Effect.succeed([] as FSUtil.DirEntry[])))
          for (const entry of entries) {
            if (entry.name === ".git") continue
            const child = path.join(current, entry.name)
            if (entry.type === "directory") {
              yield* scan(child)
            } else if (entry.type === "file") {
              const info = yield* fs.stat(child).pipe(Effect.catch(() => Effect.succeed(undefined)))
              if (info) latest = Math.max(latest, Option.getOrElse(() => new Date(0))(info.mtime).getTime())
            }
          }
        })
      yield* scan(directory)
      return latest
    })

    // [论文助手定制] 论文项目列表：复用 project.list() 过滤出论文工作区下的项目，
    // 为每项计算 contentUpdatedAt（正文/资料目录文件的最新 mtime）。
    const listThesis = Effect.fn("InstanceHttpApi.thesisList")(function* () {
      const root = yield* thesisRoot()
      const projects = yield* project.list()
      const theses = projects.filter((item) => item.worktree.startsWith(`${root}/`))
      return yield* Effect.forEach(
        theses,
        (item) =>
          Effect.gen(function* () {
            const manuscripts = yield* thesisContentUpdatedAt(path.join(item.worktree, "正文"))
            const materials = yield* thesisContentUpdatedAt(path.join(item.worktree, "资料"))
            return { ...item, contentUpdatedAt: Math.max(manuscripts, materials) }
          }),
        { concurrency: "unbounded" },
      )
    })

    // [论文助手定制] 删除论文项目：先删数据库记录（会话/目录映射级联清理），再删工作区磁盘目录。
    // 只允许删除论文工作区内的项目，防止误删其他目录。
    const deleteThesis = Effect.fn("InstanceHttpApi.thesisDelete")(function* (ctx: {
      payload: Schema.Schema.Type<typeof ThesisDeleteBody>
    }) {
      const projectID = ProjectV2.ID.make(ctx.payload.projectID)
      const proj = yield* project.get(projectID)
      if (!proj) return yield* Effect.fail(thesisError("论文项目不存在"))
      const root = yield* thesisRoot()
      if (!proj.worktree.startsWith(`${root}/`)) {
        return yield* Effect.fail(thesisError("只能删除论文工作区内的项目"))
      }
      yield* project.remove(projectID).pipe(Effect.mapError(() => thesisError("删除项目记录失败")))
      yield* fs.remove(proj.worktree, { recursive: true }).pipe(
        Effect.mapError(() => thesisError("删除项目目录失败")),
      )
      return { projectID: ctx.payload.projectID }
    })

    const createThesis = Effect.fn("InstanceHttpApi.thesisCreate")(function* (ctx: {
      payload: { title: string; description?: string }
    }) {
      const title = ctx.payload.title.trim()
      if (!title) return yield* Effect.fail(thesisError("论文标题不能为空"))
      const slug = title.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "thesis"
      const id = Math.random().toString(36).slice(2, 8)
      const cfg = yield* config.get()
      const configured = cfg.thesisWorkspace?.trim()
      const root = configured
        ? configured.replace(/^~(?=\/|$)/, Global.Path.home)
        : path.join(Global.Path.home, "thesis-workspace")
      const dir = path.join(root, `${slug}-${id}`)
      yield* fs.ensureDir(path.join(dir, "资料")).pipe(
        Effect.mapError((error) => thesisError(`创建论文目录失败: ${String(error)}`)),
      )
      yield* fs.ensureDir(path.join(dir, "正文")).pipe(
        Effect.mapError((error) => thesisError(`创建论文目录失败: ${String(error)}`)),
      )
      if (!(yield* Effect.sync(() => which("git")))) {
        return yield* Effect.fail(thesisError("需要安装 git 才能创建论文工作空间"))
      }
      const gitService = yield* Git.Service
      const init = yield* gitService.run(["init", "--quiet"], { cwd: dir })
      if (init.exitCode !== 0) {
        return yield* Effect.fail(thesisError(`初始化论文工作空间失败: ${init.stderr.toString("utf8").trim()}`))
      }

      const projectID = ProjectV2.ID.make(`thesis-${id}`)
      const resolved = yield* projectV2.resolve(AbsolutePath.make(dir))
      if (!resolved.vcs) return yield* Effect.fail(thesisError("初始化论文工作空间失败"))
      yield* projectV2
        .commit({ store: resolved.vcs.store, id: projectID })
        .pipe(Effect.mapError(() => thesisError("注册论文项目失败")))
      const { project: created } = yield* project
        .fromDirectory(dir)
        .pipe(Effect.mapError(() => thesisError("注册论文项目失败")))
      const updated = yield* project
        .update({ projectID: created.id, name: title })
        .pipe(Effect.mapError(() => thesisError("注册论文项目失败")))
      return updated
    })

    const uploadThesisFile = Effect.fn("InstanceHttpApi.thesisUpload")(function* (ctx: {
      payload: { projectID: string; filename: string; content: string }
    }) {
      const proj = yield* project.get(ProjectV2.ID.make(ctx.payload.projectID))
      if (!proj) return yield* Effect.fail(thesisError("论文项目不存在"))
      const name = path.basename(ctx.payload.filename).trim()
      if (!name) return yield* Effect.fail(thesisError("文件名无效"))
      const bytes = Buffer.from(ctx.payload.content, "base64")
      const target = path.join(proj.worktree, "资料", name)
      yield* fs.writeWithDirs(target, bytes).pipe(
        Effect.mapError((error) => thesisError(`写入资料失败: ${String(error)}`)),
      )
      return [name]
    })

    const pdfTextThesis = Effect.fn("InstanceHttpApi.thesisPdfText")(function* (ctx: {
      payload: { projectID: string; filename: string }
    }) {
      const proj = yield* project.get(ProjectV2.ID.make(ctx.payload.projectID))
      if (!proj) return yield* Effect.fail(thesisError("论文项目不存在"))
      const name = path.basename(ctx.payload.filename).trim()
      if (!/\.pdf$/i.test(name)) return yield* Effect.fail(thesisError("仅支持 PDF 文件"))
      const source = path.join(proj.worktree, "资料", name)
      const bytes = yield* fs
        .readFile(source)
        .pipe(Effect.mapError((error) => thesisError(`读取 PDF 失败: ${String(error)}`)))
      const text = yield* Effect.tryPromise({
        try: async () => {
          const { getDocumentProxy, extractText } = await import("unpdf")
          const pdf = await getDocumentProxy(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
          const { text } = await extractText(pdf, { mergePages: true })
          return text
        },
        catch: (cause: unknown) => {
          let message = String(cause)
          let current: unknown = cause
          while (current && typeof current === "object" && "cause" in current) {
            current = (current as { cause?: unknown }).cause
            if (current !== undefined && current !== cause) message = String(current)
          }
          return thesisError(`解析 PDF 失败: ${message}`)
        },
      })
      const outputName = name.replace(/\.pdf$/i, "") + ".txt"
      const target = path.join(proj.worktree, "资料", outputName)
      yield* fs
        .writeWithDirs(target, text)
        .pipe(Effect.mapError((error) => thesisError(`写入提取文本失败: ${String(error)}`)))
      return { filename: outputName, chars: text.length }
    })

    // [论文助手定制] 导出 Word：把 Markdown 文稿按排版参数（字体/字号/行距/页边距/标题编号/封面）
    // 排成 .docx 写入项目「正文」目录。options 来自 Step 3 排版参数面板。
    const exportThesisDocx = Effect.fn("InstanceHttpApi.thesisExportDocx")(function* (ctx: {
      payload: Schema.Schema.Type<typeof ThesisExportDocxBody>
    }) {
      const proj = yield* project.get(ProjectV2.ID.make(ctx.payload.projectID))
      if (!proj) return yield* Effect.fail(thesisError("论文项目不存在"))
      const name = path.basename(ctx.payload.filename).trim()
      if (!name) return yield* Effect.fail(thesisError("文件名无效"))
      const content = ctx.payload.content
      if (!content.trim()) return yield* Effect.fail(thesisError("文稿内容为空，无法导出"))
      const buffer = yield* Effect.tryPromise({
        // [论文助手定制] schema 的 pageMargin 是宽类型 LiteralValue，这里显式收窄为排版参数类型
        // （运行时已由 ThesisDocxOptionsSchema 校验为 standard/narrow/thesis 三者之一）。
        try: () => markdownToDocx(content, (ctx.payload.options ?? {}) as ThesisDocxOptions),
        catch: (cause: unknown) => thesisError(`生成 Word 文档失败: ${String(cause)}`),
      })
      const target = path.join(proj.worktree, "正文", name.endsWith(".docx") ? name : `${name}.docx`)
      yield* fs.writeWithDirs(target, buffer).pipe(
        Effect.mapError((error) => thesisError(`写入 Word 文档失败: ${String(error)}`)),
      )
      return { filename: path.basename(target), path: target }
    })

    // [论文助手定制] 文稿落盘：把某步骤的正文写入「正文」目录的 .md 文件（提纲/全文稿/排版稿/评审报告）。
    // 落盘后文稿成为真实文件产物：随论文工作区 git 管理、可在「正文」面板预览、可被 Word/PDF 导出直接引用。
    const MANUSCRIPT_FILENAMES = {
      outline: "提纲.md",
      writing: "全文稿.md",
      formatting: "排版稿.md",
      review: "评审报告.md",
    } as const

    const saveThesisManuscript = Effect.fn("InstanceHttpApi.thesisSaveManuscript")(function* (ctx: {
      payload: Schema.Schema.Type<typeof ThesisSaveManuscriptBody>
    }) {
      const proj = yield* project.get(ProjectV2.ID.make(ctx.payload.projectID))
      if (!proj) return yield* Effect.fail(thesisError("论文项目不存在"))
      if (!ctx.payload.content.trim()) return yield* Effect.fail(thesisError("文稿内容为空"))
      const filename = MANUSCRIPT_FILENAMES[ctx.payload.step]
      const target = path.join(proj.worktree, "正文", filename)
      yield* fs.writeWithDirs(target, Buffer.from(ctx.payload.content, "utf8")).pipe(
        Effect.mapError((error) => thesisError(`写入文稿失败: ${String(error)}`)),
      )
      return { filename, path: target }
    })

    // [论文助手定制] 导出 PDF：把前端渲染好的 HTML 用 Chrome headless 打印成 .pdf 写入「正文」目录。
    const exportThesisPdf = Effect.fn("InstanceHttpApi.thesisExportPdf")(function* (ctx: {
      payload: { projectID: string; filename: string; html: string }
    }) {
      const proj = yield* project.get(ProjectV2.ID.make(ctx.payload.projectID))
      if (!proj) return yield* Effect.fail(thesisError("论文项目不存在"))
      const name = path.basename(ctx.payload.filename).trim()
      if (!name) return yield* Effect.fail(thesisError("文件名无效"))
      if (!ctx.payload.html.trim()) return yield* Effect.fail(thesisError("文稿内容为空，无法导出"))
      const buffer = yield* Effect.tryPromise({
        try: () => htmlToPdf(ctx.payload.html),
        catch: (cause: unknown) => {
          let message = String(cause)
          if (cause && typeof cause === "object" && "message" in cause) message = String((cause as { message: unknown }).message)
          return thesisError(`生成 PDF 失败: ${message}`)
        },
      })
      const target = path.join(proj.worktree, "正文", name.endsWith(".pdf") ? name : `${name}.pdf`)
      yield* fs.writeWithDirs(target, buffer).pipe(
        Effect.mapError((error) => thesisError(`写入 PDF 失败: ${String(error)}`)),
      )
      return { filename: path.basename(target), path: target }
    })

    const getLsp = Effect.fn("InstanceHttpApi.lsp")(function* () {
      return yield* lsp.status()
    })

    const getFormatter = Effect.fn("InstanceHttpApi.formatter")(function* () {
      return yield* format.status()
    })

    return handlers
      .handle("dispose", dispose)
      .handle("path", getPath)
      .handle("vcs", getVcs)
      .handle("vcsStatus", getVcsStatus)
      .handle("vcsDiff", getVcsDiff)
      .handle("vcsDiffRaw", getVcsDiffRaw)
      .handle("vcsApply", applyVcs)
      .handle("command", getCommand)
      .handle("agent", getAgent)
      .handle("skill", getSkill)
      .handle("skillInstall", installSkill)
      .handle("skillInstallDirectory", installSkillDirectory)
      .handle("skillUninstall", uninstallSkill)
      .handle("skillInstallZip", installSkillZip)
      .handle("thesisCreate", createThesis)
      .handle("thesisUpload", uploadThesisFile)
      .handle("thesisPdfText", pdfTextThesis)
      .handle("thesisSaveManuscript", saveThesisManuscript)
      .handle("thesisList", listThesis)
      .handle("thesisDelete", deleteThesis)
      .handle("thesisExportDocx", exportThesisDocx)
      .handle("thesisExportPdf", exportThesisPdf)
      .handle("lsp", getLsp)
      .handle("formatter", getFormatter)
  }),
)
