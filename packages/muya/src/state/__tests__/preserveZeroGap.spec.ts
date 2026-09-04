// [CUSTOM-BEGIN] CUSTOM-20260904-005 - zero-gap boundaries + trailing blanks
// Regression specs for the reported AGENTS.md case: blocks glued together
// with NO blank line (paragraph/list right after a `###` heading) were
// re-separated by a forced blank line, and the document's trailing blank
// line was dropped.
// [CUSTOM-END] CUSTOM-20260904-005
import { describe, expect, it } from 'vitest';
import { MarkdownToState } from '../markdownToState';
import ExportMarkdown from '../stateToMarkdown';

const PARSE_OPTIONS = {
    footnote: false,
    math: true,
    isGitlabCompatibilityEnabled: false,
    trimUnnecessaryCodeBlockEmptyLines: false,
    frontMatter: true,
};

function roundTripPreserve(md: string): string {
    const parser = new MarkdownToState({ ...PARSE_OPTIONS, preserveFormatting: true });
    const states = parser.generate(md);
    const serializer = new ExportMarkdown({ listIndentation: 1, preserveFormatting: true });
    serializer.setParseOptions(PARSE_OPTIONS);
    const trailing = parser.getTrailingBlankLines();
    if (trailing !== undefined)
        serializer.setTrailingBlankLines(trailing);
    return serializer.generate(states);
}

describe('preserveFormatting — zero-gap block boundaries (CUSTOM-20260904-005)', () => {
    it('keeps a paragraph glued to a heading (no blank line inserted)', () => {
        const md = '### 设计相关文件\n所有通过 Design 模式产出的文件。\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('keeps a list glued to its preceding paragraph', () => {
        const md = '说明：\n- 列表项一\n- 列表项二\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('round-trips the reported AGENTS.md layout (mixed gaps + trailing blank)', () => {
        const md = '## 重要\n\n每次回复开头。\n\n## 文件存放规则\n\n### 设计相关文件\n所有通过 Design 模式产出的文件。\n- 子项 A\n- 子项 B\n\n### 故事创作\n正文段落。\n- 子项 C\n\nend\n\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('keeps the document trailing blank line', () => {
        const md = 'a\n\nb\n\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('keeps multiple trailing blank lines', () => {
        const md = 'a\n\n\n\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('still round-trips the single-trailing-newline convention', () => {
        const md = 'a\n\nb\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('edited first line changes only that line (zero-gap document)', () => {
        const md = '## 重要\n\n每次回复。\n\n### 标题\n紧贴段落。\n- 列表\n';
        const parser = new MarkdownToState({ ...PARSE_OPTIONS, preserveFormatting: true });
        const states = parser.generate(md);
        (states[0] as { text: string }).text = '## 重a要';

        const serializer = new ExportMarkdown({ listIndentation: 1, preserveFormatting: true });
        serializer.setParseOptions(PARSE_OPTIONS);
        serializer.setTrailingBlankLines(parser.getTrailingBlankLines()!);
        const out = serializer.generate(states);
        expect(out).toBe(md.replace('重要', '重a要'));
    });
});
