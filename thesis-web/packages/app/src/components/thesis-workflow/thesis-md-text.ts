// [论文助手定制] Markdown 源码 ↔ 纯文本的辅助工具。
// 用途：AI 改写回退时，选中文本来自 ProseMirror 纯文本视图，而文稿是 Markdown 源码
// （行首 #、**加粗**、*斜体*、`代码` 等标记），直接 indexOf 可能匹配不到
// （如选中「引言」在「## 引言」里找不到），需要把选中文本映射回源码区间再替换。

// [论文助手定制] 把 Markdown 源码转成「纯文本 + 偏移映射」：行首 #、**加粗**、*斜体*、`代码`
// 会被跳过，map[j] 记录纯文本第 j 个字符在源码中的偏移（换行符也保留在 plain 与 map 里）。
export const buildPlainDoc = (source: string): { plain: string; map: number[] } => {
  const plain: string[] = []
  const map: number[] = []
  let lineStart = 0
  for (const line of source.split("\n")) {
    let i = 0
    const heading = line.match(/^#{1,6}\s+/)
    if (heading) i = heading[0].length
    const consume = (pattern: RegExp, offset: number) => {
      const match = line.slice(i).match(pattern)
      if (!match) return false
      const inner = match[1]!
      for (let k = 0; k < inner.length; k++) {
        plain.push(inner[k])
        map.push(lineStart + i + offset + k)
      }
      i += match[0].length
      return true
    }
    while (i < line.length) {
      if (consume(/^`([^`]+)`/, 1) || consume(/^\*\*([^*]+)\*\*/, 2) || consume(/^\*([^*]+)\*/, 1)) continue
      plain.push(line[i])
      map.push(lineStart + i)
      i += 1
    }
    if (lineStart + line.length < source.length) {
      plain.push("\n")
      map.push(lineStart + line.length)
    }
    lineStart += line.length + 1
  }
  return { plain: plain.join(""), map }
}
