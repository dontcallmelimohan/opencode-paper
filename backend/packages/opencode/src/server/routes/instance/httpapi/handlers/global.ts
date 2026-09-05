import { Config } from "@/config/config"
import { GlobalBus, type GlobalEvent as GlobalBusEvent } from "@/bus/global"
import { EffectBridge } from "@/effect/bridge"
import { EventV2 } from "@opencode-ai/core/event"
import { Installation } from "@/installation"
import { disposeAllInstancesAndEmitGlobalDisposed } from "@/server/global-lifecycle"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { Effect, Queue, Schema } from "effect"
import * as Stream from "effect/Stream"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import * as Sse from "effect/unstable/encoding/Sse"
import { RootHttpApi } from "../api"
import { GlobalUpgradeInput, ThesisImageGenerateInput } from "../groups/global"
import { InvalidRequestError } from "../errors"
import { Buffer } from "node:buffer"

function eventData(data: unknown): Sse.Event {
  return {
    _tag: "Event",
    event: "message",
    id: undefined,
    data: JSON.stringify(data),
  }
}

function parseBody(body: string) {
  try {
    return JSON.parse(body || "{}") as unknown
  } catch {
    return undefined
  }
}

function eventResponse() {
  return Effect.gen(function* () {
    yield* Effect.logInfo("global event connected")
    const events = Stream.callback<GlobalBusEvent>((queue) => {
      const handler = (event: GlobalBusEvent) => Queue.offerUnsafe(queue, event)
      return Effect.acquireRelease(
        Effect.sync(() => GlobalBus.on("event", handler)),
        () => Effect.sync(() => GlobalBus.off("event", handler)),
      )
    })
    const heartbeat = Stream.tick("10 seconds").pipe(
      Stream.drop(1),
      Stream.map(() => ({ payload: { id: EventV2.ID.create(), type: "server.heartbeat", properties: {} } })),
    )

    return HttpServerResponse.stream(
      Stream.make({ payload: { id: EventV2.ID.create(), type: "server.connected", properties: {} } }).pipe(
        Stream.concat(events.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }))),
        Stream.map(eventData),
        Stream.pipeThroughChannel(Sse.encode()),
        Stream.encodeText,
        Stream.ensuring(Effect.logInfo("global event disconnected")),
      ),
      {
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Content-Type-Options": "nosniff",
        },
      },
    )
  })
}

export const globalHandlers = HttpApiBuilder.group(RootHttpApi, "global", (handlers) =>
  Effect.gen(function* () {
    const config = yield* Config.Service
    const installation = yield* Installation.Service
    const bridge = yield* EffectBridge.make()

    const health = Effect.fn("GlobalHttpApi.health")(function* () {
      return { healthy: true as const, version: InstallationVersion }
    })

    const event = Effect.fn("GlobalHttpApi.event")(function* () {
      return yield* eventResponse()
    })

    const configGet = Effect.fn("GlobalHttpApi.configGet")(function* () {
      return yield* config.getGlobal()
    })

    const configUpdate = Effect.fn("GlobalHttpApi.configUpdate")(function* (ctx) {
      const result = yield* config.updateGlobal(ctx.payload)
      if (result.changed) bridge.fork(disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true }))
      return result.info
    })

    // [论文助手定制] 模型 API 配置管理：删除全局配置中的某个 provider（opencode 的配置合并无法删键）。
    const modelApiRemove = Effect.fn("GlobalHttpApi.modelApiRemove")(function* (ctx: {
      query: { providerID: string }
    }) {
      const removed = yield* config.removeGlobalProvider(ctx.query.providerID)
      if (removed) bridge.fork(disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true }))
      return removed
    })

    // [论文助手定制] AI 生图：读全局配置 provider「生图」，调 OpenAI 兼容 images/generations，
    // 下载返回的图片转 base64 交给前端（key 不出服务端）。
    const imageGenerate = Effect.fn("GlobalHttpApi.imageGenerate")(function* (ctx: {
      payload: typeof ThesisImageGenerateInput.Type
    }) {
      const info = yield* config.getGlobal()
      const provider = info.provider?.["生图"]
      const apiKey = provider?.options?.apiKey
      const api = provider?.api
      if (!apiKey || !api) {
        return yield* new InvalidRequestError({
          message: "未找到「生图」API 配置，请在 设置 → 模型 API 里添加名称为「生图」的接口",
        })
      }
      const prompt = ctx.payload.prompt?.trim() ?? ""
      if (!prompt) return yield* new InvalidRequestError({ message: "生图描述不能为空" })
      const model = ctx.payload.model?.trim() || Object.keys(provider?.models ?? {})[0] || "GLM-Image"
      const url = `${api.replace(/\/+$/, "")}/images/generations`
      const result = yield* Effect.tryPromise({
        try: async () => {
          const response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model,
              prompt,
              ...(ctx.payload.size ? { size: ctx.payload.size } : {}),
            }),
          })
          if (!response.ok) {
            const detail = (await response.text().catch(() => "")).slice(0, 500)
            throw new InvalidRequestError({ message: `生图服务返回 ${response.status}：${detail}` })
          }
          const json = (await response.json()) as { data?: Array<{ url?: string }> }
          const imageURL = json.data?.[0]?.url
          if (!imageURL) throw new InvalidRequestError({ message: "生图服务未返回图片地址" })
          const image = await fetch(imageURL)
          if (!image.ok) throw new InvalidRequestError({ message: `下载生成的图片失败：HTTP ${image.status}` })
          const bytes = Buffer.from(await image.arrayBuffer())
          const declared = (image.headers.get("content-type") ?? "").split(";")[0].trim()
          let mediaType = /^image\//.test(declared) ? declared : ""
          if (!mediaType) {
            if (bytes[0] === 0xff && bytes[1] === 0xd8) mediaType = "image/jpeg"
            else if (bytes[0] === 0x89 && bytes[1] === 0x50) mediaType = "image/png"
            else if (bytes[0] === 0x47 && bytes[1] === 0x49) mediaType = "image/gif"
            else if (bytes[0] === 0x52 && bytes[1] === 0x49) mediaType = "image/webp"
            else mediaType = "image/png"
          }
          return { b64: bytes.toString("base64"), model, mediaType }
        },
        catch: (error) =>
          error instanceof InvalidRequestError
            ? error
            : new InvalidRequestError({ message: `生图失败：${error instanceof Error ? error.message : String(error)}` }),
      })
      return result
    })

    const dispose = Effect.fn("GlobalHttpApi.dispose")(function* () {
      yield* disposeAllInstancesAndEmitGlobalDisposed()
      return true
    })

    const upgrade = Effect.fn("GlobalHttpApi.upgrade")(function* (ctx: { payload: typeof GlobalUpgradeInput.Type }) {
      const method = yield* installation.method()
      if (method === "unknown") {
        return {
          status: 400,
          body: { success: false as const, error: "Unknown installation method" },
        }
      }
      const target = ctx.payload.target || (yield* installation.latest(method))
      const result = yield* installation.upgrade(method, target).pipe(
        Effect.as({ status: 200, body: { success: true as const, version: target } }),
        Effect.catch((err) =>
          Effect.succeed({
            status: 500,
            body: {
              success: false as const,
              error: err instanceof Error ? err.message : String(err),
            },
          }),
        ),
      )
      if (!result.body.success) return result
      GlobalBus.emit("event", {
        directory: "global",
        payload: {
          type: Installation.Event.Updated.type,
          properties: { version: target },
        },
      })
      return result
    })

    const upgradeRaw = Effect.fn("GlobalHttpApi.upgradeRaw")(function* (ctx: {
      request: HttpServerRequest.HttpServerRequest
    }) {
      const body = yield* Effect.orDie(ctx.request.text)
      const json = parseBody(body)
      if (json === undefined) {
        return HttpServerResponse.jsonUnsafe({ success: false, error: "Invalid request body" }, { status: 400 })
      }
      const payload = yield* Schema.decodeUnknownEffect(GlobalUpgradeInput)(json).pipe(
        Effect.map((payload) => ({ valid: true as const, payload })),
        Effect.catch(() => Effect.succeed({ valid: false as const })),
      )
      if (!payload.valid) {
        return HttpServerResponse.jsonUnsafe({ success: false, error: "Invalid request body" }, { status: 400 })
      }
      const result = yield* upgrade({ payload: payload.payload })
      return HttpServerResponse.jsonUnsafe(result.body, { status: result.status })
    })

    return handlers
      .handle("health", health)
      .handleRaw("event", event)
      .handle("configGet", configGet)
      .handle("configUpdate", configUpdate)
      .handle("modelApiRemove", modelApiRemove)
      .handle("imageGenerate", imageGenerate)
      .handle("dispose", dispose)
      .handleRaw("upgrade", upgradeRaw)
  }),
)
