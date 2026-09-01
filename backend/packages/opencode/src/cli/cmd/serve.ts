import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@opencode-ai/core/flag/flag"

export const ServeCommand = effectCmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless opencode server",
  // Server loads instances per-request via x-opencode-directory header — no
  // need for an ambient project InstanceContext at startup.
  instance: false,
  handler: Effect.fn("Cli.serve")(function* (args) {
    const { Server } = yield* Effect.promise(() => import("../../server/server"))
    // [论文助手定制] 启动时初始化论文工作台四个固定 Agent（提纲助手/辅助写作/论文排版/论文评审）。
    // 写全局配置目录 agent/（与技能管理安装 Skill 的落点一致），已存在则跳过；失败不阻塞启动。
    const { provisionThesisAgents } = yield* Effect.promise(() => import("../../thesis-agents"))
    yield* Effect.tryPromise(() => provisionThesisAgents()).pipe(Effect.catch(() => Effect.void))
    // [论文助手定制] 暂时禁用 Basic 认证，去掉未设置密码时的安全警告提示
    // if (!Flag.OPENCODE_SERVER_PASSWORD) {
    //   console.log("Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.")
    // }
    const opts = yield* resolveNetworkOptions(args)
    const server = yield* Effect.promise(() => Server.listen(opts))
    console.log(`opencode server listening on http://${server.hostname}:${server.port}`)

    yield* Effect.never
  }),
})
