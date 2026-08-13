import { describe, expect, test } from "bun:test"
import { isMarkdownPath } from "./markdown-path"

describe("isMarkdownPath", () => {
  test("detects markdown extensions case-insensitively", () => {
    expect(isMarkdownPath("notes.md")).toBe(true)
    expect(isMarkdownPath("chapter/README.markdown")).toBe(true)
    expect(isMarkdownPath("slides.MDX")).toBe(true)
  })

  test("rejects non-markdown and extensionless paths", () => {
    expect(isMarkdownPath("notes.txt")).toBe(false)
    expect(isMarkdownPath("chapter/paper.pdf")).toBe(false)
    expect(isMarkdownPath("README")).toBe(false)
    expect(isMarkdownPath(undefined)).toBe(false)
  })
})
