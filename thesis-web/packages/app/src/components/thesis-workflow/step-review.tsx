// [论文助手定制] Step 4 论文评审（论文工作台）：
// 以排版稿（优先）或全文稿为评审对象，以目标期刊审稿人身份输出评分、分项意见与修改建议。
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { For, Show } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useThesisGenerator } from "./thesis-generator"
import { useThesisManuscriptFile } from "./thesis-manuscript-file"
import { ThesisReviewReport } from "./thesis-review-report"
import { useThesisWorkflow } from "./thesis-workflow-store"
import { StepFormPanel, StepLayout, StepProductPanel, ThesisSkillPicker } from "./thesis-workflow-ui"
import { useThesisDocxExport, useThesisPdfExport } from "./thesis-export"
import { showToast } from "@/utils/toast"

const REVIEW_MODES = ["全面评审", "格式与规范评审", "内容与论证评审", "创新性评审", "快速初审"]

export function StepReview() {
  const sdk = useSDK()
  const { state, updateInput, setStepStatus, setStepProgress, setStepResult, setSessionID } = useThesisWorkflow()
  const generator = useThesisGenerator()
  // [论文助手定制] 文稿文件化：评审报告写入项目「正文/评审报告.md」。
  const manuscript = useThesisManuscriptFile(sdk().directory)
  // [论文助手定制] 导出 Word：把评审报告转成 .docx 保存到项目「正文」目录。
  const { exportDocx } = useThesisDocxExport("评审报告")
  // [论文助手定制] 导出 PDF：把评审报告渲染成 PDF 保存到项目「正文」目录。
  const { exportPdf } = useThesisPdfExport("评审报告")
  const review = () => state().steps.review
  const input = () => review().input
  // [论文助手定制] 评审对象优先级：排版稿 > 全文稿。
  const paper = () => state().steps.formatting.result ?? state().steps.writing.result ?? ""

  const buildPrompt = () => {
    const values = input()
    const lines: string[] = []
    lines.push(`请以「${values.journal.trim() || "目标期刊"}」审稿人的身份，对下面这篇论文进行「${values.mode}」。`)
    if (values.focus.trim()) lines.push(`评审重点：${values.focus.trim()}`)
    lines.push("")
    lines.push("## 论文全文")
    lines.push(paper() || "（暂无论文文本）")
    lines.push("")
    lines.push("## 输出要求")
    lines.push(
      "输出两部分内容：\n1. 评审报告正文（Markdown，含总体评分、分项意见、逐条修改建议、结论：录用/修改后录用/拒稿）；\n2. 最后附一个 JSON 块（```json ... ```），格式：{\"score\": 0-100 整数, \"metrics\": [{\"name\": \"选题价值\", \"score\": 0-100}], \"comments\": [{\"level\": \"high|mid|low\", \"text\": \"...\"}], \"suggestions\": [{\"level\": \"high|mid|low\", \"text\": \"...\"}]}，metrics 至少包含选题价值/结构逻辑/论证与证据/文献引用/语言表达/格式规范。严禁调用任何工具、skill、文件读取或外部命令，不要输出 <tool_calls> 等 XML 标记；上文已包含全部所需材料，直接输出评审内容本身。",
    )
    return lines.join("\n")
  }

  const generate = async () => {
    if (generator.generating()) return
    setStepStatus("review", "generating")
    try {
      const { sessionID, text } = await generator.generate({
        prompt: buildPrompt(),
        // [论文助手定制] 把本步配置面板勾选的 Skill 传给生成器，注入提示词。
        skills: input().skills,
        sessionID: state().sessionID,
        // [论文助手定制] 边生成边显示：实时文本先写入 progress，完成后再落到 result。
        // [论文助手定制] 会话一创建立即启用「会话」切换（见 thesis-generator.ts）。
        onSessionCreated: setSessionID,
        onProgress: (partial) => setStepProgress("review", partial),
      })
      setSessionID(sessionID)
      // [论文助手定制] 落盘：评审报告写入 正文/评审报告.md（文稿视图随后从文件读取）。
      await manuscript.save("review", text)
      setStepResult("review", text)
      showToast({ variant: "success", icon: "circle-check", title: "评审报告已生成" })
    } catch {
      setStepStatus("review", review().result ? "done" : "idle")
    }
  }

  return (
    <StepLayout
      form={
        <StepFormPanel
          stepLabel="Step 4"
          title="论文评审"
          subtitle="以目标期刊审稿人身份输出评分与修改建议。"
          footer={
            <Button type="button" variant="primary" icon="magnifying-glass" disabled={generator.generating()} onClick={() => void generate()}>
              {generator.generating() ? "评审中…" : "生成评审报告"}
            </Button>
          }
        >
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">目标期刊</div>
            <TextField
              placeholder="例如：中文核心综述类期刊、SCI Q2"
              value={input().journal}
              onChange={(value) => updateInput("review", { journal: value })}
            />
          </section>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">评审模式</div>
            <select
              class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
              value={input().mode}
              onChange={(event) => updateInput("review", { mode: event.currentTarget.value })}
            >
              <For each={REVIEW_MODES}>{(item) => <option value={item}>{item}</option>}</For>
            </select>
          </section>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">评审重点</div>
            <TextField
              multiline
              placeholder="例如：重点关注文献综述的覆盖度和创新点论证"
              value={input().focus}
              onChange={(value) => updateInput("review", { focus: value })}
            />
          </section>
          {/* [论文助手定制] Skill 多选：勾选的 Skill 在生成时注入提示词（见 thesis-generator）。 */}
          <ThesisSkillPicker step="review" />
          <Show when={!paper()}>
            <div class="flex items-start gap-1.5 rounded-md bg-v2-background-bg-layer-01 px-2.5 py-2 text-11-regular text-v2-text-text-faint">
              还没有论文文本，建议先完成前面的步骤。
            </div>
          </Show>
        </StepFormPanel>
      }
      product={
        <StepProductPanel
          title="评审报告"
          status={review().status}
          progressText={review().progress}
          result={review().result}
          onExportDocx={() => void exportDocx(review().result ?? "")}
          onExportPdf={() => void exportPdf(review().result ?? "")}
          emptyHint="设定评审要求后点击「生成评审报告」，评分与修改建议会显示在这里。"
          render={(text) => <ThesisReviewReport text={text} />}
          manuscript={{ directory: sdk().directory, step: "review" }}
        />
      }
    />
  )
}
