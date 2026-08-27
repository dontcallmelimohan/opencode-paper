import { afterEach, describe, expect } from "bun:test"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Effect, Layer } from "effect"
import { HttpClientResponse } from "effect/unstable/http"
import { InstanceBootstrap } from "../../src/project/bootstrap"
import { InstanceStore } from "../../src/project/instance-store"
import { Snapshot } from "../../src/snapshot"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, request } from "./httpapi-layer"

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

const noopBootstrap = Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void }))
const testInstanceStore = AppNodeBuilder.build(InstanceStore.node, [[InstanceStore.bootstrapNode, noopBootstrap]])

const it = testEffect(
  Layer.mergeAll(AppNodeBuilder.build(LayerNode.group([FSUtil.node, Snapshot.node])), testInstanceStore, httpApiLayer),
)

function json<T>(response: HttpClientResponse.HttpClientResponse) {
  return response.json.pipe(Effect.map((value) => value as T))
}

describe("project v2 endpoints", () => {
  it.instance("serves /api/project endpoints for the separated web client", () =>
    Effect.gen(function* () {
      const tmp = yield* TestInstance
      const query = new URLSearchParams({ "location[directory]": tmp.directory }).toString()

      const list = yield* request("/api/project")
      expect(list.status).toBe(200)
      const projects = yield* json<Array<{ id: string; worktree: string }>>(list)
      expect(projects.some((project) => project.worktree === tmp.directory)).toBe(true)

      const current = yield* request(`/api/project/current?${query}`)
      expect(current.status).toBe(200)
      expect(yield* json(current)).toMatchObject({ directory: tmp.directory })

      const dirs = yield* request(`/api/project/global/directories?${query}`)
      expect(dirs.status).toBe(200)
      expect(yield* json<Array<{ directory: string }>>(dirs)).toContainEqual({ directory: tmp.directory })
    }),
  )
})
