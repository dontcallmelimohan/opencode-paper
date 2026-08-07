import { Agent } from "@/agent/agent"
import { Command } from "@/command"
import { Config } from "@/config/config"
import * as InstanceState from "@/effect/instance-state"
import { Format } from "@/format"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import { LSP } from "@/lsp/lsp"
import { Vcs } from "@/project/vcs"
import { Skill } from "@/skill"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { ApiSkillInstallError, ApiVcsApplyError } from "../groups/instance"
import { markInstanceForDisposal } from "../lifecycle"
import path from "path"

export const instanceHandlers = HttpApiBuilder.group(InstanceHttpApi, "instance", (handlers) =>
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const command = yield* Command.Service
    const config = yield* Config.Service
    const format = yield* Format.Service
    const fs = yield* FSUtil.Service
    const lsp = yield* LSP.Service
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

    const installSkill = Effect.fn("InstanceHttpApi.skillInstall")(function* (ctx: {
      payload: { name: string; description?: string; content: string; prompt?: string }
    }) {
      const { name, description, content, prompt } = ctx.payload
      const trimmed = name.trim()
      if (!/^[\p{L}\p{N}_-]+$/u.test(trimmed) || trimmed.startsWith(".")) {
        return yield* Effect.fail(
          new ApiSkillInstallError({
            name: "SkillInstallError",
            data: { message: `Invalid skill name: "${name}". Use letters, numbers, _ or -` },
          }),
        )
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

      yield* config.invalidate()
      yield* agent.reload()
      yield* skill.reload()

      const installed = (yield* agent.list()).find((item) => item.name === trimmed)
      const installedSkill = (yield* skill.all()).find((item) => item.name === trimmed)
      if (!installed || !installedSkill) {
        return yield* Effect.fail(
          new ApiSkillInstallError({
            name: "SkillInstallError",
            data: { message: `Installed "${trimmed}" but it is not visible yet; restart the server to pick it up.` },
          }),
        )
      }
      return { agent: installed, skill: installedSkill }
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
      .handle("lsp", getLsp)
      .handle("formatter", getFormatter)
  }),
)
