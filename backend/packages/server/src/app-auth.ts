import { Global } from "@opencode-ai/core/global"
import fs from "node:fs/promises"
import path from "node:path"

const AUTH_FILE = path.join(Global.Path.data, "thesis-auth.json")
const COOKIE_NAME = "thesis_session"
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7

type StoredUser = {
  id: string
  username: string
  passwordHash: string
  createdAt: string
}

type StoredSession = {
  id: string
  userId: string
  expiresAt: string
}

type Store = {
  users: StoredUser[]
  sessions: StoredSession[]
}

export type PublicUser = {
  id: string
  username: string
}

const emptyStore = (): Store => ({ users: [], sessions: [] })

function normalizeUsername(username: string) {
  return username.trim().toLowerCase()
}

function publicUser(user: StoredUser): PublicUser {
  return { id: user.id, username: user.username }
}

function now() {
  return new Date()
}

function expiresAt() {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString()
}

async function readStore(): Promise<Store> {
  try {
    const text = await fs.readFile(AUTH_FILE, "utf8")
    const data = JSON.parse(text) as Partial<Store>
    return {
      users: Array.isArray(data.users) ? data.users : [],
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
    }
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return emptyStore()
    throw error
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(path.dirname(AUTH_FILE), { recursive: true })
  const temp = `${AUTH_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`
  await fs.writeFile(temp, JSON.stringify(store, null, 2), { mode: 0o600 })
  await fs.rename(temp, AUTH_FILE)
  await fs.chmod(AUTH_FILE, 0o600).catch(() => {})
}

function cleanSessions(store: Store) {
  const time = now().getTime()
  store.sessions = store.sessions.filter((session) => new Date(session.expiresAt).getTime() > time)
}

function parseCookie(header: string | undefined) {
  const result = new Map<string, string>()
  if (!header) return result
  for (const part of header.split(";")) {
    const index = part.indexOf("=")
    if (index === -1) continue
    result.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim()))
  }
  return result
}

export async function register(input: { username: string; password: string }) {
  const username = input.username.trim()
  if (username.length < 1 || username.length > 64) {
    return { ok: false as const, status: 400, message: "请输入 1-64 位用户名" }
  }
  if (input.password.length < 8) {
    return { ok: false as const, status: 400, message: "密码至少需要 8 位" }
  }

  const store = await readStore()
  cleanSessions(store)
  if (store.users.length > 0 && process.env.OPENCODE_AUTH_OPEN_REGISTRATION !== "true") {
    return { ok: false as const, status: 403, message: "注册已关闭" }
  }
  if (store.users.some((user) => normalizeUsername(user.username) === normalizeUsername(username))) {
    return { ok: false as const, status: 409, message: "用户名已存在" }
  }

  const user: StoredUser = {
    id: crypto.randomUUID(),
    username,
    passwordHash: await Bun.password.hash(input.password, "argon2id"),
    createdAt: now().toISOString(),
  }
  const session: StoredSession = { id: crypto.randomUUID(), userId: user.id, expiresAt: expiresAt() }
  store.users.push(user)
  store.sessions.push(session)
  await writeStore(store)
  return { ok: true as const, user: publicUser(user), session }
}

export async function login(input: { username: string; password: string }) {
  const username = normalizeUsername(input.username)
  const store = await readStore()
  cleanSessions(store)
  const user = store.users.find((item) => item.username === username)
  if (!user || !(await Bun.password.verify(input.password, user.passwordHash))) {
    return { ok: false as const, status: 401, message: "用户名或密码错误" }
  }

  const session: StoredSession = { id: crypto.randomUUID(), userId: user.id, expiresAt: expiresAt() }
  store.sessions.push(session)
  await writeStore(store)
  return { ok: true as const, user: publicUser(user), session }
}

export async function logout(sessionID: string | undefined) {
  if (!sessionID) return
  const store = await readStore()
  store.sessions = store.sessions.filter((session) => session.id !== sessionID)
  await writeStore(store)
}

export async function currentUserFromCookie(cookieHeader: string | undefined) {
  const sessionID = parseCookie(cookieHeader).get(COOKIE_NAME)
  if (!sessionID) return
  const store = await readStore()
  cleanSessions(store)
  const session = store.sessions.find((item) => item.id === sessionID)
  if (!session) {
    await writeStore(store)
    return
  }
  const user = store.users.find((item) => item.id === session.userId)
  if (!user) return
  return publicUser(user)
}

export function sessionIDFromCookie(cookieHeader: string | undefined) {
  return parseCookie(cookieHeader).get(COOKIE_NAME)
}

export function sessionCookie(sessionID: string) {
  const secure = process.env.OPENCODE_AUTH_SECURE_COOKIES === "true" ? "; Secure" : ""
  return `${COOKIE_NAME}=${encodeURIComponent(sessionID)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(
    SESSION_TTL_MS / 1000,
  )}${secure}`
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function isPublicAuthPath(pathname: string) {
  return pathname === "/auth/login" || pathname === "/auth/register" || pathname === "/auth/logout" || pathname === "/auth/me"
}

export * as AppAuth from "./app-auth"
