# 历史坑点 / Pitfalls

> **这是什么**：本仓库（custom-marktext）开发与排查中**踩过的坑**的沉淀。新会话动手前先扫一眼标题，
> 避免重复踩坑。每条写清：现象 → 根因 → 解法 → 验证方式。
>
> **维护铁律**：每解决一个"反复折腾才定位到"的问题，就来这里加一条（一次没定位到就解决的不算坑）。
> 配套：代码位置反查见 [`../architecture.md`](../architecture.md)。

---

## 1. 上游 `.gitignore` 忽略 `.agents/` —— skill 文件入库需反向豁免

- **日期**：2026-09-04（CUSTOM-20260904-001，初始化时发现）
- **现象**：`.agents/skills/*/SKILL.md` 创建后 `git status` 完全不显示，无法跟踪。
- **根因**：上游 marktext 的 `.gitignore` 含 `.claude/`、`.agents/`、`.agent/` 整目录忽略（上游把 AI 工具目录当本地噪音）；而本仓库的自定义开发体系恰恰要把 `.agents/skills/` 纳入版本管理（跨工具 skill 标准路径）。
- **解法**：在 `.gitignore` 中删除 `.claude/`、`.agents/` 整目录行，改为忽略 `.claude/settings.local.json` + `!.agents/` + `!.agents/**` 反向豁免；`.zcode/plans/` 忽略会话本地计划文档。上游合并时 `.gitignore` 按冲突策略 keep-ours 处理。
- **教训**：基于上游建自定义仓库时，先 `git check-ignore -v` 验证自定义体系目录是否被上游 ignore 规则命中，再批量创建文件。
- **验证**：`git ls-files --others --exclude-standard` 能列出三个 SKILL.md；`git check-ignore .zcode/plans/x.md` 命中。
