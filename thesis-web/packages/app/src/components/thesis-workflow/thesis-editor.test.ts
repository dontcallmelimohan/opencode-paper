import { describe, expect, test } from "bun:test"
import { normalizeInlineAiReplacement, shouldKeepAiReplacementInline } from "./thesis-editor"

describe("inline ai replacement helpers", () => {
  test("keeps a normal single-line rewrite inline", () => {
    expect(shouldKeepAiReplacementInline("原句", "优化后的表达")).toBe(true)
    expect(normalizeInlineAiReplacement(" 优化后\n的表达 ")).toBe("优化后 的表达")
  })

  test("falls back to block handling for structured markdown", () => {
    expect(shouldKeepAiReplacementInline("原句", "第一行\n\n第二行")).toBe(false)
    expect(shouldKeepAiReplacementInline("原句", "- 条目一")).toBe(false)
    expect(shouldKeepAiReplacementInline("原句", "## 标题")).toBe(false)
    expect(shouldKeepAiReplacementInline("原句", "> 引用")).toBe(false)
  })

  test("does not force inline replacement when the selected text is already multi-line", () => {
    expect(shouldKeepAiReplacementInline("第一行\n第二行", "替换后的内容")).toBe(false)
  })
})
