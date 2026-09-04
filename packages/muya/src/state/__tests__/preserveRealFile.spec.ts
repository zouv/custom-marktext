// @vitest-environment happy-dom
// [CUSTOM-BEGIN] CUSTOM-20260904-005 - real-file preservation regression
// Reproduces the user-reported case: a CRLF AGENTS.md file, one heading
// edited, save must change only that line.
// [CUSTOM-END] CUSTOM-20260904-005
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Muya } from '../../muya';

const bootedHosts: HTMLElement[] = [];

beforeEach(() => {
    (window as unknown as { MUYA_VERSION: string }).MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();
});

function bootMuya(markdown: string, options: Record<string, unknown> = {}): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown, ...options } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode as unknown as HTMLElement);
    return muya;
}

describe('preserveFormatting — real file regression', () => {
    it('CRLF file opened as LF: edit one heading, only that line changes', () => {
        const filePath = 'F:/Developer/AI/vibe/agent_trae_work/AGENTS.md';
        let crlf: string;
        try {
            crlf = readFileSync(filePath, 'utf-8');
        } catch {
            // Machine without the file: skip silently rather than fail.
            return;
        }
        // loadMarkdownFile converts CRLF → LF internally
        const lf = crlf.replace(/\r\n/g, '\n');
        const muya = bootMuya(lf, { preserveFormattingOnSave: true });

        // Edit the first heading via the real block text setter.
        const heading = muya.editor.scrollPage!.firstContentInDescendant();
        const oldText = heading.text;
        heading.text = oldText.replace('重要', '重 要');
        muya.editor.jsonState.flush();

        const outLf = muya.getMarkdown();
        const outCrlf = outLf.replace(/\n/g, '\r\n');
        const expected = crlf.replace('重要', '重 要');

        if (outCrlf !== expected) {
            const a = expected.split('\r\n');
            const b = outCrlf.split('\r\n');
            const diffs: string[] = [];
            for (let i = 0; i < Math.max(a.length, b.length); i++) {
                if (a[i] !== b[i])
                    diffs.push(`line ${i}: ${JSON.stringify(a[i]?.slice(0, 50))} != ${JSON.stringify(b[i]?.slice(0, 50))}`);
            }
            throw new Error(`not identical — ${diffs.length} differing lines:\n${diffs.slice(0, 10).join('\n')}`);
        }
    });
});
