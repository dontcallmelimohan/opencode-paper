// [论文助手定制] 论文工作台「插图」工具：
// 图片统一放在项目根目录（主页「文件空间」上传），文稿里用 ![图注](asset://materials/<名字>) 引用；
// 保留 figures 前缀以兼容早期 asset://figures/<uuid> 历史引用。本模块负责：
//   - 解析 / 新增 / 改图注 / 删除 文稿中的 asset:// 插图标记（纯字符串，可单测）；
//   - 把 asset:// 引用解析为本机 data URL（file.read 对二进制返回 base64），供预览与导出使用。
import type { DirectorySDK } from "@/context/sdk"

export const FIGURES_DIR = "figures"
export const MATERIALS_DIR = ""
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

// [论文助手定制] 按引用路径定位磁盘目录：figures → figures，materials → 根目录，未知前缀按 figures 兜底。
export const refToPath = (ref: string): string => {
  const [location, ...rest] = ref.split("/")
  if (location === ASSET_MATERIALS) return rest.join("/")
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

// [论文助手定制] 本地相对路径图片（如 ![4](4.jpg)）的 data URL 缓存：key = 目录|路径，
// 与 asset:// 插图缓存同一策略，避免每次预览/每次按键都重新读文件导致图片闪烁或偶尔加载不出。
// 只缓存成功读取的图片；失败不缓存，下次预览可以重试。
const localImageUrls = new Map<string, string>()
const localImageKey = (directory: string, path: string) => `${directory}\u0000${path}`

export const cachedLocalImageUrl = (directory: string, path: string): string | undefined =>
  localImageUrls.get(localImageKey(directory, path)) || undefined

export const cacheLocalImageUrl = (directory: string, path: string, dataUrl: string) => {
  localImageUrls.set(localImageKey(directory, path), dataUrl)
}
// [论文助手定制] 把 Markdown 里的本地相对路径图片（非 http/data/asset 开头）解析成本机 data URL。
// 相对路径以 md 文件所在目录（baseDir）为基准（如正文/ 或项目根）；读取失败（图片不存在）保留原样。
export const LOCAL_IMAGE_MARKER_RE = /!\[([^\]]*)\]\(([^)]+)\)/g

export async function resolveLocalImages(
  md: string,
  directory: string,
  baseDir: string,
  read: (path: string) => Promise<string | undefined>,
): Promise<string> {
  const matches = [...md.matchAll(LOCAL_IMAGE_MARKER_RE)]
  if (matches.length === 0) return md
  let out = md
  for (const match of matches) {
    const alt = match[1] ?? ""
    const src = (match[2] ?? "").trim()
    // 跳过网络图片 / data URL / asset:// 内部引用 / 绝对路径
    if (/^(https?:|data:|asset:|\/)/i.test(src)) continue
    const clean = src.replace(/^\.\//, "").split(/[?#]/)[0] ?? src
    const ext = imageExtension(clean)
    if (!(IMAGE_EXTENSIONS as readonly string[]).includes(ext)) continue
    const diskPath = baseDir ? `${baseDir}/${clean}` : clean
    // [论文助手定制] 命中缓存直接用 data URL，避免反复读文件。
    const cached = cachedLocalImageUrl(directory, diskPath)
    if (cached) {
      out = out.replace(match[0], `![${alt}](${cached})`)
      continue
    }
    try {
      const content = await read(diskPath)
      if (!content) continue
      const dataUrl = dataUrlOf(clean, content)
      cacheLocalImageUrl(directory, diskPath, dataUrl)
      out = out.replace(match[0], `![${alt}](${dataUrl})`)
    } catch {
      // 图片不存在/读取失败：保留原样（不缓存，下次可重试）
    }
  }
  return out
}

// [论文助手定制] 统一的 Markdown 图片解析入口（文件空间预览 / 文稿视图 / 编辑实时预览共用）：
// 先解析论文内部插图 asset:// 引用为 data URL，再把本地相对路径图片
// （相对 baseDir，如文件所在目录或「正文」目录）解析成本机 data URL；
// 读取失败的图片保留原样（渲染时以 alt 兜底，不会裂图）。
export async function resolveMarkdownImages(
  sdk: DirectorySDK,
  directory: string,
  baseDir: string,
  md: string,
): Promise<string> {
  let resolved = md
  const refs = parseFigures(md).map((figure) => figure.ref)
  if (refs.length > 0) {
    await ensureFigureDataUrls(sdk, directory, refs)
    resolved = resolveAssetUrls(md, directory)
  }
  return resolveLocalImages(resolved, directory, baseDir, async (path) => {
    const res = await sdk.client.file.read({ directory, path })
    if (res.error || res.data?.type !== "binary") return undefined
    return res.data.content
  })
}
