import assert from 'node:assert/strict';import{existsSync}from'node:fs';import{createHash}from'node:crypto';import{loader}from'./weaving-test-harness.mjs';assert.ok(existsSync('lib/dojo/weavingWorkflow/clientIdentity.ts'),'HTTP preview must retain collision-safe operation identity without subtle crypto');const m=loader()('lib/dojo/weavingWorkflow/clientIdentity.ts');assert.equal(m.sha256Text('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');for(const s of ['','中文字🌱','a'.repeat(100000)])assert.equal(m.sha256Text(s),createHash('sha256').update(s).digest('hex'));assert.match(m.randomID(),/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);console.log('PASS browser operation identity: known SHA256 vectors, Unicode/long payload, UUID');

const navigatorBefore = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const documentBefore = Object.getOwnPropertyDescriptor(globalThis, 'document');
let copied = '', removed = 0, fallbackWorks = true;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw Error('Clipboard permission denied'); } } } });
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ value: '', style: {}, select() { copied = this.value; }, setSelectionRange() {}, remove() { removed++; } }),
    body: { append() {} }, execCommand: () => fallbackWorks,
} });
try {
    await m.copyText('完整協作指令');
    assert.equal(copied, '完整協作指令'); assert.equal(removed, 1);
    fallbackWorks = false;
    await assert.rejects(() => m.copyText('保留可手動選取的指令'), /無法複製/);
    assert.equal(removed, 2);
    console.log('PASS denied clipboard uses selection fallback; total failure remains explicit and cleans up');
} finally {
    if (navigatorBefore) Object.defineProperty(globalThis, 'navigator', navigatorBefore); else delete globalThis.navigator;
    if (documentBefore) Object.defineProperty(globalThis, 'document', documentBefore); else delete globalThis.document;
}
