// [论文助手定制] Step 2 辅助写作（论文工作台）：
// 基于 Step 1 的提纲 + 写作设定（期刊/风格/侧重/参考文献格式/长度/章节）生成章节草稿，
// 多次生成的内容会按顺序累积成“全文稿”（writing.result），最终交给 Step 3 排版。
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { For, Show } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useThesisGenerator } from "./thesis-generator"
import { useThesisManuscriptFile } from "./thesis-manuscript-file"
import { useThesisWorkflow } from "./thesis-workflow-store"
import { StepFormPanel, StepLayout, StepProductPanel, ThesisSkillPicker } from "./thesis-workflow-ui"
import { useThesisDocxExport, useThesisPdfExport } from "./thesis-export"
import { showToast } from "@/utils/toast"

const STYLES = ["学术、审慎、综述型", "逻辑清晰、偏实证", "批判性强、强调争议", "中文核心期刊风格", "英文 SCI 风格"]
const FOCUSES = ["研究脉络与概念边界", "方法比较与证据整合", "应用场景与实践价值", "不足、争议与未来趋势"]
const REFERENCE_STYLES = ["GB/T 7714-2015", "APA 7th", "Vancouver", "IEEE"]

export function StepWriting() {
  const sdk = useSDK()
  const { state, updateInput, setStepStatus, setStepProgress, setStepResult, setSessionID, setActiveStep } =
    useThesisWorkflow()
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

  const buildPrompt = () => {
    const values = input()
    const lines: string[] = []
    lines.push("我正在进行论文的「辅助写作」阶段，请根据以下提纲与写作设定撰写初稿。")
    lines.push("")
    lines.push("## 论文提纲")
    lines.push(outlineResult()?.trim() || "（还没有提纲，请按通用综述论文结构撰写）")
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
    lines.push("## 输出要求")
    lines.push(
      "只输出论文正文本身（Markdown 格式）。如果指定了章节只写该章节；未指定则按提纲逐章完整撰写，语言要像目标期刊的中文论文。" +
        "严格禁止在开头或结尾添加任何说明、总结、字数统计、下一步建议、提问或对话性文字；严禁调用任何工具、skill、文件读取或外部命令，不要输出 <tool_calls> 等 XML 标记；上文已包含全部所需材料，直接输出正文本身。",
    )
    return lines.join("\n")
  }

  const generate = async () => {
    if (generator.generating()) return
    setStepStatus("writing", "generating")
    try {
      const { sessionID, text } = await generator.generate({
        prompt: buildPrompt(),
        // [论文助手定制] 把本步配置面板勾选的 Skill 传给生成器，注入提示词。
        skills: input().skills,
        sessionID: state().sessionID,
        // [论文助手定制] 边生成边显示：本次章节的实时文本先写入 progress，完成后再追加进 result（全文稿）。
        // [论文助手定制] 会话一创建立即启用「会话」切换（见 thesis-generator.ts）。
        onSessionCreated: setSessionID,
        onProgress: (partial) => setStepProgress("writing", partial),
      })
      setSessionID(sessionID)
      // [论文助手定制] 新生成的章节追加到全文稿后面（result 即全文稿）。
      const previous = writing().result ?? ""
      const next = previous ? `${previous}\n\n${text}` : text
      // [论文助手定制] 落盘：全文稿写入 正文/全文稿.md（文稿视图随后从文件读取）。
      await manuscript.save("writing", next)
      setStepResult("writing", next)
      showToast({ variant: "success", icon: "circle-check", title: "草稿已生成并追加到全文稿" })
    } catch {
      setStepStatus("writing", writing().result ? "done" : "idle")
    }
  }

  return (
    <StepLayout
      form={
        <StepFormPanel
          stepLabel="Step 2"
          title="辅助写作"
          subtitle="基于提纲与写作设定生成章节草稿，多次生成会累积成全文稿。"
          footer={
            <div class="flex flex-col gap-2">
              <Button type="button" variant="primary" icon="pencil-line" disabled={generator.generating()} onClick={() => void generate()}>
                {generator.generating() ? "生成中…" : "生成草稿"}
              </Button>
              <Show when={writing().status === "done"}>
                <Button type="button" variant="secondary" icon="arrow-right" onClick={() => setActiveStep("formatting")}>
                  进入论文排版
                </Button>
              </Show>
            </div>
          }
        >
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
          {/* [论文助手定制] Skill 多选：勾选的 Skill 在生成时注入提示词（见 thesis-generator）。 */}
          <ThesisSkillPicker step="writing" />
          <Show when={!outlineResult()}>
            <div class="flex items-start gap-1.5 rounded-md bg-v2-background-bg-layer-01 px-2.5 py-2 text-11-regular text-v2-text-text-faint">
              还没有提纲，建议先完成 Step 1「提纲助手」。
            </div>
          </Show>
        </StepFormPanel>
      }
      product={
        <StepProductPanel
          title="论文全文稿（可继续追加章节）"
          status={writing().status}
          progressText={writing().progress}
          result={writing().result}
          onExportDocx={() => void exportDocx(writing().result ?? "")}
          onExportPdf={() => void exportPdf(writing().result ?? "")}
          emptyHint="设定左侧参数后点击「生成草稿」，全文稿会累积在这里。"
          manuscript={{ directory: sdk().directory, step: "writing" }}
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
