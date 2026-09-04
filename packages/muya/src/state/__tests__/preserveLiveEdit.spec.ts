// @vitest-environment happy-dom
// [CUSTOM-BEGIN] CUSTOM-20260904-005 - live-editor preservation integration spec
// Boots the real Muya instance with preserveFormattingOnSave and exercises
// the actual edit path (content-block text op through muya.eventCenter) to
// verify that only the edited block's serialization changes.
// [CUSTOM-END] CUSTOM-20260904-005
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
    const muya = new Muya(host, {
        markdown,
        ...options,
    } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode as unknown as HTMLElement);
    return muya;
}

describe('preserveFormatting — live editor integration', () => {
    it('keeps all other blocks verbatim after editing one heading (state text change)', () => {
        const md = `## 重要

第一段文字。

## 第二个标题

- 列表项一
- 列表项二
`;
        const muya = bootMuya(md, { preserveFormattingOnSave: true });

        // Simulate the user edit through the REAL path: the content block's
        // text setter dispatches a jsonState.editOperation op (exactly what
        // typing in the editor does).
        const headingBlock = muya.editor.scrollPage!.firstContentInDescendant()!;
        headingBlock.text = '## 重 要';
        muya.editor.jsonState.flush();

        const out = muya.getMarkdown();
        const expected = md.replace('重要', '重 要');
        expect(out).toBe(expected);
    });

    it('writes the anchors on the live editor state and replays them', () => {
        const md = `# Head #

para

| a | b |
| --- | --- |
| x | y |
`;
        const muya = bootMuya(md, { preserveFormattingOnSave: true });
        const states = muya.getState();
        // Anchors exist on top-level states.
        expect(typeof (states[0] as { raw?: string }).raw).toBe('string');
        expect((states[0] as { raw?: string }).raw).toBe('# Head #');

        const out = muya.getMarkdown();
        expect(out).toBe(md);
    });

    it('off by default: anchors are not recorded', () => {
        const md = '# Head #\n\npara\n';
        const muya = bootMuya(md);
        const states = muya.getState();
        expect((states[0] as { raw?: string }).raw).toBeUndefined();
    });
});
