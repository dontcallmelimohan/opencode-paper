# Terminology Ledger（术语账本）

本文件定义 nature-reader 在翻译/对照阅读过程中维护的「原文术语 → 中文译名」一致性账本。
它最终成为 `paper.md` 的 recurring-term 表与 `source_map.json` 的 glossary。

## 何时入账

- 首次遇到的领域术语、缩写、方法名、数据集/指标名、机构与专有名词。
- 一个词在文中有多种常见译法、容易译歪的词（如 trade-off、framework、latent、baseline）。
- 同义反复出现的表达（作者自造词、章节内固定叫法）。

## 规则

1. **沿用学界固定译名**：有通行译名的术语按通行译名，如 deep learning → 深度学习；不要自造异译。
2. **首次出现给括注**：正文与图注里第一次出现时写成「中文（English Term）」，后续保持一致。
3. **专名不译**：作者名、期刊/会议名、工具/数据集名、品牌等保留原文；机构名按惯例（如 OpenAI 不译）。
4. **一词一译**：全文统一，不因段落不同而换译法；拿不准时在账本里标注备选并选一个贯彻全文。
5. **缩写先展开**：首次出现缩写给出全称与中文，如「多头注意力（Multi-Head Attention, MHA）」，入账后沿用。

## 账本格式

```markdown
| 原文 Term | 中文译名 | 说明 / 备注 |
|---|---|---|
| Multi-Head Attention | 多头注意力 | 缩写 MHA，首次出现给全称括注 |
| trade-off | 权衡 | 视语境可作「折中」，本文统一用「权衡」 |
| ablations | 消融实验 | 也可译「消融研究」 |
```

## 交付落点

- `paper.md` 末尾附「recurring terms」小表（原术语 + 统一译名）。
- `source_map.json` 的 glossary 字段同步该账本。
- `translation_notes.md` 记录存在歧义、需作者/用户裁决的术语选择。
