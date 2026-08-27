import { AppAuth } from "@opencode-ai/server/app-auth"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"

type AuthInput = {
  username?: unknown
  password?: unknown
}

function json(body: unknown, init?: { status?: number; headers?: HeadersInit }) {
  return HttpServerResponse.jsonUnsafe(body, init)
}

function readInput(request: HttpServerRequest.HttpServerRequest) {
  return request.json.pipe(
    Effect.map((value) => (typeof value === "object" && value !== null ? (value as AuthInput) : {})),
    Effect.catch(() => Effect.succeed({})),
  )
}

function credentials(input: AuthInput) {
  return {
    username: typeof input.username === "string" ? input.username : "",
    password: typeof input.password === "string" ? input.password : "",
  }
}

export const authRoute = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add("GET", "/auth/me", (request) =>
      Effect.promise(async () => {
        const user = await AppAuth.currentUserFromCookie(request.headers.cookie)
        return json({ authenticated: !!user, user: user ?? null })
      }),
    )

    yield* router.add("POST", "/auth/register", (request) =>
      Effect.gen(function* () {
        const input = yield* readInput(request)
        const result = yield* Effect.promise(() => AppAuth.register(credentials(input)))
        if (!result.ok) return json({ error: result.message }, { status: result.status })
        return json(
          { user: result.user },
          {
            headers: {
              "set-cookie": AppAuth.sessionCookie(result.session.id),
            },
          },
        )
      }),
    )

    yield* router.add("POST", "/auth/login", (request) =>
      Effect.gen(function* () {
        const input = yield* readInput(request)
        const result = yield* Effect.promise(() => AppAuth.login(credentials(input)))
        if (!result.ok) return json({ error: result.message }, { status: result.status })
        return json(
          { user: result.user },
          {
            headers: {
              "set-cookie": AppAuth.sessionCookie(result.session.id),
            },
          },
        )
      }),
    )

    yield* router.add("POST", "/auth/logout", (request) =>
      Effect.promise(async () => {
        await AppAuth.logout(AppAuth.sessionIDFromCookie(request.headers.cookie))
        return json(
          { ok: true },
          {
            headers: {
              "set-cookie": AppAuth.clearSessionCookie(),
            },
          },
        )
      }),
    )
  }),
)

export * as AppAuthRoutes from "./app-auth-routes"
