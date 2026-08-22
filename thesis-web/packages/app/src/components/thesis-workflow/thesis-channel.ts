export type ChannelTarget = "artifact" | "selection" | "chat"

export type TurnRegistration = {
  target: ChannelTarget
  artifactID?: string
  selection?: string
  createdAt: number
}

export const markTurn = (
  registry: Record<string, TurnRegistration>,
  sessionID: string,
  entry: Omit<TurnRegistration, "createdAt">,
): Record<string, TurnRegistration> => ({
  ...registry,
  [sessionID]: { ...entry, createdAt: Date.now() },
})

export const consumeTurn = (registry: Record<string, TurnRegistration>, sessionID: string): TurnRegistration | undefined => {
  const turn = registry[sessionID]
  if (!turn) return undefined
  const next = { ...registry }
  delete next[sessionID]
  return turn
}

export const getTurn = (registry: Record<string, TurnRegistration>, sessionID: string): TurnRegistration | undefined =>
  registry[sessionID]
