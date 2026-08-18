import { Agent } from "@/agent/agent"
import { Command } from "@/command"
import { Format } from "@/format"
import { LSP } from "@/lsp/lsp"
import { Project } from "@/project/project"
import { Vcs } from "@/project/vcs"
import { Skill } from "@/skill"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQuery,
  WorkspaceRoutingQueryFields,
} from "../middleware/workspace-routing"
import { described } from "./metadata"

const PathInfo = Schema.Struct({
  home: Schema.String,
  state: Schema.String,
  config: Schema.String,
  worktree: Schema.String,
  directory: Schema.String,
}).annotate({ identifier: "Path" })

export const VcsDiffQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  mode: Vcs.Mode,
  context: Schema.optional(Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
})

export class ApiVcsApplyError extends Schema.ErrorClass<ApiVcsApplyError>("VcsApplyError")(
  {
    name: Schema.Literal("VcsApplyError"),
    data: Schema.Struct({
      message: Schema.String,
      reason: Schema.Literals(["non-git", "not-clean"]),
    }),
  },
  { httpApiStatus: 400 },
) {}

const SkillInstallBody = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  content: Schema.String,
  prompt: Schema.optional(Schema.String),
})

const SkillInstallDirectoryBody = Schema.Struct({
  directory: Schema.String,
})

const SkillInstallResult = Schema.Struct({
  agent: Agent.Info,
  skill: Skill.Info,
})

// [论文助手定制] Skill 管理：卸载（删除全局 skills/<name> 目录与 agent/<name>.md）。
const SkillUninstallBody = Schema.Struct({
  name: Schema.String,
})
const SkillUninstallResult = Schema.Struct({
  name: Schema.String,
})

// [论文助手定制] Skill 管理：从 zip 安装（前端解压后传文件树，后端写入全局 skills/<name>）。
const SkillInstallZipFile = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
})
const SkillInstallZipBody = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  files: Schema.Array(SkillInstallZipFile),
})

const ThesisCreateBody = Schema.Struct({
  title: Schema.String,
  description: Schema.optional(Schema.String),
})

// [论文助手定制] 论文项目列表项：复用 Project.Info 的全部字段，另加 contentUpdatedAt——
// 该值由后端扫描「正文」「资料」目录里文件的最新修改时间得到，表示「论文内容最后编辑时间」，
// 而不是 opencode 项目自带的“最近打开时间”（后者会在每次打开项目时被刷新，导致“没编辑却显示刚刚”）。
const ThesisListEntry = Schema.Struct({
  ...Project.Info.fields,
  contentUpdatedAt: Schema.Number,
})

// [论文助手定制] 删除论文项目：只接收 projectID，后端负责校验工作区归属、删除磁盘目录与数据库记录。
export const ThesisDeleteBody = Schema.Struct({
  projectID: Schema.String,
})

const ThesisDeleteResult = Schema.Struct({
  projectID: Schema.String,
})

const ThesisUploadBody = Schema.Struct({
  projectID: Schema.String,
  filename: Schema.String,
  content: Schema.String,
})

const ThesisPdfTextBody = Schema.Struct({
  projectID: Schema.String,
  filename: Schema.String,
})

const ThesisPdfTextResult = Schema.Struct({
  filename: Schema.String,
  chars: Schema.Number,
})

// [论文助手定制] 论文导出 Word：接收 Markdown 文稿文本 + 排版参数（Step 3 面板），
// 由后端 docx 引擎排版成可直接提交的 .docx 写入项目「正文」目录。
const ThesisDocxCoverSchema = Schema.Struct({
  title: Schema.optional(Schema.String),
  author: Schema.optional(Schema.String),
  affiliation: Schema.optional(Schema.String),
  date: Schema.optional(Schema.String),
})

const ThesisDocxOptionsSchema = Schema.Struct({
  paperType: Schema.optional(Schema.String),
  fontFamily: Schema.optional(Schema.String),
  fontSize: Schema.optional(Schema.Number),
  lineSpacing: Schema.optional(Schema.Number),
  pageMargin: Schema.optional(Schema.Literals(["standard", "narrow", "thesis"])),
  titleNumbering: Schema.optional(Schema.Boolean),
  cover: Schema.optional(ThesisDocxCoverSchema),
})

export const ThesisExportDocxBody = Schema.Struct({
  projectID: Schema.String,
  filename: Schema.String,
  content: Schema.String,
  options: Schema.optional(ThesisDocxOptionsSchema),
})

const ThesisExportDocxResult = Schema.Struct({
  filename: Schema.String,
  path: Schema.String,
})

// [论文助手定制] 论文文稿落盘：把某步骤的正文写入项目「正文」目录
// （outline→提纲.md，writing→全文稿.md，formatting→排版稿.md，review→评审报告.md）。
// 让“文稿”成为真实的文件产物（随论文工作区 git 管理、可下载、可被导出直接引用），
// 而不是从聊天回复里抠出来的文本。
export const ThesisSaveManuscriptBody = Schema.Struct({
  projectID: Schema.String,
  step: Schema.Literals(["outline", "writing", "formatting", "review"]),
  content: Schema.String,
})

const ThesisSaveManuscriptResult = Schema.Struct({
  filename: Schema.String,
  path: Schema.String,
})

// [论文助手定制] 论文导出 PDF：接收排版好的 HTML（前端已渲染 Markdown），转成 .pdf 写入项目「正文」目录。
const ThesisExportPdfBody = Schema.Struct({
  projectID: Schema.String,
  filename: Schema.String,
  html: Schema.String,
})

const ThesisExportPdfResult = Schema.Struct({
  filename: Schema.String,
  path: Schema.String,
})

export class ApiSkillInstallError extends Schema.ErrorClass<ApiSkillInstallError>("SkillInstallError")(
  {
    name: Schema.Literal("SkillInstallError"),
    data: Schema.Struct({ message: Schema.String }),
  },
  { httpApiStatus: 400 },
) {}

export class ApiThesisError extends Schema.ErrorClass<ApiThesisError>("ThesisError")(
  {
    name: Schema.Literal("ThesisError"),
    data: Schema.Struct({ message: Schema.String }),
  },
  { httpApiStatus: 400 },
) {}

export const InstancePaths = {
  dispose: "/instance/dispose",
  path: "/path",
  vcs: "/vcs",
  vcsStatus: "/vcs/status",
  vcsDiff: "/vcs/diff",
  vcsDiffRaw: "/vcs/diff/raw",
  vcsApply: "/vcs/apply",
  command: "/command",
  agent: "/agent",
  skill: "/skill",
  skillInstall: "/skill/install",
  skillInstallDirectory: "/skill/install-directory",
  skillUninstall: "/skill/uninstall",
  skillInstallZip: "/skill/install-zip",
  thesisCreate: "/thesis/create",
  thesisUpload: "/thesis/upload",
  thesisPdfText: "/thesis/pdf-text",
  thesisSaveManuscript: "/thesis/save-manuscript",
  thesisList: "/thesis/list",
  thesisDelete: "/thesis/delete",
  thesisExportDocx: "/thesis/export-docx",
  thesisExportPdf: "/thesis/export-pdf",
  lsp: "/lsp",
  formatter: "/formatter",
} as const

export const InstanceApi = HttpApi.make("instance")
  .add(
    HttpApiGroup.make("instance")
      .add(
        HttpApiEndpoint.post("dispose", InstancePaths.dispose, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Instance disposed"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "instance.dispose",
            summary: "Dispose instance",
            description: "Clean up and dispose the current OpenCode instance, releasing all resources.",
          }),
        ),
        HttpApiEndpoint.get("path", InstancePaths.path, {
          query: WorkspaceRoutingQuery,
          success: PathInfo,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "path.get",
            summary: "Get paths",
            description:
              "Retrieve the current working directory and related path information for the OpenCode instance.",
          }),
        ),
        HttpApiEndpoint.get("vcs", InstancePaths.vcs, {
          query: WorkspaceRoutingQuery,
          success: described(Vcs.Info, "VCS info"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "vcs.get",
            summary: "Get VCS info",
            description:
              "Retrieve version control system (VCS) information for the current project, such as git branch.",
          }),
        ),
        HttpApiEndpoint.get("vcsStatus", InstancePaths.vcsStatus, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Vcs.FileStatus), "VCS status"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "vcs.status",
            summary: "Get VCS status",
            description: "Retrieve changed files in the current working tree without patches.",
          }),
        ),
        HttpApiEndpoint.get("vcsDiff", InstancePaths.vcsDiff, {
          query: VcsDiffQuery,
          success: described(Schema.Array(Vcs.FileDiff), "VCS diff"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "vcs.diff",
            summary: "Get VCS diff",
            description: "Retrieve the current git diff for the working tree or against the default branch.",
          }),
        ),
        HttpApiEndpoint.get("vcsDiffRaw", InstancePaths.vcsDiffRaw, {
          query: WorkspaceRoutingQuery,
          success: described(
            Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/x-diff; charset=utf-8" })),
            "Raw VCS diff",
          ),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "vcs.diff.raw",
            summary: "Get raw VCS diff",
            description: "Retrieve a raw patch for current uncommitted changes.",
          }),
        ),
        HttpApiEndpoint.post("vcsApply", InstancePaths.vcsApply, {
          query: WorkspaceRoutingQuery,
          payload: Vcs.ApplyInput,
          success: described(Vcs.ApplyResult, "VCS patch applied"),
          error: ApiVcsApplyError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "vcs.apply",
            summary: "Apply VCS patch",
            description: "Apply a raw patch to the current working tree.",
          }),
        ),
        HttpApiEndpoint.get("command", InstancePaths.command, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Command.Info), "List of commands"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "command.list",
            summary: "List commands",
            description: "Get a list of all available commands in the OpenCode system.",
          }),
        ),
        HttpApiEndpoint.get("agent", InstancePaths.agent, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Agent.Info), "List of agents"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "app.agents",
            summary: "List agents",
            description: "Get a list of all available AI agents in the OpenCode system.",
          }),
        ),
        HttpApiEndpoint.get("skill", InstancePaths.skill, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Skill.Info), "List of skills"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "app.skills",
            summary: "List skills",
            description: "Get a list of all available skills in the OpenCode system.",
          }),
        ),
        HttpApiEndpoint.post("skillInstall", InstancePaths.skillInstall, {
          query: WorkspaceRoutingQuery,
          payload: SkillInstallBody,
          success: described(SkillInstallResult, "Installed skill and agent"),
          error: ApiSkillInstallError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "instance.skillInstall",
            summary: "Install a skill and create its agent",
            description:
              "Writes the skill and agent config into the project .opencode directory, then reloads agents and skills.",
          }),
        ),
        HttpApiEndpoint.post("skillInstallDirectory", InstancePaths.skillInstallDirectory, {
          payload: SkillInstallDirectoryBody,
          success: described(SkillInstallResult, "Installed skill and agent from a local folder"),
          error: ApiSkillInstallError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "instance.skillInstallDirectory",
            summary: "Install a skill from a local folder",
            description:
              "Copies the whole skill folder (SKILL.md, manifest.yaml, references, static) into the global skills directory, then creates its agent.",
          }),
        ),
        // [论文助手定制] Skill 管理：卸载（删除全局 skill 目录与同名 agent 配置）。
        HttpApiEndpoint.post("skillUninstall", InstancePaths.skillUninstall, {
          query: WorkspaceRoutingQuery,
          payload: SkillUninstallBody,
          success: described(SkillUninstallResult, "Uninstalled skill and agent"),
          error: ApiSkillInstallError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "instance.skillUninstall",
            summary: "Uninstall a skill and its agent",
            description: "Deletes the global skill directory and the agent config, then reloads agents and skills.",
          }),
        ),
        // [论文助手定制] Skill 管理：zip 安装（前端解压 zip 后以文件树形式上传，后端写盘并创建 agent）。
        HttpApiEndpoint.post("skillInstallZip", InstancePaths.skillInstallZip, {
          query: WorkspaceRoutingQuery,
          payload: SkillInstallZipBody,
          success: described(SkillInstallResult, "Installed skill and agent from a zip archive"),
          error: ApiSkillInstallError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "instance.skillInstallZip",
            summary: "Install a skill and its agent from an unzipped file tree",
            description: "Writes the given file tree under the global skills directory, then creates its agent.",
          }),
        ),
        HttpApiEndpoint.post("thesisCreate", InstancePaths.thesisCreate, {
          payload: ThesisCreateBody,
          success: described(Project.Info, "Created thesis project"),
          error: ApiThesisError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "instance.thesisCreate",
            summary: "Create a thesis project",
            description:
              "Creates a named thesis workspace directory under the user's thesis-workspace folder and registers it as a project.",
          }),
        ),
        HttpApiEndpoint.post("thesisUpload", InstancePaths.thesisUpload, {
          payload: ThesisUploadBody,
          success: described(Schema.Array(Schema.String), "Uploaded file names"),
          error: ApiThesisError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "instance.thesisUpload",
            summary: "Upload a thesis reference file",
            description:
              "Writes an uploaded reference file (base64 content) into the thesis workspace 资料 directory.",
          }),
        ),
        HttpApiEndpoint.post("thesisPdfText", InstancePaths.thesisPdfText, {
          payload: ThesisPdfTextBody,
          success: described(ThesisPdfTextResult, "Extracted text file name and character count"),
          error: ApiThesisError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "instance.thesisPdfText",
            summary: "Extract text from a thesis PDF reference",
            description:
              "Extracts text from a PDF in the thesis 资料 directory and writes it to a sibling .txt file so agents can read it.",
          }),
        ),
        HttpApiEndpoint.post("thesisSaveManuscript", InstancePaths.thesisSaveManuscript, {
          payload: ThesisSaveManuscriptBody,
          success: described(ThesisSaveManuscriptResult, "Saved manuscript file name and path"),
          error: ApiThesisError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "instance.thesisSaveManuscript",
            summary: "Save thesis manuscript as a Markdown file",
            description:
              "Writes the manuscript body of a thesis step into the thesis workspace 正文 directory as a .md file (提纲/全文稿/排版稿/评审报告).",
          }),
        ),
        // [论文助手定制] 论文项目列表：返回论文工作区下的项目及其「内容最后编辑时间」（正文/资料文件 mtime）。
        HttpApiEndpoint.get("thesisList", InstancePaths.thesisList, {
          success: described(Schema.Array(ThesisListEntry), "Thesis projects with content updated time"),
          error: ApiThesisError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "instance.thesisList",
            summary: "List thesis projects",
            description:
              "Lists projects under the thesis workspace, each with contentUpdatedAt computed from the latest file mtime in the 正文 and 资料 directories.",
          }),
        ),
        // [论文助手定制] 删除论文项目：删除工作区目录 + 数据库记录（会话等级联清理）。
        HttpApiEndpoint.post("thesisDelete", InstancePaths.thesisDelete, {
          payload: ThesisDeleteBody,
          success: described(ThesisDeleteResult, "Deleted thesis project id"),
          error: ApiThesisError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "instance.thesisDelete",
            summary: "Delete a thesis project",
            description:
              "Deletes the thesis workspace directory and its project/session records. Only projects under the thesis workspace can be deleted.",
          }),
        ),
        HttpApiEndpoint.post("thesisExportDocx", InstancePaths.thesisExportDocx, {
          payload: ThesisExportDocxBody,
          success: described(ThesisExportDocxResult, "Exported docx file name and path"),
          error: ApiThesisError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "instance.thesisExportDocx",
            summary: "Export thesis manuscript as a Word document",
            description:
              "Converts Markdown manuscript text into a .docx file and writes it into the thesis workspace 正文 directory.",
          }),
        ),
        HttpApiEndpoint.post("thesisExportPdf", InstancePaths.thesisExportPdf, {
          payload: ThesisExportPdfBody,
          success: described(ThesisExportPdfResult, "Exported pdf file name and path"),
          error: ApiThesisError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "instance.thesisExportPdf",
            summary: "Export thesis manuscript as a PDF",
            description:
              "Prints a rendered HTML manuscript into a .pdf file and writes it into the thesis workspace 正文 directory.",
          }),
        ),
        HttpApiEndpoint.get("lsp", InstancePaths.lsp, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(LSP.Status), "LSP server status"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "lsp.status",
            summary: "Get LSP status",
            description: "Get LSP server status",
          }),
        ),
        HttpApiEndpoint.get("formatter", InstancePaths.formatter, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Format.Status), "Formatter status"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "formatter.status",
            summary: "Get formatter status",
            description: "Get formatter status",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "instance",
          description: "Experimental HttpApi instance read routes.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "opencode experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )
