import { describe, expect, test } from "bun:test"
import {
  cacheDataUrl,
  dataUrlOf,
  figureCaptions,
  figureMarker,
  imageExtension,
  mimeOf,
  parseFigures,
  refToPath,
  removeFigure,
  replaceFigureAlt,
  resolveAssetUrls,
  resolveLocalImages,
} from "./thesis-assets"

describe("parseFigures", () => {
  test("extracts refs with location prefix, alt and marker", () => {
    const md = "前言\n\n![图1：实验装置](asset://figures/a1b2.png)\n\n正文 ![图2 数据](asset://materials/曲线.jpg) 结尾"
    expect(parseFigures(md)).toEqual([
      { ref: "figures/a1b2.png", alt: "图1：实验装置", marker: "![图1：实验装置](asset://figures/a1b2.png)" },
      { ref: "materials/曲线.jpg", alt: "图2 数据", marker: "![图2 数据](asset://materials/曲线.jpg)" },
    ])
  })

  test("ignores ordinary image links", () => {
    expect(parseFigures("![图](https://example.com/x.png)")).toEqual([])
  })
})

describe("refToPath", () => {
  test("maps figures and materials prefixes to workspace dirs", () => {
    expect(refToPath("figures/a.png")).toBe("figures/a.png")
    expect(refToPath("materials/装置图.png")).toBe("/装置图.png")
  })

  test("falls back to figures for unknown prefix", () => {
    expect(refToPath("other/x.png")).toBe("figures/x.png")
  })
})

describe("figureMarker / replaceFigureAlt / removeFigure", () => {
  const md = `标题\n\n![图1](asset://figures/a.png)\n\n正文 ![图1](asset://figures/a.png) 结尾\n\n![图2](asset://materials/b.jpg)`

  test("figureMarker builds the asset reference", () => {
    expect(figureMarker("figures/a.png", "图1：设备")).toBe("![图1：设备](asset://figures/a.png)")
  })

  test("replaceFigureAlt updates every reference of the ref", () => {
    const out = replaceFigureAlt(md, "figures/a.png", "图1：改造后装置")
    expect(out).toContain("![图1：改造后装置](asset://figures/a.png)")
    expect(out.match(/改造后装置/g)).toHaveLength(2)
  })

  test("replaceFigureAlt leaves other figures untouched", () => {
    const out = replaceFigureAlt(md, "figures/a.png", "图1：新图注")
    expect(out).toContain("![图2](asset://materials/b.jpg)")
  })

  test("removeFigure deletes all references and collapses blank lines", () => {
    const out = removeFigure(md, "figures/a.png")
    expect(out).not.toContain("asset://figures/a.png")
    expect(out).toContain("正文  结尾")
    expect(out).toContain("![图2](asset://materials/b.jpg)")
  })
})

describe("figureCaptions", () => {
  test("numbers captions by appearance order", () => {
    expect(figureCaptions("![甲](asset://figures/a.png) ![乙](asset://materials/b.png)")).toEqual(["图1：甲", "图2：乙"])
  })
})

describe("image mime helpers", () => {
  test("imageExtension lowercases the trailing extension", () => {
    expect(imageExtension("Photo.PNG")).toBe("png")
    expect(imageExtension("figures/Photo.PNG")).toBe("png")
    expect(imageExtension("noext")).toBe("noext")
  })

  test("mimeOf maps known extensions", () => {
    expect(mimeOf("materials/x.jpeg")).toBe("image/jpeg")
    expect(mimeOf("figures/x.svg")).toBe("image/svg+xml")
    expect(mimeOf("materials/x.txt")).toBe("application/octet-stream")
  })

  test("dataUrlOf builds a data: URL", () => {
    expect(dataUrlOf("figures/x.png", "QUJD")).toBe("data:image/png;base64,QUJD")
  })
})

describe("resolveAssetUrls", () => {
  test("replaces cached asset references with data URLs", () => {
    cacheDataUrl("/proj", "figures/a.png", "QUJD")
    const md = "![图1](asset://figures/a.png) ![图2](asset://materials/b.png)"
    expect(resolveAssetUrls(md, "/proj")).toBe(
      "![图1](data:image/png;base64,QUJD) ![图2](asset://materials/b.png)",
    )
  })
})

describe("resolveLocalImages", () => {
  test("resolves relative image paths to data URLs and caches them", async () => {
    const md = "![4](4.jpg)"
    const out1 = await resolveLocalImages(md, "/proj", "", async (path) => (path === "4.jpg" ? "QUJD" : undefined))
    expect(out1).toBe("![4](data:image/jpeg;base64,QUJD)")
    // [论文助手定制] 第二次命中缓存：read 不会被再次调用（修复预览不稳定/重复读文件）。
    let calls = 0
    const out2 = await resolveLocalImages(md, "/proj", "", async () => {
      calls += 1
      return "QUJD"
    })
    expect(out2).toBe("![4](data:image/jpeg;base64,QUJD)")
    expect(calls).toBe(0)
  })

  test("resolves relative to baseDir and caches by disk path", async () => {
    const md = "![a](../images/a.png)"
    const read = async (path: string) => (path === "正文/../images/a.png" ? "QUJD" : undefined)
    const out = await resolveLocalImages(md, "/proj", "正文", read)
    expect(out).toBe("![a](data:image/png;base64,QUJD)")
  })

  test("leaves missing images untouched (not cached, can retry later)", async () => {
    const md = "![4](missing.jpg)"
    const out = await resolveLocalImages(md, "/proj", "", async () => undefined)
    expect(out).toBe("![4](missing.jpg)")
    // 失败不缓存：换个能读到的 read 再次解析应成功
    const retried = await resolveLocalImages(md, "/proj", "", async () => "QUJD")
    expect(retried).toBe("![4](data:image/jpeg;base64,QUJD)")
  })
})
