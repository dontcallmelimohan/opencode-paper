import { Markdown } from "@opencode-ai/session-ui/markdown"
import { ScrollView } from "@opencode-ai/ui/scroll-view"

export function MarkdownFilePreview(props: {
  contents: () => string
  cacheKey: () => string | undefined
}) {
  return (
    <ScrollView class="h-full">
      <div class="mx-auto w-full max-w-3xl px-6 py-6">
        <Markdown
          text={props.contents()}
          cacheKey={props.cacheKey()}
          class="thesis-markdown-preview"
          style={{ "font-size": "15px", "line-height": "1.8" }}
        />
      </div>
    </ScrollView>
  )
}
