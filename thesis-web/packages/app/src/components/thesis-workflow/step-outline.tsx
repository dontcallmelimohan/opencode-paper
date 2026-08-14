// [论文助手定制] Step 1 提纲助手（论文工作台）：
// 填写综述需求、方向侧重、勾选知识库材料 → 一键“生成提纲” → 产物（分章节综述大纲）以 Markdown 展示。
// 产物存在 workflow state 的 outline.result，下一步“辅助写作”会引用它。
import { Button } from "@opencode-ai/ui/button"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { Icon } from "@opencode-ai/ui/icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { For, Show } from "solid-js"
import { useSDK } from "@/context/sdk"
import { showToast } from "@/utils/toast"
import { useThesisGenerator } from "./thesis-generator"
import { useThesisKnowledge } from "./thesis-knowledge-store"
import { ThesisKnowledgePanel } from "./thesis-knowledge-panel"
import { useThesisWorkflow } from "./thesis-workflow-store"
import { StepFormPanel, StepLayout, StepProductPanel } from "./thesis-workflow-ui"

// [论文助手定制] 方向侧重选项（写入提示词）。
const DIRECTIONS = [
  { key: "review", label: "现状梳理", hint: "梳理该方向的研究现状与进展" },
  { key: "depth", label: "深度", hint: "对关键问题做深入分析" },
  { key: "standard", label: "标准", hint: "按学术规范组织章节" },
  { key: "clue", label: "论文线索", hint: "标注各章节相关的论文线索" },
] as const

type DirectionKey = (typeof DIRECTIONS)[number]["key"]

export function StepOutline() {
  const sdk = useSDK()
  const { state, updateInput, setStepStatus, setStepProgress, setStepResult, setSessionID, setActiveStep } =
    useThesisWorkflow()
  const generator = useThesisGenerator()
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
    lines.push("## 二、方向侧重")
    const chosen = values.directions.map((key) => {
      const item = DIRECTIONS.find((direction) => direction.key === key)
      return item ? `${item.label}（${item.hint}）` : key
    })
    lines.push(chosen.length > 0 ? chosen.join("；") : "无特别侧重")
    if (values.aiSuggest) lines.push("- 请为每个章节给出 AI 建议（写作要点与提示）")
    if (values.optimize) lines.push("- 请在最后给出提纲优化提醒")
    lines.push("")
    lines.push("## 三、参考材料（知识库）")
    const materialsText = await readMaterials()
    lines.push(materialsText || "（未选择材料）")
    lines.push("")
    lines.push("## 四、输出要求")
    lines.push(
      "按章节输出综述大纲：每个章节包含标题、写作要点、相关论文线索与写作建议，结构清晰，可直接用于后续辅助写作。",
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
        sessionID: state().sessionID,
        // [论文助手定制] 边生成边显示：把当前已生成的文本实时写入 store.progress。
        // [论文助手定制] 会话一创建立即启用「会话」切换（见 thesis-generator.ts）。
        onSessionCreated: setSessionID,
        onProgress: (partial) => setStepProgress("outline", partial),
      })
      setSessionID(sessionID)
      setStepResult("outline", text)
      showToast({ variant: "success", icon: "circle-check", title: "提纲已生成，可进入辅助写作" })
    } catch {
      setStepStatus("outline", outline().result ? "done" : "idle")
    }
  }

  return (
    <StepLayout
      form={
        <StepFormPanel
          stepLabel="Step 1"
          title="提纲助手"
          subtitle="把想法、草稿和论文材料整理成可写作的综述大纲。"
          footer={
            // [论文助手定制] 「进入辅助写作」与 Step 2/3 的下一步按钮放同一位置：表单面板底部、生成按钮下方。
            <div class="flex flex-col gap-2">
              <Button type="button" variant="primary" icon="bullet-list" disabled={generator.generating()} onClick={() => void generate()}>
                {generator.generating() ? "生成中…" : "生成提纲"}
              </Button>
              <Show when={outline().status === "done"}>
                <Button type="button" variant="secondary" icon="arrow-right" onClick={() => setActiveStep("writing")}>
                  进入辅助写作
                </Button>
              </Show>
            </div>
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
          progressText={outline().progress}
          result={outline().result}
          emptyHint="填写左侧需求后点击「生成提纲」，大纲会显示在这里，并用于下一步辅助写作。"
        />
      }
    />
  )
}
