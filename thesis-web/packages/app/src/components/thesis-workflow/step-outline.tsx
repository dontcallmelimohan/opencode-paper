// [论文助手定制] 「提纲助手」模块（论文工作台，方案 B 去线性化）：
// 独立模块：填写综述需求、方向侧重、勾选知识库材料 → 一键“生成提纲” → 产物（分章节综述大纲）以 Markdown 展示。
// 产物存在 workflow state 的 outline.result；辅助写作模块可选择是否引用它。
import { Button } from "@opencode-ai/ui/button"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { Icon } from "@opencode-ai/ui/icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { For, Show } from "solid-js"
import { useSDK } from "@/context/sdk"
import { showToast } from "@/utils/toast"
import { useThesisGenerator } from "./thesis-generator"
import { useThesisKnowledge } from "./thesis-knowledge-store"
import { useThesisManuscriptFile } from "./thesis-manuscript-file"
import { ThesisKnowledgePanel } from "./thesis-knowledge-panel"
import { useThesisWorkflow } from "./thesis-workflow-store"
import { useThesisLive } from "./thesis-live-store"
import { promptToolRestriction, StepFormPanel, StepLayout, StepProductPanel, ThesisSkillPicker } from "./thesis-workflow-ui"
import { useThesisDocxExport, useThesisPdfExport } from "./thesis-export"

// [论文助手定制] 方向侧重选项（写入提示词）。
const DIRECTIONS = [
  { key: "review", label: "现状梳理", hint: "梳理该方向的研究现状与进展" },
  { key: "depth", label: "深度", hint: "对关键问题做深入分析" },
  { key: "standard", label: "标准", hint: "按学术规范组织章节" },
  { key: "clue", label: "论文线索", hint: "标注各章节相关的论文线索" },
] as const

// [论文助手定制] Step 1 论文设定选项：类型 / 语言 / 图表 / 目标字数（全部写入提示词）。
const PAPER_TYPES = ["期刊论文", "毕业论文", "会议论文", "综述论文", "其他"] as const
const LANGUAGES = ["中文", "英文"] as const
const HAS_FIGURES = ["有图表", "无图表"] as const
const TARGET_WORDS = ["3000", "5000", "8000", "12000", "15000", "20000"] as const

type DirectionKey = (typeof DIRECTIONS)[number]["key"]

export function StepOutline() {
  const sdk = useSDK()
  const { state, updateInput, setStepStatus, setStepResult, setStepSessionID } =
    useThesisWorkflow()
  // [论文助手定制] 流式 progress 走轻量 live store（独立细粒度信号，不触发主 store 整树重算）。
  const live = useThesisLive()
  const generator = useThesisGenerator()
  // [论文助手定制] 文稿文件化：生成完成后把正文写入项目「正文/提纲.md」。
  const manuscript = useThesisManuscriptFile(sdk().directory)
  // [论文助手定制] 导出 Word：把生成的大纲转成 .docx 保存到项目「正文」目录。
  const { exportDocx } = useThesisDocxExport("提纲")
  // [论文助手定制] 导出 PDF：把生成的大纲渲染成 PDF 保存到项目「正文」目录。
  const { exportPdf } = useThesisPdfExport("提纲")
  const outline = () => state().steps.outline
  const input = () => outline().input

  const knowledge = useThesisKnowledge()

  const toggleDirection = (key: DirectionKey) => {
    const current = input().directions
    updateInput("outline", {
      directions: current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    })
  }

  const toggleFile = (path: string) => {
    const current = input().selected
    updateInput("outline", {
      selected: current.includes(path) ? current.filter((item) => item !== path) : [...current, path],
    })
  }

  const toggleNote = (id: string) => {
    const current = input().selectedKnowledgeIds
    updateInput("outline", {
      selectedKnowledgeIds: current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    })
  }

  // [论文助手定制] 读取已勾选材料的文本内容（资料文件 + 手写知识条目，限制总量避免提示词过长）。
  const readMaterials = async (): Promise<string> => {
    const selected = input().selected
    const selectedNotes = input().selectedKnowledgeIds
    if (selected.length === 0 && selectedNotes.length === 0) return ""
    const chunks: string[] = []
    let total = 0
    // 手写知识条目：直接取内容。
    for (const id of selectedNotes) {
      if (total > 20_000) break
      const item = knowledge.state().items.find((entry) => entry.id === id)
      if (!item) continue
      const text = item.content.slice(0, 8_000)
      chunks.push(`--- ${item.title}（知识条目） ---\n${text}`)
      total += text.length
    }
    // 资料目录文件：读取文本内容。
    for (const path of selected) {
      if (total > 20_000) break
      try {
        const res = await sdk().client.file.read({ directory: sdk().directory, path })
        if (res.error || res.data?.type !== "text") continue
        const text = res.data.content.slice(0, 8_000)
        chunks.push(`--- ${path.split("/").pop()} ---\n${text}`)
        total += text.length
      } catch {
        // 单个文件读取失败不阻塞整体
      }
    }
    return chunks.join("\n\n")
  }

  const buildPrompt = async () => {
    const values = input()
    const lines: string[] = []
    lines.push("请基于以下信息，为我生成一份「分章节综述大纲」。")
    lines.push("")
    lines.push("## 一、综述需求")
    lines.push(values.needs.trim())
    lines.push("")
    // [论文助手定制] 论文设定（类型 / 语言 / 图表 / 字数）作为独立小节打包给模型，
    // 让大纲结构、篇幅规划与图表章节安排都匹配这些设定。
    lines.push("## 二、论文设定")
    lines.push(`- 论文类型：${values.paperType}`)
    lines.push(`- 论文语言：${values.language}`)
    lines.push(`- 图表要求：${values.hasFigures}`)
    lines.push(`- 目标篇幅：约 ${values.targetWords} 字`)
    lines.push("")
    lines.push("## 三、方向侧重")
    const chosen = values.directions.map((key) => {
      const item = DIRECTIONS.find((direction) => direction.key === key)
      return item ? `${item.label}（${item.hint}）` : key
    })
    lines.push(chosen.length > 0 ? chosen.join("；") : "无特别侧重")
    if (values.aiSuggest) lines.push("- 请为每个章节给出 AI 建议（写作要点与提示）")
    if (values.optimize) lines.push("- 请在最后给出提纲优化提醒")
    lines.push("")
    lines.push("## 四、参考材料（知识库）")
    const materialsText = await readMaterials()
    lines.push(materialsText || "（未选择材料）")
    lines.push("")
    lines.push("## 五、输出要求")
    lines.push(
      `按「${values.language}」学术写作习惯输出综述大纲：每个章节包含标题、写作要点、相关论文线索与写作建议，结构清晰，可直接用于后续辅助写作。` +
        (values.hasFigures === "有图表" ? "请在合适的章节规划图表 / 表格，并标注图表用途。" : "") +
        promptToolRestriction(input().useTools) + "上文已包含全部所需材料，直接输出正文本身。",
    )
    return lines.join("\n")
  }

  const generate = async () => {
    if (!input().needs.trim()) {
      showToast({ variant: "error", icon: "circle-x", title: "请先填写综述需求" })
      return
    }
    if (generator.generating()) return
    setStepStatus("outline", "generating")
    try {
      const prompt = await buildPrompt()
      const { sessionID, text } = await generator.generate({
        prompt,
        // [论文助手定制] 把本步配置面板勾选的 Skill 传给生成器，注入提示词。
        skills: input().skills,
        // [论文助手定制] 把本步配置面板的工具开关传给生成器（true=允许工具调用）。
        useTools: input().useTools,
        sessionID: state().steps.outline.sessionID,
        // [论文助手定制] 边生成边显示：把当前已生成的文本实时写入 store.progress。
        // [论文助手定制] 方案 B：会话写进「提纲助手」自己的 StepState（每步独立会话）。
        onSessionCreated: (id) => setStepSessionID("outline", id),
        onProgress: (partial) => live.setStepProgress("outline", partial),
      })
      setStepSessionID("outline", sessionID)
      // [论文助手定制] 落盘：提纲正文写入 正文/提纲.md（文稿视图随后从文件读取）。
      await manuscript.save("outline", text)
      setStepResult("outline", text)
      // [论文助手定制] 完成时同步清掉 live progress（主 store 的 setStepResult 已清自身 progress）。
      live.clearStepProgress("outline")
      showToast({ variant: "success", icon: "circle-check", title: "提纲已生成" })
    } catch {
      setStepStatus("outline", outline().result ? "done" : "idle")
    }
  }

  return (
    <StepLayout
      form={
        <StepFormPanel
          title="提纲助手"
          subtitle="独立模块：把想法、草稿和论文材料整理成综述大纲。"
          footer={
            <Button type="button" variant="primary" icon="bullet-list" disabled={generator.generating()} onClick={() => void generate()}>
              {generator.generating() ? "生成中…" : "生成提纲"}
            </Button>
          }
        >
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">描述综述需求</div>
            <TextField
              multiline
              placeholder="输入选题想法、已有草稿、老师意见、论文摘要或文献摘录..."
              value={input().needs}
              onChange={(value) => updateInput("outline", { needs: value })}
            />
          </section>
          {/* [论文助手定制] 论文设定：类型 / 语言 / 图表 / 字数，两列下拉，改动即时写入 store 并参与生成。 */}
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">论文设定</div>
            <div class="grid grid-cols-2 gap-2">
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">论文类型</div>
                <select
                  class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
                  value={input().paperType}
                  onChange={(event) => updateInput("outline", { paperType: event.currentTarget.value })}
                >
                  <For each={PAPER_TYPES}>{(item) => <option value={item}>{item}</option>}</For>
                </select>
              </section>
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">论文语言</div>
                <select
                  class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
                  value={input().language}
                  onChange={(event) => updateInput("outline", { language: event.currentTarget.value })}
                >
                  <For each={LANGUAGES}>{(item) => <option value={item}>{item}</option>}</For>
                </select>
              </section>
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">图表</div>
                <select
                  class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
                  value={input().hasFigures}
                  onChange={(event) => updateInput("outline", { hasFigures: event.currentTarget.value })}
                >
                  <For each={HAS_FIGURES}>{(item) => <option value={item}>{item}</option>}</For>
                </select>
              </section>
              <section class="flex min-w-0 flex-col gap-1.5">
                <div class="text-11-regular text-v2-text-text-faint">大约字数</div>
                <select
                  class="h-9 w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular text-v2-text-text-base focus:outline-none"
                  value={input().targetWords}
                  onChange={(event) => updateInput("outline", { targetWords: event.currentTarget.value })}
                >
                  <For each={TARGET_WORDS}>{(item) => <option value={item}>{item}</option>}</For>
                </select>
              </section>
            </div>
          </section>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">方向</div>
            <div class="flex flex-col gap-1">
              <For each={DIRECTIONS}>
                {(item) => (
                  <Checkbox checked={input().directions.includes(item.key)} onChange={() => toggleDirection(item.key)}>
                    {item.label}
                  </Checkbox>
                )}
              </For>
            </div>
          </section>
          <section class="flex flex-col gap-1.5">
            <div class="text-12-medium text-v2-text-text-base">生成选项</div>
            <Checkbox checked={input().aiSuggest} onChange={(value) => updateInput("outline", { aiSuggest: value })}>
              AI 建议（每章写作要点与提示）
            </Checkbox>
            <Checkbox checked={input().optimize} onChange={(value) => updateInput("outline", { optimize: value })}>
              提纲优化提醒
            </Checkbox>
          </section>
          {/* [论文助手定制] Skill 多选：勾选的 Skill 在生成时注入提示词（见 thesis-generator）。 */}
          <ThesisSkillPicker step="outline" />
          <section class="flex flex-col gap-1.5">
            {/* [论文助手定制] 知识库面板：文件夹筛选 + 搜索 + 手写条目 + 资料文件，统一勾选参与生成 */}
            <ThesisKnowledgePanel
              selectedFiles={input().selected}
              selectedNotes={input().selectedKnowledgeIds}
              onToggleFile={toggleFile}
              onToggleNote={toggleNote}
            />
          </section>
        </StepFormPanel>
      }
      product={
        <StepProductPanel
          title="分章节综述大纲"
          status={outline().status}
          progressText={live.progress().outline}
          result={outline().result}
          onExportDocx={() => void exportDocx(outline().result ?? "")}
          onExportPdf={() => void exportPdf(outline().result ?? "")}
          emptyHint="填写左侧需求后点击「生成提纲」，大纲会显示在这里；辅助写作可选择引用或不引用它。"
          manuscript={{ directory: sdk().directory, step: "outline" }}
        />
      }
    />
  )
}
