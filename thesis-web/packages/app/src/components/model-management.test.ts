import { describe, expect, test } from "bun:test"
import { getProviderVisibilityState, sortModelGroupsByProvider } from "./model-management"

describe("model management helpers", () => {
  test("tracks mixed provider visibility", () => {
    const items = [
      { id: "a", provider: { id: "openai", name: "OpenAI" } },
      { id: "b", provider: { id: "openai", name: "OpenAI" } },
      { id: "c", provider: { id: "openai", name: "OpenAI" } },
    ]
    const state = getProviderVisibilityState(items, (item) => item.id !== "b")

    expect(state.total).toBe(3)
    expect(state.visibleCount).toBe(2)
    expect(state.allVisible).toBe(false)
    expect(state.noneVisible).toBe(false)
    expect(state.indeterminate).toBe(true)
  })

  test("sorts popular providers before alphabetical fallbacks", () => {
    expect(
      sortModelGroupsByProvider(
        { category: "anthropic", items: [{ id: "2", provider: { id: "anthropic", name: "Anthropic" } }] },
        { category: "openai", items: [{ id: "1", provider: { id: "openai", name: "OpenAI" } }] },
      ),
    ).toBeLessThan(0)

    expect(
      sortModelGroupsByProvider(
        { category: "zzz", items: [{ id: "1", provider: { id: "zzz", name: "Zeta" } }] },
        { category: "aaa", items: [{ id: "2", provider: { id: "aaa", name: "Alpha" } }] },
      ),
    ).toBeGreaterThan(0)
  })
})
