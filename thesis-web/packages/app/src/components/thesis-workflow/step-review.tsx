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
import { useThesisLive } from "./thesis-live-store"
import { InputSourceSelect, promptToolRestriction, StepFormPanel, StepLayout, StepProductPanel, ThesisSkillPicker } from "./thesis-workflow-ui"
import { useThesisDocxExport, useThesisPdfExport } from "./thesis-export"
import { showToast } from "@/utils/toast"

const REVIEW_MODES = ["全面评审", "格式与规范评审", "内容与论证评审", "创新性评审", "快速初审"]

export function StepReview() {
  const sdk = useSDK()
  const { state, updateInput, setStepStatus, setStepResult, setStepSessionID } = useThesisWorkflow()
  // [论文助手定制] 流式 progress 走轻量 live store（独立细粒度信号，不触发主 store 整树重算）。
  const live = useThesisLive()
  const generator = useThesisGenerator()
  // [论文助手定制] 文稿文件化：评审报告写入项目「正文/评审报告.md」。
  const manuscript = useThesisManuscriptFile(sdk().directory)
  // [论文助手定制] 导出 Word：把评审报告转成 .docx 保存到项目「正文」目录。
  const { exportDocx } = useThesisDocxExport("评审报告")
  // [论文助手定制] 导出 PDF：把评审报告渲染成 PDF 保存到项目「正文」目录。
  const { exportPdf } = useThesisPdfExport("评审报告")
  const review = () => state().steps.review
  const input = () => review().input
  // [论文助手定制] 方案 B：评审对象按选定来源取值（auto=排版稿>全文稿 / manual=手动粘贴 / none=无源稿）。
  const paper = () => {
    if (input().paperSource === "manual") return input().manualPaper.trim()
    if (input().paperSource === "none") return ""
    return state().steps.formatting.result ?? state().steps.writing.result ?? ""
  }

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
      "输出两部分内容：\n1. 评审报告正文（Markdown，含总体评分、分项意见、逐条修改建议、结论：录用/修改后录用/拒稿）；\n2. 最后附一个 JSON 块（```json ... ```），格式：{\"score\": 0-100 整数, \"metrics\": [{\"name\": \"选题价值\", \"score\": 0-100}], \"comments\": [{\"level\": \"high|mid|low\", \"text\": \"...\"}], \"suggestions\": [{\"level\": \"high|mid|low\", \"text\": \"...\"}]}，metrics 至少包含选题价值/结构逻辑/论证与证据/文献引用/语言表达/格式规范。" +
        promptToolRestriction(input().useTools) + "上文已包含全部所需材料，直接输出评审内容本身。",
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
        // [论文助手定制] 把本步配置面板的工具开关传给生成器（true=允许工具调用）。
        useTools: input().useTools,
        sessionID: state().steps.review.sessionID,
        // [论文助手定制] 边生成边显示：实时文本先写入 progress，完成后再落到 result。
        // [论文助手定制] 方案 B：会话写进「论文评审」自己的 StepState（每步独立会话）。
        onSessionCreated: (id) => setStepSessionID("review", id),
        onProgress: (partial) => live.setStepProgress("review", partial),
      })
      setStepSessionID("review", sessionID)
      // [论文助手定制] 落盘：评审报告写入 正文/评审报告.md（文稿视图随后从文件读取）。
      await manuscript.save("review", text)
      setStepResult("review", text)
      // [论文助手定制] 完成时同步清掉 live progress（主 store 的 setStepResult 已清自身 progress）。
      live.clearStepProgress("review")
      showToast({ variant: "success", icon: "circle-check", title: "评审报告已生成" })
    } catch {
      setStepStatus("review", review().result ? "done" : "idle")
    }
  }

  return (
    <StepLayout
      form={
        <StepFormPanel
          title="论文评审"
          subtitle="独立模块：按选定评审对象与要求输出评分和修改建议。"
          footer={
            <Button type="button" variant="primary" icon="magnifying-glass" disabled={generator.generating()} onClick={() => void generate()}>
              {generator.generating() ? "评审中…" : "生成评审报告"}
            </Button>
          }
        >
          {/* [论文助手定制] 方案 B：评审对象来源（auto/manual/none），不再依赖前面的步骤先完成。 */}
          <InputSourceSelect
            label="评审对象"
            value={input().paperSource}
            onChange={(value) => updateInput("review", { paperSource: value })}
            autoLabel="自动使用排版稿（没有则用全文稿）"
            manualLabel="手动粘贴论文文本"
            noneLabel="无源稿（按通用论文评审）"
          />
          <Show when={input().paperSource === "manual"}>
            <TextField
              multiline
              placeholder="粘贴要评审的论文全文…"
              value={input().manualPaper}
              onChange={(value) => updateInput("review", { manualPaper: value })}
            />
          </Show>
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
          <Show when={input().paperSource === "auto" && !paper()}>
            <div class="flex items-start gap-1.5 rounded-md bg-v2-background-bg-layer-01 px-2.5 py-2 text-11-regular text-v2-text-text-faint">
              自动模式暂无论文文本，可切换为「手动粘贴论文文本」或「无源稿」。
            </div>
          </Show>
        </StepFormPanel>
      }
      product={
        <StepProductPanel
          title="评审报告"
          status={review().status}
          progressText={live.progress().review}
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
