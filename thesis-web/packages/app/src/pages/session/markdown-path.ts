const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdx"])

export function isMarkdownPath(path: string | undefined) {
  if (!path) return false
  const slash = path.lastIndexOf("/")
  const dot = path.lastIndexOf(".")
  if (dot <= slash) return false
  return MARKDOWN_EXTENSIONS.has(path.slice(dot).toLowerCase())
}
