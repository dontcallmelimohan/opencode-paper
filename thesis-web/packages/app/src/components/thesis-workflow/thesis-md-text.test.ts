import { describe, expect, test } from "bun:test"
import { buildPlainDoc } from "./thesis-md-text"

describe("buildPlainDoc", () => {
  test("普通段落保持原样", () => {
    const source = "第一段正文内容"
    const { plain, map } = buildPlainDoc(source)
    expect(plain).toBe(source)
    expect(map).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  test("行首标题标记被跳过并映射回源码偏移", () => {
    const source = "## 引言\n正文"
    const { plain, map } = buildPlainDoc(source)
    expect(plain).toBe("引言\n正文")
    // 「引言」两个字符对应源码偏移 3、4；换行符对应偏移 5。
    expect(map).toEqual([3, 4, 5, 6, 7])
    const p = plain.indexOf("引言")
    expect(p).toBe(0)
    expect(map[p]).toBe(3)
  })

  test("加粗标记被剥掉并映射到完整标记区间", () => {
    const source = "前文**重要**内容"
    const { plain, map } = buildPlainDoc(source)
    expect(plain).toBe("前文重要内容")
    // 「重要」的纯文本起点偏移 2，末字符偏移 3 → 源码区间 [2, 4) 只是内文；
    // 结合外层向两侧扩展（在调用方做）可覆盖整个 **重要**。
    const p = plain.indexOf("重要")
    expect(map[p]).toBe(4)
    expect(map[p + 1]).toBe(5)
  })

  test("代码标记被剥掉", () => {
    const source = "公式 `E=mc^2` 成立"
    const { plain } = buildPlainDoc(source)
    expect(plain).toBe("公式 E=mc^2 成立")
  })

  test("多行段落跨行选中可定位", () => {
    const source = "第一章\n\n**结论**：完成"
    const { plain, map } = buildPlainDoc(source)
    expect(plain).toBe("第一章\n\n结论：完成")
    const p = plain.indexOf("结论")
    expect(p).toBe(5)
    expect(map[p]).toBe(7)
  })
})
