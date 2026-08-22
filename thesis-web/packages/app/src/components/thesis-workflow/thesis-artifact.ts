export type ArtifactKind = "step" | "scratch"
export type StepKey = "outline" | "writing" | "formatting" | "review"

export type ThesisArtifact = {
  id: string
  title: string
  fileName: string
  kind: ArtifactKind
  step?: StepKey
  directory: string
  sessionID?: string
  createdAt: number
  updatedAt: number
}

export const STEP_ARTIFACT_TITLES: Record<StepKey, string> = {
  outline: "提纲",
  writing: "全文稿",
  formatting: "排版稿",
  review: "评审报告",
}

export const makeArtifactID = () => `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const createStepArtifact = (step: StepKey, directory: string, overrides: Partial<ThesisArtifact> = {}): ThesisArtifact => ({
  id: overrides.id ?? makeArtifactID(),
  title: overrides.title ?? STEP_ARTIFACT_TITLES[step],
  fileName: overrides.fileName ?? `${STEP_ARTIFACT_TITLES[step]}.md`,
  kind: "step",
  step,
  directory,
  sessionID: overrides.sessionID,
  createdAt: overrides.createdAt ?? Date.now(),
  updatedAt: overrides.updatedAt ?? Date.now(),
})

export const createScratchArtifact = (title: string, directory: string, overrides: Partial<ThesisArtifact> = {}): ThesisArtifact => ({
  id: overrides.id ?? makeArtifactID(),
  title: title.trim() || "新文档",
  fileName: overrides.fileName ?? `${title.trim() || "新文档"}.md`,
  kind: "scratch",
  step: undefined,
  directory,
  sessionID: overrides.sessionID,
  createdAt: overrides.createdAt ?? Date.now(),
  updatedAt: overrides.updatedAt ?? Date.now(),
})
