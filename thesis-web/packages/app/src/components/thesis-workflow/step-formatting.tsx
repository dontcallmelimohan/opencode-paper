// [论文助手定制] Step 3 论文排版（论文工作台）：
// 以 Step 2 的全文稿为源稿，按目标期刊/学校模板、参考文献格式、标题层级等要求生成排版后的最终稿。
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { For, Show } from "solid-js"
import { useThesisGenerator } from "./thesis-generator"
import { useThesisWorkflow } from "./thesis-workflow-store"
import { StepFormPanel, StepLayout, StepProductPanel } from "./thesis-workflow-ui"
import { showToast } from "@/utils/toast"

const PAPER_TYPES = ["综述论文", "课程论文", "毕业论文", "期刊投稿稿"]
const REFERENCE_STYLES = ["GB/T 7714-2015", "APA 7th", "MLA 9th", "Vancouver", "IEEE"]
const HEADING_STYLES = ["三级标题", "二级标题", "四号标题层级", "英文小标题"]
const TYPOGRAPHIES = ["中文学术默认", "中文核心期刊风格", "英文 SCI 风格", "毕业论文模板"]

export function StepFormatting() {
  const { state, updateInput, setStepStatus, setStepProgress, setStepResult, setSessionID, setActiveStep } =
    useThesisWorkflow()
  const generator = useThesisGenerator()
  const formatting = () => state().steps.formatting
  const input = () => formatting().input
  const sourcePaper = () => state().steps.writing.result ?? ""

  const buildPrompt = () => {
    const values = input()
    const lines: string[] = []
    lines.push("我正在进行论文的「论文排版」阶段，请把下面的论文全文按排版要求整理成最终稿。")
    lines.push("")
    lines.push("## 排版要求")
    lines.push(`- 目标期刊 / 学校模板：${values.journal.trim() || "未指定"}`)
    lines.push(`- 论文类型：${values.paperType}`)
    lines.push(`- 参考文献格式：${values.referenceStyle}`)
    lines.push(`- 标题层级：${values.headingStyle}`)
    lines.push(`- 排版风格：${values.typography}`)
    if (values.requirements.trim()) lines.push(`- 额外排版要求：${values.requirements.trim()}`)
    lines.push("")
    lines.push("## 论文全文")
    lines.push(sourcePaper() || "（暂无全文稿）")
    lines.push("")
    lines.push("## 输出要求")
    lines.push(
      "输出排版后的完整论文（Markdown 格式）：统一标题层级与编号、段首缩进、图表编号、参考文献列表按指定格式排列。",
    )
    return lines.join("\n")
  }

  const generate = async () => {
    if (generator.generating()) return
    setStepStatus("formatting", "generating")
    try {
      const { sessionID, text } = await generator.generate({
        prompt: buildPrompt(),
        sessionID: state().sessionID,
        // [论文助手定制] 边生成边显示：实时文本先写入 progress，完成后再落到 result。
        // [论文助手定制] 会话一创建立即启用「会话」切换（见 thesis-generator.ts）。
        onSessionCreated: setSessionID,
        onProgress: (partial) => setStepProgress("formatting", partial),
      })
      setSessionID(sessionID)
      setStepResult("formatting", text)
      showToast({ variant: "success", icon: "circle-check", title: "排版稿已生成，可进入论文评审" })
    } catch {
      setStepStatus("formatting", formatting().result ? "done" : "idle")
    }
  }

  return (
    <StepLayout
      form={
        <StepFormPanel
          stepLabel="Step 3"
          title="论文排版"
          subtitle="按目标期刊/模板的格式要求整理最终稿。"
          footer={
            <div class="flex flex-col gap-2">
              <Button type="button" variant="primary" icon="layout-left" disabled={generator.generating()} onClick={() => void generate()}>
                {generator.generating() ? "生成中…" : "生成排版稿"}
              </Button>
              <Show when={formatting().status === "done"}>
                <Button type="button" variant="secondary" icon="arrow-right" onClick={() => setActiveStep("review")}>
                  进入论文评审
                </Button>
              </Show>
            </div>
          }
        >
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">目标期刊 / 学校模板</div>
            <TextField
              placeholder="例如：中文核心综述类期刊、学校毕业论文模板、SCI 期刊"
              value={input().journal}
              onChange={(value) => updateInput("formatting", { journal: value })}
            />
          </section>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">论文类型</div>
            <select
              class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
              value={input().paperType}
              onChange={(event) => updateInput("formatting", { paperType: event.currentTarget.value })}
            >
              <For each={PAPER_TYPES}>{(item) => <option value={item}>{item}</option>}</For>
            </select>
          </section>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">参考文献格式</div>
            <select
              class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
              value={input().referenceStyle}
              onChange={(event) => updateInput("formatting", { referenceStyle: event.currentTarget.value })}
            >
              <For each={REFERENCE_STYLES}>{(item) => <option value={item}>{item}</option>}</For>
            </select>
          </section>
          <div class="flex gap-2">
            <section class="flex min-w-0 flex-1 flex-col gap-1.5">
              <div class="text-12-medium text-v2-text-text-base">标题层级</div>
              <select
                class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
                value={input().headingStyle}
                onChange={(event) => updateInput("formatting", { headingStyle: event.currentTarget.value })}
              >
                <For each={HEADING_STYLES}>{(item) => <option value={item}>{item}</option>}</For>
              </select>
            </section>
            <section class="flex min-w-0 flex-1 flex-col gap-1.5">
              <div class="text-12-medium text-v2-text-text-base">排版风格</div>
              <select
                class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
                value={input().typography}
                onChange={(event) => updateInput("formatting", { typography: event.currentTarget.value })}
              >
                <For each={TYPOGRAPHIES}>{(item) => <option value={item}>{item}</option>}</For>
              </select>
            </section>
          </div>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">额外排版要求</div>
            <TextField
              multiline
              placeholder="例如：图表编号、页眉页脚、参考文献排序规则"
              value={input().requirements}
              onChange={(value) => updateInput("formatting", { requirements: value })}
            />
          </section>
          <Show when={!sourcePaper()}>
            <div class="flex items-start gap-1.5 rounded-md bg-v2-background-bg-layer-01 px-2.5 py-2 text-11-regular text-v2-text-text-faint">
              还没有全文稿，建议先完成 Step 2「辅助写作」。
            </div>
          </Show>
        </StepFormPanel>
      }
      product={
        <StepProductPanel
          title="排版后的最终稿"
          status={formatting().status}
          progressText={formatting().progress}
          result={formatting().result}
          emptyHint="设定排版要求后点击「生成排版稿」，最终稿会显示在这里。"
        />
      }
    />
  )
}
