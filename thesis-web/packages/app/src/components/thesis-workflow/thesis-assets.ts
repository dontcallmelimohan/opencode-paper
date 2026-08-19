// [论文助手定制] 论文工作台「插图」工具：
// 图片统一放在项目「资料」目录（主页「资料」上传），文稿里用 ![图注](asset://materials/<名字>) 引用；
// 保留 figures 前缀以兼容早期 asset://figures/<uuid> 历史引用。本模块负责：
//   - 解析 / 新增 / 改图注 / 删除 文稿中的 asset:// 插图标记（纯字符串，可单测）；
//   - 把 asset:// 引用解析为本机 data URL（file.read 对二进制返回 base64），供预览与导出使用。
import type { DirectorySDK } from "@/context/sdk"

export const FIGURES_DIR = "正文/figures"
export const MATERIALS_DIR = "资料"
export const ASSET_MATERIALS = "materials"
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] as const

export type Figure = {
  // asset:// 后的引用路径，如 materials/装置图.png
  ref: string
  alt: string
  marker: string
}

// [论文助手定制] 插图标记：![alt](asset://ref)。alt 不允许含 ]（解析正则按 [^\]] 匹配）。
export const figureMarker = (ref: string, alt: string) => `![${alt}](asset://${ref})`

const MARKER_RE = /!\[([^\]]*)\]\(asset:\/\/([^)\s]+)\)/g
const ASSET_URL_RE = /asset:\/\/([^)\s]+)/g

export const parseFigures = (md: string): Figure[] => {
  const figures: Figure[] = []
  for (const match of md.matchAll(MARKER_RE)) figures.push({ ref: match[2], alt: match[1], marker: match[0] })
  return figures
}

// [论文助手定制] 按引用路径定位磁盘目录：figures → 正文/figures，materials → 资料，未知前缀按 figures 兜底。
export const refToPath = (ref: string): string => {
  const [location, ...rest] = ref.split("/")
  if (location === ASSET_MATERIALS) return `${MATERIALS_DIR}/${rest.join("/")}`
  return `${FIGURES_DIR}/${rest.join("/")}`
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const byRef = (ref: string) => new RegExp(`!\\[[^\\]]*\\]\\(asset://${escapeRegExp(ref)}\\)`, "g")

// [论文助手定制] 替换该插图的图注（所有引用处一起改）。
export const replaceFigureAlt = (md: string, ref: string, alt: string): string =>
  md.replace(byRef(ref), figureMarker(ref, alt))

// [论文助手定制] 删除该插图的所有引用（连同标记后可能紧跟的空行）。
export const removeFigure = (md: string, ref: string): string => md.replace(byRef(ref), "").replace(/\n{3,}/g, "\n\n")

// [论文助手定制] 收集全部插图图注，形如「图1：xxx」，供提示词引用（进 prompt 的是文字图注而非像素）。
export const figureCaptions = (md: string): string[] => parseFigures(md).map((figure, index) => `图${index + 1}：${figure.alt}`)

export const imageExtension = (name: string): string => name.split(".").pop()?.toLowerCase() ?? ""

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
}

export const mimeOf = (ref: string): string => MIME_BY_EXT[imageExtension(ref)] ?? "application/octet-stream"

export const dataUrlOf = (ref: string, base64: string): string => `data:${mimeOf(ref)};base64,${base64}`

// [论文助手定制] data URL 缓存：key = 目录|ref。上传时写入 base64，预览/导出时读文件补缓存。
const dataUrls = new Map<string, string>()
const cacheKey = (directory: string, ref: string) => `${directory}\u0000${ref}`

export const cachedDataUrl = (directory: string, ref: string): string | undefined =>
  dataUrls.get(cacheKey(directory, ref)) || undefined

export const cacheDataUrl = (directory: string, ref: string, base64: string) => {
  dataUrls.set(cacheKey(directory, ref), base64 ? dataUrlOf(ref, base64) : "")
}

// [论文助手定制] 确保这些插图都已缓存 data URL（读不到就缓存空串，避免反复请求）。
export async function ensureFigureDataUrls(sdk: DirectorySDK, directory: string, refs: string[]) {
  const missing = [...new Set(refs)].filter((ref) => ref && !dataUrls.has(cacheKey(directory, ref)))
  await Promise.all(
    missing.map(async (ref) => {
      const res = await sdk.client.file.read({ directory, path: refToPath(ref) })
      cacheDataUrl(directory, ref, res.error || res.data?.type !== "binary" ? "" : (res.data.content ?? ""))
    }),
  )
}

// [论文助手定制] 同步替换文本里的 asset:// 引用为已缓存的 data URL（未缓存的原样保留 alt 文本）。
export const resolveAssetUrls = (md: string, directory: string): string =>
  md.replace(ASSET_URL_RE, (match, ref: string) => cachedDataUrl(directory, ref) ?? match)