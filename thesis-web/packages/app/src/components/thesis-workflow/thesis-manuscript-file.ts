// [论文助手定制] 论文文稿「文件化」：生成/修改完成后把正文写入项目根目录的 .md 文件（文件空间可见），
// 文稿视图从文件读取渲染——文稿是真实文件产物（随论文工作区 git 管理、可下载、可被导出直接引用），
// 而不是从聊天回复里抠出来的文本。每个步骤对应一个固定文件名。
import { createQuery, useQueryClient } from "@tanstack/solid-query"
import { useSDK } from "@/context/sdk"
import { useThesisProject } from "./thesis-export"

export const MANUSCRIPT_FILENAMES = {
  outline: "提纲.md",
  writing: "全文稿.md",
  formatting: "排版稿.md",
  review: "评审报告.md",
} as const

export type ManuscriptStep = keyof typeof MANUSCRIPT_FILENAMES

export function useThesisManuscriptFile(directory: string) {
  const sdk = useSDK()
  const queryClient = useQueryClient()
  const resolveProject = useThesisProject()

  // [论文助手定制] 落盘：把某步骤的正文写入项目根目录 <step>.md（如 提纲.md），成功后让该项目的文稿 query 失效，
  // 文稿视图会重新读文件（实现「生成/修改完成后文稿=文件内容」）。
  const save = async (step: ManuscriptStep, content: string) => {
    if (!content?.trim()) return
    const proj = await resolveProject()
    if (!proj) return
    const res = await sdk().client.instance.thesisSaveManuscript({
      projectID: proj.id,
      step,
      content,
    })
    if (res.error) return
    void queryClient.invalidateQueries({ queryKey: ["thesis", "manuscript", directory] })
  }

  // [论文助手定制] 通用文件落盘：把任意相对路径的正文写入项目文件空间（如 docs/独立文档.md）。
  // 复用 thesisWriteFile（后端 fs.writeWithDirs 自动创建父目录，如 docs/），与板块文稿
  // thesisSaveManuscript 的区别：不限定固定 step 名，可写任意路径，用于「独立文档」载体。
  // 落盘成功后同样让该项目的文稿 query 失效，文件空间与画布下拉联动刷新。
  const saveFile = async (relPath: string, content: string) => {
    if (!content?.trim()) return
    const proj = await resolveProject()
    if (!proj) return
    const res = await sdk().client.instance.thesisWriteFile({
      projectID: proj.id,
      path: relPath,
      content,
    })
    if (res.error) return
    void queryClient.invalidateQueries({ queryKey: ["thesis", "manuscript", directory] })
  }

  // [论文助手定制] 读文件：返回项目根目录 <step>.md 的文本内容（文件不存在时为 undefined）。
  // 用函数式 createQuery（而非对象字面量），与项目内 createQuery(() => ({...})) 的既有用法保持一致。
  const read = (step: ManuscriptStep) =>
    createQuery(() => ({
      queryKey: ["thesis", "manuscript", directory, step],
      queryFn: async () => {
        // [论文助手定制] 文件空间合并后文稿保存在项目根目录（后端 thesisSaveManuscript 写根目录），
        // 这里直接按文件名读根目录文件，与落盘路径保持一致。
        const res = await sdk().client.file.read({ directory, path: MANUSCRIPT_FILENAMES[step] })
        if (res.error || res.data?.type !== "text") return undefined
        return res.data.content
      },
    }))

  return { save, saveFile, read, filename: (step: ManuscriptStep) => MANUSCRIPT_FILENAMES[step] }
}
