import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import path from "node:path"
import * as AppAuth from "./app-auth"

export type WorkspaceUser = {
  id: string
  username: string
}

export type RequestAuth =
  | { readonly kind: "user"; readonly user: WorkspaceUser }
  | { readonly kind: "bootstrap"; readonly user: WorkspaceUser }
  | { readonly kind: "unauthorized" }

const bootstrapUser: WorkspaceUser = {
  id: "bootstrap",
  username: "bootstrap",
}

export const bootstrapWorkspaceUser = bootstrapUser

const legacyUserId = process.env.OPENCODE_MULTIUSER_LEGACY_USER_ID?.trim() ?? ""

export function isLegacyWorkspaceUser(user: WorkspaceUser) {
  return legacyUserId !== "" && user.id === legacyUserId
}

export function userWorkspaceRoot(user: WorkspaceUser) {
  if (isLegacyWorkspaceUser(user)) return path.join(Global.Path.home, "thesis-workspace")
  return path.join(Global.Path.data, "users", user.id, "workspaces")
}

export function userThesisRoot(user: WorkspaceUser) {
  return userWorkspaceRoot(user)
}

export function userContainsWorkspace(user: WorkspaceUser, directory: string) {
  return FSUtil.contains(userWorkspaceRoot(user), path.resolve(directory))
}

export async function requestAuthFromCookie(cookieHeader: string | undefined): Promise<RequestAuth> {
  const user = await AppAuth.currentUserFromCookie(cookieHeader)
  if (user) return { kind: "user", user }
  if (!(await AppAuth.hasUsers())) return { kind: "bootstrap", user: bootstrapUser }
  return { kind: "unauthorized" }
}

export * as MultiUser from "./multi-user"
