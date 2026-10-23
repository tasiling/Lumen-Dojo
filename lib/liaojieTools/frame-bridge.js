/* Runs only inside the opaque, network-isolated original-tool frame. */
(() => {
  const config = window.__LUMEN_TOOL__;
  const initial = config.snapshot;
  const data = Object.assign(Object.create(null), initial?.storage || {});
  const storage = {
    getItem: key => Object.hasOwn(data, key) ? data[key] : null,
    setItem: (key, value) => { data[String(key)] = String(value); },
    removeItem: key => { delete data[key]; },
    clear: () => { Object.keys(data).forEach(key => delete data[key]); },
    key: index => Object.keys(data)[index] || null,
    get length() { return Object.keys(data).length; },
  };
  Object.defineProperty(window, 'localStorage', { value: storage });
  let last = '', ready = false;
  const post = (type, extra = {}) => parent.postMessage({ lumenTool: config.token, type, ...extra }, '*');
  function state() {
    if (config.tool === 'diamond') return { nodes: nodePool, stage: document.querySelector('.stage-btn.active')?.dataset.stage, sub: document.querySelector('.c-sub-btn.active')?.dataset.csub };
    if (config.tool === 'carousel') return { project: P, current: cur, fonts: fontLib };
    if (config.tool === 'sanko-prompt') return { method: picked, station: pickedStation };
    return null;
  }
  function capture() {
    // Native navigation does not always persist its selected page. Flush canonical state before snapshotting.
    if (config.tool === 'magazine') saveLocal();
    if (config.tool === 'sanko-batch') saveState();
    const fields = {}, outputs = {};
    document.querySelectorAll('input[id],textarea[id],select[id]').forEach(el => {
      if (el.type !== 'file') fields[el.id] = { value: el.value, checked: el.checked || false };
    });
    document.querySelectorAll('.output-box[id],#out,#output,#analysisPrompt').forEach(el => { outputs[el.id] = el.textContent; });
    return { version: 1, tool: config.tool, storage: { ...data }, fields, outputs, state: state() };
  }
  function send(force = false, requestId) {
    if (!ready) return;
    try {
      const snapshot = capture(), key = JSON.stringify(snapshot);
      if (force || key !== last) { last = key; post('snapshot', { snapshot, requestId }); }
    } catch (error) { post('error', { message: '目前內容無法備份：' + error.message }); }
  }
  window.addEventListener('DOMContentLoaded', async () => {
    try {
      if (config.tool === 'diamond') {
        const nativeRender = renderNodeList;
        const escape = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
        renderNodeList = function () {
          const plain = nodePool;
          nodePool = plain.map(node => ({...node,desc:escape(node.desc),axis:escape(node.axis),source:escape(node.source)}));
          try { nativeRender(); } finally { nodePool = plain; }
        };
      }
      if (initial) {
        if (config.tool === 'diamond') {
          nodePool = Array.isArray(initial.state?.nodes) ? initial.state.nodes : [];
          renderNodeList();
          if (['A','B','C','D'].includes(initial.state?.stage)) switchStage(initial.state.stage);
          if (['expand','condense'].includes(initial.state?.sub)) switchCSub(initial.state.sub);
        }
        if (config.tool === 'carousel' && initial.state?.project) {
          P = initial.state.project; cur = Math.min(initial.state.current || 0, P.pages.length - 1);
          for (const font of initial.state.fonts || []) if (font.data) await loadCustomFont(font.name, font.data, true);
          for (const p of P.pages) for (const src of [p.bg,p.mascot]) if (src) { const image = new Image(); image.onload = render; image.src = src; bgCache[src] = image; }
          globals(); fontOptions(); draw();
        }
        if (config.tool === 'sanko-prompt') {
          if (initial.state?.method) { const el = [...document.querySelectorAll('[onclick]')].find(el => el.getAttribute('onclick')?.includes("pickMethod('" + initial.state.method + "'")); if (el) el.click(); }
          pickedStation = initial.state?.station || null;
        }
        // Stateful renderers restore from their own project/storage; never overwrite rendered controls with stale DOM mirrors.
        if (!['carousel','magazine'].includes(config.tool)) {
          for (const [id, field] of Object.entries(initial.fields)) {
            const el = document.getElementById(id);
            if (el && el.type !== 'file') { el.value = field.value; if ('checked' in el) el.checked = field.checked; }
          }
          for (const [id, text] of Object.entries(initial.outputs)) {
            const el = document.getElementById(id); if (el) { el.textContent = text; el.classList.remove('empty'); }
          }
        }
        if (config.tool === 'carousel' && initial.fields.bulk) document.getElementById('bulk').value = initial.fields.bulk.value;
        if (config.tool === 'sanko-prompt' && initial.outputs.out) document.getElementById('result').classList.remove('hidden');
      }
      ready = true; post('ready'); send(true);
      setInterval(send, 800);
      const changed = () => { post('dirty'); setTimeout(() => send(true), 0); };
      addEventListener('input', changed, true);
      addEventListener('change', changed, true);
      addEventListener('click', () => setTimeout(send, 0), true);
      addEventListener('pagehide', () => send(true));
      addEventListener('message', event => { if (event.source === parent && event.data?.lumenTool === config.token && event.data.type === 'capture') send(true, event.data.requestId); });
    } catch (error) { post('error', { message: '還原失敗，備份仍保留：' + error.message }); }
  });
})();
