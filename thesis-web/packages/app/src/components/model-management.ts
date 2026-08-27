import { popularProviders } from "@/hooks/popular-providers"

export type ModelVisibilityKey = {
  providerID: string
  modelID: string
}

export type ModelProviderRef = {
  id: string
  name: string
}

export type ModelVisibilityItem = {
  id: string
  provider: ModelProviderRef
}

export type ModelGroupLike<T extends ModelVisibilityItem = ModelVisibilityItem> = {
  category: string
  items: readonly T[]
}

export function sortModelGroupsByProvider<T extends ModelVisibilityItem>(a: ModelGroupLike<T>, b: ModelGroupLike<T>) {
  const aIndex = popularProviders.indexOf(a.category)
  const bIndex = popularProviders.indexOf(b.category)
  const aPopular = aIndex >= 0
  const bPopular = bIndex >= 0

  if (aPopular && !bPopular) return -1
  if (!aPopular && bPopular) return 1
  if (aPopular && bPopular) return aIndex - bIndex

  return a.items[0]?.provider.name.localeCompare(b.items[0]?.provider.name) ?? 0
}

export function getProviderVisibilityState<T extends ModelVisibilityItem>(
  items: readonly T[],
  isVisible: (item: T) => boolean,
) {
  const visibleCount = items.reduce((count, item) => count + (isVisible(item) ? 1 : 0), 0)
  const total = items.length

  return {
    total,
    visibleCount,
    allVisible: total > 0 && visibleCount === total,
    noneVisible: visibleCount === 0,
    indeterminate: visibleCount > 0 && visibleCount < total,
  }
}

export function setProviderVisibility<T extends ModelVisibilityItem>(
  items: readonly T[],
  setVisibility: (key: ModelVisibilityKey, visible: boolean) => void,
  visible: boolean,
) {
  for (const item of items) {
    setVisibility({ modelID: item.id, providerID: item.provider.id }, visible)
  }
}
