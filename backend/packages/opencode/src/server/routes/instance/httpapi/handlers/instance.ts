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
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { ApiSkillInstallError, ApiThesisError, ApiVcsApplyError } from "../groups/instance"
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

    const thesisError = (message: string) =>
      new ApiThesisError({ name: "ThesisError", data: { message } })

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
      .handle("thesisCreate", createThesis)
      .handle("thesisUpload", uploadThesisFile)
      .handle("thesisPdfText", pdfTextThesis)
      .handle("lsp", getLsp)
      .handle("formatter", getFormatter)
  }),
)
