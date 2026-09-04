import { describe, expect, it } from 'vitest';
import { MarkdownToState } from '../markdownToState';
import ExportMarkdown from '../stateToMarkdown';

// [CUSTOM-BEGIN] CUSTOM-20260904-004 - preserveFormatting round-trip specs
// Verifies that with preserveFormatting on, a markdown → state → markdown
// round-trip is the identity for constructs the upstream normalizer would
// rewrite (table column widths, blank-line runs, tilde fences, lazy
// blockquote continuation, ATX closers, deep list indentation), that an
// EDITED block degrades to the normalized serializer while untouched
// neighbours stay verbatim, and that the option off reproduces upstream
// behaviour byte-for-byte.
// [CUSTOM-END] CUSTOM-20260904-004

const PARSE_OPTIONS = {
    footnote: false,
    math: true,
    isGitlabCompatibilityEnabled: false,
    trimUnnecessaryCodeBlockEmptyLines: false,
    frontMatter: true,
};

function roundTripPreserve(md: string): string {
    const states = new MarkdownToState({
        ...PARSE_OPTIONS,
        preserveFormatting: true,
    }).generate(md);
    const serializer = new ExportMarkdown({ listIndentation: 1, preserveFormatting: true });
    serializer.setParseOptions(PARSE_OPTIONS);
    return serializer.generate(states);
}

function roundTripUpstream(md: string): string {
    const states = new MarkdownToState(PARSE_OPTIONS).generate(md);
    return new ExportMarkdown({ listIndentation: 1 }).generate(states);
}

function parsePreserve(md: string) {
    return new MarkdownToState({ ...PARSE_OPTIONS, preserveFormatting: true }).generate(md);
}

describe('preserveFormatting — round-trip identity for normalized constructs', () => {
    it('keeps a narrow table unexpanded', () => {
        const md = '| a | b |\n| --- | --- |\n| x | y |\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('keeps a table\'s original column widths and alignment row', () => {
        const md = '| Left | Center | Right |\n|:---|:----:|----:|\n| a | b | c |\n| aa | bb | cc |\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('keeps a tilde code fence (upstream rewrites ~~~ to ```)', () => {
        const md = '~~~\ncode\n~~~\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('keeps extra blank lines between paragraphs', () => {
        const md = 'a\n\n\n\n\nb\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('keeps a lazy blockquote continuation line without > prefix', () => {
        const md = '> a\nb\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('keeps a nested blockquote without an inserted transition line', () => {
        const md = '> a\n> > b\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('keeps an ATX heading closing sequence', () => {
        const md = '# Head #\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('keeps ATX leading whitespace after the hashes', () => {
        const md = '#     Head\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('keeps ordered list leading zeros', () => {
        const md = '001) first\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('keeps a 4-space nested list indent', () => {
        const md = '- a\n    - b\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('round-trips a mixed document with all constructs together', () => {
        const md = '# T #\n\nintro\n\n~~~\ncode\n~~~\n\n\n\n| a | b |\n| - | - |\n| x | y |\n\n> q\nlazy\n\n- one\n    - nested\n\nend\n';
        expect(roundTripPreserve(md)).toBe(md);
    });

    it('round-trips already-canonical documents identically too', () => {
        const md = '# Head\n\ntext\n\n```js\ncode\n```\n\n- item\n  - nested\n';
        expect(roundTripPreserve(md)).toBe(md);
    });
});

describe('preserveFormatting — edited blocks degrade, neighbours stay verbatim', () => {
    it('re-serializes an edited table cell with the normalizer, keeps the following paragraph raw', () => {
        const md = '| a | b |\n| --- | --- |\n| x | y |\n\npara\n';
        const states = parsePreserve(md);
        // Simulate a user edit: cell "x" → "XX" (op editOperation would do the same at this path).
        const table = states[0] as unknown as {
            children: { children: { text: string }[] }[];
        };
        table.children[1].children[0].text = 'XX';

        const serializer = new ExportMarkdown({ listIndentation: 1, preserveFormatting: true });
        serializer.setParseOptions(PARSE_OPTIONS);
        const out = serializer.generate(states);

        // Edited block: table no longer matches its raw anchor → normalized (padded) output.
        expect(out).toContain('| a   | b   |');
        expect(out).toContain('| XX  | y   |');
        // Untouched neighbour: paragraph still verbatim with the standard single blank line gap.
        expect(out).toBe('| a   | b   |\n| --- | --- |\n| XX  | y   |\n\npara\n');
    });

    it('falls back to the normalizer when the anchor raw is missing', () => {
        const md = '| a | b |\n| --- | --- |\n| x | y |\n';
        const states = parsePreserve(md);
        delete (states[0] as { raw?: string }).raw;

        const serializer = new ExportMarkdown({ listIndentation: 1, preserveFormatting: true });
        serializer.setParseOptions(PARSE_OPTIONS);
        const out = serializer.generate(states);
        expect(out).toBe('| a   | b   |\n| --- | --- |\n| x   | y   |\n');
    });
});

describe('preserveFormatting — off keeps upstream behaviour', () => {
    it('normalizes the table exactly like upstream when the option is absent', () => {
        const md = '| a | b |\n| --- | --- |\n| x | y |\n';
        const states = parsePreserve(md);
        // Option off: anchors are present but must be ignored.
        const out = new ExportMarkdown({ listIndentation: 1 }).generate(states);
        expect(out).toBe(roundTripUpstream(md));
    });

    it('collapses blank-line runs exactly like upstream when the option is off', () => {
        const md = 'a\n\n\n\n\nb\n';
        expect(roundTripUpstream(md)).toBe('a\n\nb\n');
    });
});
