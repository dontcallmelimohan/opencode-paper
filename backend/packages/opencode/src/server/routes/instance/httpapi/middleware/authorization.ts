import { ServerAuth } from "@/server/auth"
import { MultiUser } from "@opencode-ai/server/multi-user"
import { Context, Effect, Encoding, Layer, Redacted } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiError, HttpApiMiddleware } from "effect/unstable/httpapi"
import { hasPtyConnectTicketURL } from "@/server/shared/pty-ticket"
import { isPublicUIPath } from "@/server/shared/public-ui"
export {
  Authorization as ServerAuthorization,
  authorizationLayer as serverAuthorizationLayer,
} from "@opencode-ai/server/middleware/authorization"

const AUTH_TOKEN_QUERY = "auth_token"
const UNAUTHORIZED = 401
const WWW_AUTHENTICATE = 'Basic realm="Secure Area"'

// Avoid HttpApiSecurity alternatives here: Effect security middleware wraps the
// full handler, so a downstream failure can make the next auth alternative run
// and remap an authorized NotFound into Unauthorized.
export class Authorization extends HttpApiMiddleware.Service<Authorization>()(
  "@opencode/ExperimentalHttpApiAuthorization",
  {
    error: HttpApiError.UnauthorizedNoContent,
  },
) {}

export class CurrentUser extends Context.Service<CurrentUser, MultiUser.WorkspaceUser>()(
  "@opencode/ExperimentalHttpApiCurrentUser",
) {}

export class PtyConnectAuthorization extends HttpApiMiddleware.Service<PtyConnectAuthorization>()(
  "@opencode/ExperimentalHttpApiPtyConnectAuthorization",
  {
    error: HttpApiError.UnauthorizedNoContent,
  },
) {}

const serverWorkspaceUser: MultiUser.WorkspaceUser = {
  id: "server",
  username: "server",
}

function emptyCredential() {
  return {
    username: "",
    password: Redacted.make(""),
  }
}

function authenticateRequest<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  request: HttpServerRequest.HttpServerRequest,
  config: ServerAuth.Info,
) {
  return Effect.gen(function* () {
    if (ServerAuth.required(config)) {
      const credential = yield* credentialFromRequest(request)
      if (!ServerAuth.authorized(credential, config)) {
        return HttpServerResponse.empty({
          status: UNAUTHORIZED,
          headers: { "www-authenticate": WWW_AUTHENTICATE },
        })
      }
      return yield* effect.pipe(Effect.provideService(CurrentUser, CurrentUser.of(serverWorkspaceUser)))
    }

    const auth = yield* Effect.promise(() => MultiUser.requestAuthFromCookie(request.headers.cookie))
    if (auth.kind === "unauthorized") return HttpServerResponse.empty({ status: UNAUTHORIZED })
    return yield* effect.pipe(Effect.provideService(CurrentUser, CurrentUser.of(auth.user)))
  })
}

function decodeCredential(input: string) {
  return Effect.fromResult(Encoding.decodeBase64String(input)).pipe(
    Effect.match({
      onFailure: emptyCredential,
      onSuccess: (header) => {
        const separator = header.indexOf(":")
        if (separator === -1) return emptyCredential()
        return {
          username: header.slice(0, separator),
          password: Redacted.make(header.slice(separator + 1)),
        }
      },
    }),
  )
}

function credentialFromRequest(request: HttpServerRequest.HttpServerRequest) {
  return credentialFromURL(new URL(request.url, "http://localhost"), request)
}

function credentialFromURL(url: URL, request: HttpServerRequest.HttpServerRequest) {
  const token = url.searchParams.get(AUTH_TOKEN_QUERY)
  if (token) return decodeCredential(token)
  const match = /^Basic\s+(.+)$/i.exec(request.headers.authorization ?? "")
  if (match) return decodeCredential(match[1])
  return Effect.succeed(emptyCredential())
}

function validateRawCredential<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  credential: ServerAuth.DecodedCredentials,
  config: ServerAuth.Info,
) {}

export const authorizationRouterMiddleware = HttpRouter.middleware()(
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    return (effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, "http://localhost")
        const isUIGet = request.method === "GET" && !url.pathname.startsWith("/doc") && !url.pathname.startsWith("/api/")
        if (isPublicUIPath(request.method, url.pathname) || isUIGet) return yield* effect
        return yield* authenticateRequest(effect, request, config)
      })
  }),
)

export const authorizationLayer = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    return Authorization.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        return yield* authenticateRequest(effect, request, config)
      }),
    )
  }),
)

export const ptyConnectAuthorizationLayer = Layer.effect(
  PtyConnectAuthorization,
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    return PtyConnectAuthorization.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, "http://localhost")
        if (hasPtyConnectTicketURL(url)) return yield* effect
        return yield* authenticateRequest(effect, request, config)
      }),
    )
  }),
)
