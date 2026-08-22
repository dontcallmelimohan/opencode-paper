// [论文助手定制] 「辅助写作」模块（论文工作台，方案 B 去线性化）：
// 独立模块，不再依赖必须先完成提纲——参考提纲来源可在表单里显式选择：
// 自动用提纲模块结果 / 手动粘贴 / 不用提纲。多次生成的内容会累积成“全文稿”（writing.result）。
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { createEffect, createResource, createSignal, For, Show } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useThesisGenerator } from "./thesis-generator"
import { useThesisManuscriptFile } from "./thesis-manuscript-file"
import { useThesisWorkflow } from "./thesis-workflow-store"
import { useThesisLive } from "./thesis-live-store"
import { InputSourceSelect, promptToolRestriction, StepFormPanel, StepLayout, StepProductPanel, ThesisSkillPicker } from "./thesis-workflow-ui"
import { useThesisDocxExport, useThesisPdfExport } from "./thesis-export"
import { ThesisFigurePanel } from "./thesis-figure-panel"
import { ASSET_MATERIALS, figureMarker, parseFigures, removeFigure, replaceFigureAlt } from "./thesis-assets"
import { showToast } from "@/utils/toast"

const STYLES = ["学术、审慎、综述型", "逻辑清晰、偏实证", "批判性强、强调争议", "中文核心期刊风格", "英文 SCI 风格"]
const FOCUSES = ["研究脉络与概念边界", "方法比较与证据整合", "应用场景与实践价值", "不足、争议与未来趋势"]
const REFERENCE_STYLES = ["GB/T 7714-2015", "APA 7th", "Vancouver", "IEEE"]

export function StepWriting(props?: { configOpen?: boolean; onToggleConfig?: () => void; onSetConfigOpen?: (next: boolean) => void }) {
  const sdk = useSDK()
  const [localConfigOpen, setLocalConfigOpen] = createSignal(true)
  const configOpen = () => props?.configOpen ?? localConfigOpen()
  const setConfigOpen = (next: boolean) => {
    if (props?.onSetConfigOpen) props.onSetConfigOpen(next)
    else setLocalConfigOpen(next)
  }
  const { state, updateInput, setStepStatus, setStepResult, setStepSessionID } =
    useThesisWorkflow()
  // [论文助手定制] 流式 progress 走轻量 live store（独立细粒度信号，不触发主 store 整树重算）。
  const live = useThesisLive()
  const generator = useThesisGenerator()
  // [论文助手定制] 文稿文件化：全文稿写入项目「正文/全文稿.md」。
  const manuscript = useThesisManuscriptFile(sdk().directory)
  // [论文助手定制] 导出 Word：把全文稿转成 .docx 保存到项目「正文」目录。
  const { exportDocx } = useThesisDocxExport("全文稿")
  // [论文助手定制] 导出 PDF：把全文稿渲染成 PDF 保存到项目「正文」目录。
  const { exportPdf } = useThesisPdfExport("全文稿")
  const writing = () => state().steps.writing
  const input = () => writing().input
  const outlineResult = () => state().steps.outline.result
  const [sourceFiles] = createResource(
    () => input().outlineSource === "file",
    async () => {
      const out: string[] = []
      const walk = async (dir: string, depth: number) => {
        if (depth > 3) return
        const res = await sdk().client.file.list({ directory: sdk().directory, path: dir })
        if (res.error) return
        for (const node of res.data ?? []) {
          if (node.name.startsWith(".")) continue
          if (node.type === "directory") await walk(dir ? `${dir}/${node.name}` : node.name, depth + 1)
          else out.push(dir ? `${dir}/${node.name}` : node.name)
        }
      }
      await walk("", 0)
      return out.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
    },
  )
  const configSummary = () => {
    const values = input()
    const summary = [values.journal.trim() || "未指定期刊", values.style, values.focus, values.length.trim() || "未设长度"]
    return summary.join(" · ")
  }

  const buildPrompt = async () => {
    const values = input()
    const lines: string[] = []
    lines.push("我正在进行论文的「辅助写作」阶段，请根据以下提纲与写作设定撰写初稿。")
    lines.push("")
    lines.push("## 论文提纲")
    // [论文助手定制] 方案 B：按选定的提纲来源取值（auto=提纲模块结果 / manual=手动粘贴 / file=从文件空间选择 / none=不用）。
    let outlineText = "（还没有提纲，请按通用综述论文结构撰写）"
    if (input().outlineSource === "manual") {
      outlineText = input().manualOutline.trim() || "（手动粘贴的提纲为空，请按通用综述论文结构撰写）"
    } else if (input().outlineSource === "none") {
      outlineText = "（不使用提纲，请按通用综述论文结构撰写）"
    } else if (input().outlineSource === "file" && input().sourceFile) {
      try {
        const res = await sdk().client.file.read({ directory: sdk().directory, path: input().sourceFile })
        if (!res.error && res.data?.type === "text") outlineText = res.data.content.trim() || "（从文件空间选中的提纲文件为空，请按通用综述论文结构撰写）"
      } catch {
        outlineText = "（读取文件空间中的提纲文件失败，请按通用综述论文结构撰写）"
      }
    } else {
      outlineText = outlineResult()?.trim() || "（还没有提纲，请按通用综述论文结构撰写）"
    }
    lines.push(outlineText)
    lines.push("")
    lines.push("## 写作设定")
    lines.push(`- 目标期刊 / 投稿方向：${values.journal.trim() || "未指定"}`)
    lines.push(`- 写作风格：${values.style}`)
    lines.push(`- 侧重点：${values.focus}`)
    lines.push(`- 参考文献格式：${values.referenceStyle}`)
    lines.push(`- 目标长度：${values.length.trim() || "未指定"} 字`)
    lines.push(`- 本次撰写章节：${values.chapter.trim() || "按提纲完整撰写"}`)
    if (values.extra.trim()) lines.push(`- 额外要求：${values.extra.trim()}`)
    lines.push("")
    // [论文助手定制] 插图进提示词：把全文稿已有的插图「完整标记」喂给模型
    // （如 ![图1](asset://materials/xxx.png)），而不是只喂「图1」文字；
    // 模型可原样复制标记到新章节，保证图片引用不丢、图注不变。
    const figures = parseFigures(writing().result ?? "")
    if (figures.length > 0) {
      lines.push("## 全文稿已有插图")
      lines.push("以下是全文稿中已有的插图标记（可直接引用编号，或原样复制整行标记）：")
      figures.forEach((figure, index) => lines.push(`- 图${index + 1}：${figure.marker}`))
      lines.push("")
    }
    lines.push("## 输出要求")
    lines.push(
      "只输出论文正文本身（Markdown 格式）。如果指定了章节只写该章节；未指定则按提纲逐章完整撰写，语言要像目标期刊的中文论文。" +
        "严格禁止在开头或结尾添加任何说明、总结、字数统计、下一步建议、提问或对话性文字；" +
        promptToolRestriction(input().useTools) + "上文已包含全部所需材料，直接输出正文本身。" +
        "如需引用「全文稿已有插图」里的插图，请原样复制其 ![图N](asset://...) 标记到正文对应位置（标记含图注，不要改写 asset:// 路径）；" +
        "不要新建或引用列表中不存在的图片。",
    )
    return lines.join("\n")
  }

  // [论文助手定制] 配置面板浮窗化·自动开合：首次进入（idle）自动弹出配置抽屉；
  // 生成中自动收起（产物全宽，配置弱化为首次生成时的浮窗填写）。
  let autoOpened = false
  createEffect(() => {
    const st = writing().status
    if (st === "idle" && !autoOpened) {
      setConfigOpen(true)
      autoOpened = true
    } else if (st === "generating") {
      setConfigOpen(false)
    }
  })

  const generate = async () => {
    if (generator.generating()) return
    setStepStatus("writing", "generating")
    try {
      const { sessionID, text } = await generator.generate({
        prompt: await buildPrompt(),
        // [论文助手定制] 把本步配置面板勾选的 Skill 传给生成器，注入提示词。
        skills: input().skills,
        // [论文助手定制] 把本步配置面板的工具开关传给生成器（true=允许工具调用）。
        useTools: input().useTools,
        sessionID: state().steps.writing.sessionID,
        // [论文助手定制] 边生成边显示：本次章节的实时文本先写入 progress，完成后再追加进 result（全文稿）。
        // [论文助手定制] 方案 B：会话写进「辅助写作」自己的 StepState（每步独立会话）。
        onSessionCreated: (id) => setStepSessionID("writing", id),
        onProgress: (partial) => live.setStepProgress("writing", partial),
      })
      setStepSessionID("writing", sessionID)
      // [论文助手定制] 新生成的章节追加到全文稿后面（result 即全文稿）。
      const previous = writing().result ?? ""
      const next = previous ? `${previous}\n\n${text}` : text
      // [论文助手定制] 落盘：全文稿写入 正文/全文稿.md（文稿视图随后从文件读取）。
      await manuscript.save("writing", next)
      setStepResult("writing", next)
      setConfigOpen(false)
      // [论文助手定制] 完成时同步清掉 live progress（主 store 的 setStepResult 已清自身 progress）。
      live.clearStepProgress("writing")
      showToast({ variant: "success", icon: "circle-check", title: "草稿已生成并追加到全文稿" })
    } catch {
      setStepStatus("writing", writing().result ? "done" : "idle")
    }
  }

  // [论文助手定制] 插图改动的统一落盘：更新 workflow state + 写回 正文/全文稿.md（预览随后从文件重读）。
  const applyManuscript = async (next: string) => {
    if (!next.trim()) return
    setStepResult("writing", next)
    await manuscript.save("writing", next)
  }

  // [论文助手定制] 引用「资料」目录里已有的图片作为插图（图片在主页「资料」上传）。
  const insertMaterialFigure = async (name: string) => {
    const current = writing().result ?? ""
    const marker = figureMarker(`${ASSET_MATERIALS}/${name}`, `图${parseFigures(current).length + 1}`)
    const next = current ? `${current}\n\n${marker}` : marker
    await applyManuscript(next)
  }

  const renameFigure = async (ref: string, alt: string) => {
    const next = replaceFigureAlt(writing().result ?? "", ref, alt)
    if (next === writing().result) return
    await applyManuscript(next)
  }

  const removeFigureFromManuscript = async (ref: string) => {
    const next = removeFigure(writing().result ?? "", ref)
    if (next === writing().result) return
    await applyManuscript(next)
  }

  return (
    <StepLayout
      // [论文助手定制] 配置面板左侧列形态（弱化配置）：collapsed=收起为左侧窄轨；
      // 展开时左侧为可拖拽表单列，与右侧产物并排，不遮挡文稿/会话界面，onExpand 展开。
      collapsed={!configOpen()}
      onExpand={() => setConfigOpen(true)}
      form={
        <StepFormPanel
          title="辅助写作"
          collapsed={!configOpen()}
          collapsedSummary={configSummary()}
          footer={
            <Button type="button" variant="primary" icon="pencil-line" disabled={generator.generating()} onClick={() => void generate()}>
              {generator.generating() ? "生成中…" : "生成草稿"}
            </Button>
          }
        >
          {/* [论文助手定制] 方案 B：参考提纲来源（auto/manual/none），不再强制依赖提纲模块先完成。 */}
          <InputSourceSelect
            label="参考提纲"
            value={input().outlineSource}
            onChange={(value) => updateInput("writing", { outlineSource: value })}
            autoLabel="自动使用提纲结果（提纲模块已生成则自动带入）"
            manualLabel="手动粘贴提纲"
            showFile
            fileLabel="从文件空间选择提纲文件"
            noneLabel="不用提纲（按通用综述结构撰写）"
          />
          <Show when={input().outlineSource === "manual"}>
            <TextField
              multiline
              placeholder="粘贴你的提纲…"
              value={input().manualOutline}
              onChange={(value) => updateInput("writing", { manualOutline: value })}
            />
          </Show>
          <Show when={input().outlineSource === "file"}>
            <section class="flex flex-col gap-1.5">
              <div class="text-12-medium text-v2-text-text-base">选择提纲文件</div>
              <select
                class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
                value={input().sourceFile}
                onChange={(event) => updateInput("writing", { sourceFile: event.currentTarget.value })}
              >
                <option value="">请选择提纲文件…</option>
                <For each={sourceFiles() ?? []}>{(file) => <option value={file}>{file}</option>}</For>
              </select>
              <div class="text-11-regular text-v2-text-text-faint">支持 md/txt/docx/pdf/tex </div>
            </section>
          </Show>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">目标期刊 / 投稿方向</div>
            <TextField
              placeholder="例如：中国科技论文、SCI Q2、教育研究类期刊"
              value={input().journal}
              onChange={(value) => updateInput("writing", { journal: value })}
            />
          </section>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">写作风格</div>
            <select
              class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
              value={input().style}
              onChange={(event) => updateInput("writing", { style: event.currentTarget.value })}
            >
              <For each={STYLES}>{(item) => <option value={item}>{item}</option>}</For>
            </select>
          </section>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">侧重点</div>
            <select
              class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
              value={input().focus}
              onChange={(event) => updateInput("writing", { focus: event.currentTarget.value })}
            >
              <For each={FOCUSES}>{(item) => <option value={item}>{item}</option>}</For>
            </select>
          </section>
          <div class="flex gap-2">
            <section class="flex min-w-0 flex-1 flex-col gap-1.5">
              <div class="text-12-medium text-v2-text-text-base">参考文献格式</div>
              <select
                class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
                value={input().referenceStyle}
                onChange={(event) => updateInput("writing", { referenceStyle: event.currentTarget.value })}
              >
                <For each={REFERENCE_STYLES}>{(item) => <option value={item}>{item}</option>}</For>
              </select>
            </section>
            <section class="flex min-w-0 flex-1 flex-col gap-1.5">
              <div class="text-12-medium text-v2-text-text-base">目标长度（字）</div>
              <TextField
                type="text"
                value={input().length}
                onChange={(value) => updateInput("writing", { length: value })}
              />
            </section>
          </div>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">本次撰写章节</div>
            <TextField
              placeholder="留空 = 按提纲完整撰写；或填写章节名，例如：第二章 研究现状"
              value={input().chapter}
              onChange={(value) => updateInput("writing", { chapter: value })}
            />
          </section>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">额外要求</div>
            <TextField
              multiline
              placeholder="例如：强调研究现状和文献不足，语言要像中文核心期刊"
              value={input().extra}
              onChange={(value) => updateInput("writing", { extra: value })}
            />
          </section>
          {/* [论文助手定制] 插图管理：上传图片插入全文稿、编辑图注、删除引用。 */}
          <ThesisFigurePanel
            directory={sdk().directory}
            figures={parseFigures(writing().result ?? "")}
            busy={generator.generating()}
            onInsertMaterial={insertMaterialFigure}
            onRename={renameFigure}
            onRemove={removeFigureFromManuscript}
          />
          {/* [论文助手定制] Skill 多选：勾选的 Skill 在生成时注入提示词（见 thesis-generator）。 */}
          <ThesisSkillPicker step="writing" />
          <Show when={input().outlineSource === "auto" && !outlineResult()}>
            <div class="flex items-start gap-1.5 rounded-md bg-v2-background-bg-layer-01 px-2.5 py-2 text-11-regular text-v2-text-text-faint">
              自动模式暂无提纲结果，可切换为「手动粘贴提纲」或「不用提纲」。
            </div>
          </Show>
        </StepFormPanel>
      }
      product={
        <StepProductPanel
          title="论文全文稿（可继续追加章节）"
          status={writing().status}
          progressText={live.progress().writing}
          result={writing().result}
          onExportDocx={() => void exportDocx(writing().result ?? "")}
          onExportPdf={() => void exportPdf(writing().result ?? "")}
          // [论文助手定制] 产物标题栏动作：保留生成/重新生成主按钮（配置入口已移至左侧表单列/窄轨齿轮）。
          titleActions={
            <Button
              type="button"
              variant="primary"
              icon="pencil-line"
              disabled={generator.generating()}
              onClick={() => void generate()}
            >
              {generator.generating() ? "生成中…" : writing().status === "done" ? "继续生成" : "生成草稿"}
            </Button>
          }
          emptyHint="「生成全文稿」"
          manuscript={{ directory: sdk().directory, step: "writing" }}
          configOpen={configOpen()}
          onToggleConfig={() => setConfigOpen(!configOpen())}
          footer={
            <Show when={writing().result}>
              <Button type="button" variant="ghost" size="small" onClick={() => setStepResult("writing", "")}>
                清空全文稿
              </Button>
            </Show>
          }
        />
      }
    />
  )
}
