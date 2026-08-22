// [论文助手定制] Milkdown WYSIWYG 编辑器封装：基于 @milkdown/kit（ProseMirror 底层）手动集成，
// 无框架适配器，直接挂载到 DOM。承担「渲染即编辑」职责——Markdown 文件以富文本形式渲染且可编辑，
// 编辑结果实时序列化回 Markdown（listener 插件 markdownUpdated），保存链路（manuscript.save）保持不变。
//
// 对外能力：
// - onMdChange：内容变化时回传最新 Markdown
// - onSelectionChange：选区变化（AI 段落建议操作条的数据源，坐标为 ProseMirror doc position）
// - onReplaced：AI 原地替换完成后回调（外层用它弹「撤销」浮条）
// - apiRef：暴露 replace/undo/redo/canUndo/canRedo，供外层操作条调用
//
// AI 原地替换：用 parser 把返回的 Markdown 解析为节点并 replaceWith 选区；撤销/重做走 prosemirror-history
// （快捷键 Cmd/Ctrl+Z、Cmd/Ctrl+Shift+Z 自带）；「被修改文本段淡黄高亮」用自定义 ProseMirror 插件的
// DecorationSet 实现（纯展示层，不进文档、不污染 Markdown），选区移出高亮区间时自动清除。
import { onCleanup, onMount } from "solid-js"
import { Editor, defaultValueCtx, editorStateOptionsCtx, editorViewCtx, parserCtx, rootCtx } from "@milkdown/kit/core"
import { commonmark } from "@milkdown/kit/preset/commonmark"
import { gfm } from "@milkdown/kit/preset/gfm"
import { history } from "@milkdown/kit/plugin/history"
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener"
import { trailing } from "@milkdown/kit/plugin/trailing"
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state"
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view"
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model"
import type { EditorView } from "@milkdown/kit/prose/view"
import { redo as prosemirrorRedo, undo as prosemirrorUndo, undoDepth, redoDepth } from "@milkdown/kit/prose/history"

export interface ThesisEditorSelection {
  from: number
  to: number
  text: string
  /** 选区视觉位置（视口坐标），由 ProseMirror coordsAtPos 计算，供外层定位悬浮工具栏 */
  left: number
  top: number
  bottom: number
  right: number
}
export interface ThesisEditorApi {
  // [论文助手定制] replace 返回是否真的替换成功（视图未就绪 / 选区已丢失 / 捕获选区校验失败时
  // 返回 false，外层据此回退为文本级替换，避免“会话有输出、画布没更新”）。
  // range 为点击「改写」那一刻捕获的选区（from/to/text）。必须传它而不是用 replace 执行时的
  // 实时选区：AI 回复等待期间选区可能漂移成全选/整篇（如误触 Cmd+A、焦点/选区被干扰），
  // 若用实时选区会把整篇文档替换成改写片段（历史 bug）。text 用于校验等待期间文档未被改动。
  replace: (markdown: string, range?: { from: number; to: number; text: string }) => boolean
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}
export interface ThesisEditorProps {
  initialMd: string
  onMdChange?: (markdown: string) => void
  onSelectionChange?: (selection: ThesisEditorSelection | null) => void
  onReplaced?: (selection: ThesisEditorSelection) => void
  onReady?: () => void
  apiRef?: { current: ThesisEditorApi | undefined }
}

// [论文助手定制] AI 修改段高亮：淡黄泛光的 inline decoration，存于插件状态（不进文档）。
// 替换内容可能包含多个段落/列表项，而 inline decoration 不能跨块级节点，
// 所以先把 [from, to) 按文本块拆成多个区间，再逐块生成装饰，保证整段新内容都泛光。
const aiHighlightKey = new PluginKey("thesis-ai-highlight")
const collectTextRanges = (doc: ProseMirrorNode, from: number, to: number) => {
  const ranges: { from: number; to: number }[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) {
      // 文本块内真正的文字区间是 [pos+1, pos+1+content.size)（跳过块首尾各 1 个位置）。
      const start = Math.max(from, pos + 1)
      const end = Math.min(to, pos + 1 + node.content.size)
      if (end > start) ranges.push({ from: start, to: end })
    }
    return true
  })
  return ranges
}
const aiHighlightPlugin = new Plugin({
  key: aiHighlightKey,
  state: {
    init: () => DecorationSet.empty,
    apply: (tr, set) => {
      const meta = tr.getMeta(aiHighlightKey)
      if (meta === "clear") return DecorationSet.empty
      if (meta && typeof meta.from === "number" && meta.to > meta.from) {
        const ranges = collectTextRanges(tr.doc, meta.from, meta.to)
        return DecorationSet.create(
          tr.doc,
          ranges.map((range) => Decoration.inline(range.from, range.to, { class: "thesis-ai-glow" })),
        )
      }
      return set.map(tr.mapping, tr.doc)
    },
  },
  props: {
    decorations: (state) => aiHighlightKey.getState(state),
  },
})

export function ThesisEditor(props: ThesisEditorProps) {
  let rootRef: HTMLDivElement | undefined
  let editor: Editor | undefined
  // AI 替换后短时间内不清除高亮（替换 dispatch 会触发 selectionUpdated，避免边界误清）。
  let suppressClearUntil = 0

  const getView = (): EditorView | undefined =>
    editor?.action((ctx) => ctx.get(editorViewCtx))

  const setHighlightRange = (view: EditorView, from: number, to: number) => {
    view.dispatch(view.state.tr.setMeta(aiHighlightKey, { from, to }))
  }
  const clearHighlight = (view: EditorView) => {
    view.dispatch(view.state.tr.setMeta(aiHighlightKey, "clear"))
  }

  // [论文助手定制] 选区上报：统一由 ProseMirror 当前状态计算，非空文本选区附带视口坐标
  // （外层用它定位悬浮工具栏）。纯鼠标拖选时 Milkdown listener 的 selectionUpdated 可能不触发，
  // 因此另加 mouseup/keyup DOM 事件兜底，二者共用本函数（同值 signal 不触发重渲染，幂等安全）。
  const reportSelection = (view: EditorView) => {
    const sel = view.state.selection
    const from = sel.from
    const to = sel.to
    if (!sel.empty && to > from) {
      const text = view.state.doc.textBetween(from, to, "\n").trim()
      if (text) {
        const anchor = view.coordsAtPos(to)
        const head = view.coordsAtPos(from)
        props.onSelectionChange?.({
          from,
          to,
          text,
          left: Math.min(anchor.left, head.left),
          right: Math.max(anchor.right, head.right),
          top: Math.min(anchor.top, head.top),
          bottom: Math.max(anchor.bottom, head.bottom),
        })
        return
      }
    }
    props.onSelectionChange?.(null)
  }

  // [论文助手定制] AI 原地替换：parser 解析返回的 Markdown → replaceWith 选区 → 光标移到替换末尾，
  // 设置淡黄泛光高亮（覆盖整段替换内容，见 collectTextRanges），并通知外层弹「撤销」浮条。
  // 选区优先取调用方传入的捕获区间（点击改写那一刻的 from/to/text）：
  // 实时选区在等待回复期间可能漂移，传入区间保证只替换用户当时选中的那一段。
  const doReplace = (markdown: string, range?: { from: number; to: number; text: string }): boolean => {
    const view = getView()
    if (!view || !editor) return false
    const { from, to } = range ?? view.state.selection
    if (to <= from) return false
    // 校验捕获区间在当前文档里仍然指向同一段文本：等待期间用户手动改动过文档（少见）时
    // 位置可能错位，此时放弃编辑器替换，外层回退为按文本匹配的替换。
    if (range && view.state.doc.textBetween(from, to, "\n").trim() !== range.text.trim()) return false
    const node = editor.action((ctx) => ctx.get(parserCtx)(markdown))
    const content = node.type.name === "doc" ? node.content : node
    const tr = view.state.tr.replaceWith(from, to, content)
    // Fragment 有 size，Node 有 nodeSize：用 in 窄化取内容大小用于定位光标。
    const contentSize = "size" in content ? content.size : content.nodeSize
    const endPos = Math.min(from + contentSize, tr.doc.content.size)
    tr.setSelection(TextSelection.near(tr.doc.resolve(endPos)))
    // [论文助手定制] 先设「抑制清除高亮」再 dispatch：替换/高亮两个事务触发的 selectionUpdated
    // 会立刻以「光标停在替换末尾、位于装饰区间之外」为由清掉刚挂上的泛光（历史 bug：
    // 之前把抑制设在 dispatch 之后，泛光一出现就被清掉，用户从来看不到）。
    suppressClearUntil = Date.now() + 800
    view.dispatch(tr)
    // 高亮覆盖替换后的整段新内容：替换区间 [from, endPos)（endPos 即新内容末尾），
    // 由插件的 collectTextRanges 按文本块拆分后再挂 inline 装饰。
    if (endPos > from) setHighlightRange(view, from, endPos)
    // 替换后选区已变化，坐标在 dispatch 前用原选区捕获，仅用于外层撤销浮条展示。
    const rect = view.coordsAtPos(from)
    props.onReplaced?.({
      from,
      to,
      text: markdown,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    })
    return true
  }

  const api: ThesisEditorApi = {
    replace: (markdown, range) => doReplace(markdown, range),
    undo: () => {
      const view = getView()
      if (view) {
        prosemirrorUndo(view.state, view.dispatch)
        // [论文助手定制] 撤销后清掉泛光高亮：恢复的原文不该再显示「新生成」标记。
        clearHighlight(view)
      }
    },
    redo: () => {
      const view = getView()
      if (view) {
        prosemirrorRedo(view.state, view.dispatch)
        // [论文助手定制] 重做后同样清掉泛光（撤销/重做都不携带插件装饰状态）。
        clearHighlight(view)
      }
    },
    canUndo: () => {
      const view = getView()
      return view ? undoDepth(view.state) > 0 : false
    },
    canRedo: () => {
      const view = getView()
      return view ? redoDepth(view.state) > 0 : false
    },
  }

  // DOM 事件兜底：纯鼠标拖选 / 键盘移动光标时，保证选区变化一定上报
  // （Milkdown selectionUpdated 依赖事务，可能漏）。定义在顶层供 onMount/onCleanup 共用。
  // 注意：ProseMirror 把 DOM 选区同步到 state 是异步的（SelectionObserver 在 rAF 中 dispatch），
  // 事件触发时立即读 view.state.selection 会拿到上一次的空选区，故统一延迟一帧再读取上报。
  const onDomSelection = () => {
    requestAnimationFrame(() => {
      const view = getView()
      if (view && (view as EditorView).state) reportSelection(view)
    })
  }
  // document 级 selectionchange 兜底：双击选词、框选等 mouseup 事件不可靠的场景。
  // 仅当 DOM 选区落在编辑器内才上报，避免点击外部（侧栏等）时误清工具栏。
  const onDocSelection = () => {
    if (!rootRef) return
    const domSel = window.getSelection()
    if (domSel && domSel.anchorNode && !rootRef.contains(domSel.anchorNode)) return
    onDomSelection()
  }

  onMount(() => {
    if (!rootRef) return
    editor = new Editor()
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(trailing)
      .use(listener)
      .config((ctx) => {
        ctx.set(rootCtx, rootRef!)
        ctx.set(defaultValueCtx, props.initialMd)
        // [论文助手定制] 挂载 AI 修改段泛光插件：Milkdown 的 .use() 只接收 MilkdownPlugin，
        // 原生 ProseMirror Plugin 要通过 editorStateOptionsCtx 追加进 EditorState.create 的 plugins。
        // 此前这里漏挂了 aiHighlightPlugin，导致替换后的淡黄高亮装饰从未生效（getState 恒为空）。
        ctx.update(editorStateOptionsCtx, (prev) => (options) =>
          prev({ ...options, plugins: [...(options.plugins ?? []), aiHighlightPlugin] }),
        )
        ctx.get(listenerCtx)
          .markdownUpdated((_ctx, markdown) => props.onMdChange?.(markdown))
          .selectionUpdated((ctx) => {
            const view = ctx.get(editorViewCtx)
            if (!view || !(view as EditorView).state) return
            reportSelection(view)
            // 高亮清除：AI 替换后短暂抑制；用户选中/点击其它文字（离开高亮区间）时清除。
            if (Date.now() < suppressClearUntil) return
            const sel = view.state.selection
            const decorations = aiHighlightKey.getState(view.state) as DecorationSet | undefined
            // [论文助手定制] 只在「确有高亮存在」时才可能清除：装饰集为空时若也 dispatch clear，
            // 会再次触发 selectionUpdated → 再次 clear → 无限递归（Maximum call stack size exceeded）。
            if (decorations) {
              const hasAny = decorations.find(0, view.state.doc.content.size).length > 0
              if (hasAny && decorations.find(sel.from, sel.to).length === 0) {
                clearHighlight(view)
              }
            }
          })
      })
    rootRef.addEventListener("mouseup", onDomSelection)
    rootRef.addEventListener("keyup", onDomSelection)
    document.addEventListener("selectionchange", onDocSelection)
    void editor.create().then(() => {
      if (props.apiRef) props.apiRef.current = api
    })
  })
  onCleanup(() => {
    if (props.apiRef) props.apiRef.current = undefined
    rootRef?.removeEventListener("mouseup", onDomSelection)
    rootRef?.removeEventListener("keyup", onDomSelection)
    document.removeEventListener("selectionchange", onDocSelection)
    void editor?.destroy()
    editor = undefined
  })

  return <div ref={(el) => (rootRef = el)} class="milkdown-editor thesis-editor-root" />
}
