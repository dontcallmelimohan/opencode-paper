import * as InstanceState from "@/effect/instance-state"
import { Project } from "@/project/project"
import { ProjectV2 } from "@opencode-ai/core/project"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi, ProjectV2Api } from "../api"
import { ProjectNotFoundError } from "../errors"
import { markInstanceForReload } from "../lifecycle"

const list = Effect.fn("ProjectHttpApi.list")(function* () {
  const svc = yield* Project.Service
  return yield* svc.list()
})

const current = Effect.fn("ProjectHttpApi.current")(function* () {
  return (yield* InstanceState.context).project
})

const currentV2 = Effect.fn("ProjectHttpApi.currentV2")(function* () {
  const ctx = yield* InstanceState.context
  return { id: ctx.project.id, directory: ctx.directory }
})

const initGit = Effect.fn("ProjectHttpApi.initGit")(function* () {
  const svc = yield* Project.Service
  const ctx = yield* InstanceState.context
  const next = yield* svc.initGit({ directory: ctx.directory, project: ctx.project })
  if (next.id === ctx.project.id && next.vcs === ctx.project.vcs && next.worktree === ctx.project.worktree)
    return next
  yield* markInstanceForReload(ctx, {
    directory: ctx.directory,
    worktree: ctx.directory,
    project: next,
  })
  return next
})

const update = Effect.fn("ProjectHttpApi.update")(function* (ctx: {
  params: { projectID: ProjectV2.ID }
  payload: Project.UpdatePayload
}) {
  const svc = yield* Project.Service
  return yield* svc.update({ ...ctx.payload, projectID: ctx.params.projectID }).pipe(
    Effect.catchTag("Project.NotFoundError", (error) =>
      Effect.fail(
        new ProjectNotFoundError({
          projectID: error.projectID,
          message: `Project not found: ${error.projectID}`,
        }),
      ),
    ),
  )
})

const directories = Effect.fn("ProjectHttpApi.directories")(function* (ctx: {
  params: { projectID: ProjectV2.ID }
}) {
  const project = yield* ProjectV2.Service
  return yield* project.directories({ projectID: ctx.params.projectID })
})

export const projectHandlers = HttpApiBuilder.group(InstanceHttpApi, "project", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle("list", list)
      .handle("current", current)
      .handle("initGit", initGit)
      .handle("update", update)
      .handle("directories", directories)
  }),
)

export const projectV2Handlers = HttpApiBuilder.group(ProjectV2Api, "project", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle("list", list)
      .handle("current", currentV2)
      .handle("directories", directories)
  }),
)
