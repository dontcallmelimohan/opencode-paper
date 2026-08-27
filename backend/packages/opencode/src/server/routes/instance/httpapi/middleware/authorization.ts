import { ServerAuth } from "@/server/auth"
import { Effect, Encoding, Layer, Redacted } from "effect"
import { HttpEffect, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
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

export class PtyConnectAuthorization extends HttpApiMiddleware.Service<PtyConnectAuthorization>()(
  "@opencode/ExperimentalHttpApiPtyConnectAuthorization",
  {
    error: HttpApiError.UnauthorizedNoContent,
  },
) {}

function emptyCredential() {
  return {
    username: "",
    password: Redacted.make(""),
  }
}

function validateCredential<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  credential: ServerAuth.DecodedCredentials,
  config: ServerAuth.Info,
) {
  // [论文助手定制] 暂时禁用 Basic 认证（用户名/密码），直接放行所有请求。
  // 后续需要恢复认证时，取消下面被注释的校验逻辑即可。
  return effect
  // return Effect.gen(function* () {
  //   if (!ServerAuth.required(config)) return yield* effect
  //   if (!ServerAuth.authorized(credential, config)) {
  //     yield* HttpEffect.appendPreResponseHandler((_request, response) =>
  //       Effect.succeed(HttpServerResponse.setHeader(response, "www-authenticate", WWW_AUTHENTICATE)),
  //     )
  //     return yield* new HttpApiError.Unauthorized({})
  //   }
  //   return yield* effect
  // })
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
) {
  // [论文助手定制] 暂时禁用 Basic 认证，直接放行。
  return effect
  // if (!ServerAuth.required(config)) return effect
  // if (!ServerAuth.authorized(credential, config))
  //   return Effect.succeed(
  //     HttpServerResponse.empty({
  //       status: UNAUTHORIZED,
  //       headers: { "www-authenticate": WWW_AUTHENTICATE },
  //     }),
  //   )
  // return effect
}

export const authorizationRouterMiddleware = HttpRouter.middleware()(
  Effect.gen(function* () {
    // [论文助手定制] 暂时禁用 Basic 认证，所有路由直接放行。
    return (effect) => effect
    // const config = yield* ServerAuth.Config
    // if (!ServerAuth.required(config)) return (effect) => effect
    //
    // return (effect) =>
    //   Effect.gen(function* () {
    //     const request = yield* HttpServerRequest.HttpServerRequest
    //     const url = new URL(request.url, "http://localhost")
    //     if (isPublicUIPath(request.method, url.pathname)) return yield* effect
    //     return yield* credentialFromURL(url, request).pipe(
    //       Effect.flatMap((credential) => validateRawCredential(effect, credential, config)),
    //     )
    //   })
  }),
)

export const authorizationLayer = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    // [论文助手定制] 暂时禁用 Basic 认证，直接放行。
    return Authorization.of((effect) => effect)
    // const config = yield* ServerAuth.Config
    // if (!ServerAuth.required(config)) return Authorization.of((effect) => effect)
    // return Authorization.of((effect) =>
    //   Effect.gen(function* () {
    //     const request = yield* HttpServerRequest.HttpServerRequest
    //     return yield* credentialFromRequest(request).pipe(
    //       Effect.flatMap((credential) => validateCredential(effect, credential, config)),
    //     )
    //   }),
    // )
  }),
)

export const ptyConnectAuthorizationLayer = Layer.effect(
  PtyConnectAuthorization,
  Effect.gen(function* () {
    // [论文助手定制] 暂时禁用 Basic 认证，直接放行。
    return PtyConnectAuthorization.of((effect) => effect)
    // const config = yield* ServerAuth.Config
    // if (!ServerAuth.required(config)) return PtyConnectAuthorization.of((effect) => effect)
    // return PtyConnectAuthorization.of((effect) =>
    //   Effect.gen(function* () {
    //     const request = yield* HttpServerRequest.HttpServerRequest
    //     const url = new URL(request.url, "http://localhost")
    //     if (hasPtyConnectTicketURL(url)) return yield* effect
    //     return yield* credentialFromURL(url, request).pipe(
    //       Effect.flatMap((credential) => validateCredential(effect, credential, config)),
    //     )
    //   }),
    // )
  }),
)
