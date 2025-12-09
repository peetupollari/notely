'use strict';

/* Frosted Notes — fixed storage for mobile/desktop (localStorage + IndexedDB fallback) */

/* STORAGE KEYS */
const STORAGE_KEY = 'frosted-notes-final';
const SHORTCUTS_KEY = 'frosted-notes-shortcuts-final';
const THEME_KEY = 'frosted-notes-theme-final';

/* DEFAULT SHORTCUTS */
const DEFAULT_SHORTCUTS = {
  bold: { ctrl:true, shift:false, alt:false, key:'b' },
  italic: { ctrl:true, shift:false, alt:false, key:'i' },
  insertUnorderedList: { ctrl:true, shift:true, alt:false, key:'l' },
  insertOrderedList: { ctrl:true, shift:true, alt:false, key:'n' },
  dashList: { ctrl:true, shift:false, alt:false, key:'-' },
  h1: { ctrl:true, shift:true, alt:false, key:'1' },
  h2: { ctrl:true, shift:true, alt:false, key:'2' },

  // NEW: tight lines shortcut (Ctrl/Cmd + Alt + T)
  tightLines: { ctrl:true, shift:false, alt:true, key:'t' }
};

/* --- Robust storage wrapper (prefers localStorage, falls back to IndexedDB, then memory) --- */
const Storage = (function(){
  const DB_NAME = 'frosted_notes_db_v1';
  const STORE_NAME = 'kv';
  let idbPromise = null;
  let useLocal = false;

  function localAvailable(){
    try {
      const t = '__stor_test__';
      window.localStorage.setItem(t, t);
      window.localStorage.removeItem(t);
      return true;
    } catch(e){ return false; }
  }
  useLocal = localAvailable();

  function openIDB(){
    if(idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
      if(!('indexedDB' in window)) return reject(new Error('IndexedDB not supported'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IDB open error'));
      req.onblocked = () => console.warn('IndexedDB blocked');
    });
    return idbPromise;
  }

  async function idbGet(key){
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const st = tx.objectStore(STORE_NAME);
      const r = st.get(key);
      r.onsuccess = () => resolve(r.result === undefined ? null : r.result);
      r.onerror = () => resolve(null);
    });
  }

  async function idbSet(key, value){
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const st = tx.objectStore(STORE_NAME);
      const r = st.put(value, key);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error || new Error('idb set error'));
    });
  }

  async function idbRemove(key){
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const st = tx.objectStore(STORE_NAME);
      const r = st.delete(key);
      r.onsuccess = () => resolve();
      r.onerror = () => resolve();
    });
  }

  // in-memory fallback
  const mem = {};

  return {
    // get parsed JSON (async), fallback used if not found
    async getJSON(key, fallback = null){
      if(useLocal){
        try {
          const v = window.localStorage.getItem(key);
          return v ? JSON.parse(v) : fallback;
        } catch(e){
          // fall through to IDB
        }
      }
      try {
        const r = await idbGet(key);
        if(r !== null) return r;
      } catch(e){
        // ignore
      }
      // try memory
      return (key in mem) ? mem[key] : fallback;
    },
    // set object (async)
    async setJSON(key, value){
      if(useLocal){
        try {
          window.localStorage.setItem(key, JSON.stringify(value));
          return;
        } catch(e){
          // fall through to idb
        }
      }
      try {
        await idbSet(key, value);
        return;
      } catch(e){
        // fall through to memory
      }
      try {
        mem[key] = value;
      } catch(e){
        console.warn('Storage fallback failed', e);
      }
    },
    async remove(key){
      if(useLocal){
        try { window.localStorage.removeItem(key); return; } catch(e){}
      }
      try { await idbRemove(key); return; } catch(e){}
      try { delete mem[key]; } catch(e){}
    },
    // handy quick sync flag
    localAvailable: useLocal
  };
})();

/* Wait for DOM ready, then initialize everything */
document.addEventListener('DOMContentLoaded', async () => {

  /* state */
  let store = { notes: [], currentId: null };
  let shortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
  let activeColor = null; // current color string while color-mode active

  /* DOM refs (grab after DOM loaded) */
  const notesListEl = document.getElementById('notes-list');
  const newNoteBtn = document.getElementById('new-note');
  const deleteBtn = document.getElementById('delete-note');
  const editor = document.getElementById('editor');
  const noteTitleInput = document.getElementById('note-title');
  const searchInput = document.getElementById('search-input');
  const statusLeft = document.getElementById('status-left');
  const openSettingsBtn = document.getElementById('open-settings');
  const settingsOverlay = document.getElementById('settings-overlay');
  const closeSettingsBtn = document.getElementById('close-settings');
  const themeToggle = document.getElementById('theme-toggle');
  const dashListBtn = document.getElementById('dash-list-btn');
  const shortcutsGrid = document.getElementById('shortcuts-grid');
  const emptyState = document.getElementById('empty-state');
  const paperWrap = document.getElementById('paper-wrap');
  const emptyCreate = document.getElementById('empty-create');
  let toolbarButtons = document.querySelectorAll('.tool-btn');
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const mobileOverlay = document.getElementById('mobile-overlay');

  const confirmModal = document.getElementById('confirm-modal');
  const confirmBody = document.getElementById('confirm-body');
  const confirmCancel = document.getElementById('confirm-cancel');
  const confirmOk = document.getElementById('confirm-ok');

  /* inject minimal CSS for .tight-lines so user doesn't need to edit style.css */
  (function ensureTightLinesCSS() {
    const id = 'frosted-tight-lines-style';
    if(document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      /* tighter line gap for selected blocks (adjust value to taste) */
      .tight-lines { line-height: 1.05 !important; }
    `;
    document.head.appendChild(style);
  })();

  /* ensure tight-lines button exists: create if missing and insert after italic button */
  (function ensureTightButton() {
    if(document.getElementById('tight-lines-btn')) return;
    const toolbar = document.querySelector('.toolbar .tools-row');
    if(!toolbar) return;
    // find italic button to insert after
    const italicBtn = toolbar.querySelector('[data-command="italic"]');
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.id = 'tight-lines-btn';
    btn.title = 'Toggle tight line gap';
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '<i class="fa-solid fa-compress"></i>';
    if(italicBtn && italicBtn.parentNode) italicBtn.parentNode.insertBefore(btn, italicBtn.nextSibling);
    else toolbar.appendChild(btn);
    // refresh toolbarButtons NodeList reference
    toolbarButtons = document.querySelectorAll('.tool-btn');
  })();

  /* utilities */
  function uid(){ return 'n-' + Date.now() + '-' + Math.floor(Math.random()*10000); }
  function nowISO(){ return new Date().toISOString(); }
  function stripTags(html){ return html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }

  function getEditorDefaultColor(){
    try {
      const c = getComputedStyle(editor).color;
      return c || '#000000';
    } catch(e){
      return '#000000';
    }
  }

  function showEmptyState(){ if(emptyState) emptyState.classList.remove('hidden'); if(paperWrap) paperWrap.classList.add('hidden'); }
  function showPaper(){ if(emptyState) emptyState.classList.add('hidden'); if(paperWrap) paperWrap.classList.remove('hidden'); }

  /* render */
  function renderNotesList(filter=''){
    if(!notesListEl) return;
    notesListEl.innerHTML = '';
    const q = (filter || '').toLowerCase().trim();
    const items = (store.notes || []).filter(n=>{
      if(!q) return true;
      return (n.title && n.title.toLowerCase().includes(q)) || (n.content && n.content.toLowerCase().includes(q));
    }).sort((a,b)=> new Date(b.updatedAt) - new Date(a.updatedAt));
    items.forEach(n=>{
      const el = document.createElement('div'); el.className='note-item'; if(store.currentId===n.id) el.classList.add('active');
      el.dataset.id = n.id;
      const meta = document.createElement('div'); meta.className='note-meta';
      const t = document.createElement('div'); t.className='note-title'; t.textContent = n.title || 'Untitled';
      const s = document.createElement('div'); s.className='note-snippet'; s.textContent = stripTags(n.content || '').slice(0,90);
      meta.appendChild(t); meta.appendChild(s);
      el.appendChild(meta);
      el.addEventListener('click', ()=> openNote(n.id));
      notesListEl.appendChild(el);
    });
    if(items.length === 0){
      const hint = document.createElement('div'); hint.className='small'; hint.textContent='No notes yet — click New';
      notesListEl.appendChild(hint);
    }

    if(!store.notes || store.notes.length === 0) {
      showEmptyState();
    } else {
      if(!store.currentId && store.notes.length) store.currentId = store.notes[0].id;
      showPaper();
    }
  }

  /* CRUD */
  function createNote(){
    const n = { id: uid(), title: 'Untitled', content: '<p><br></p>', updatedAt: nowISO() };
    store.notes.unshift(n);
    store.currentId = n.id;
    saveStore();
    renderNotesList();
    openNote(n.id);
  }
  function openNote(id){
    const n = store.notes.find(x=>x.id===id); if(!n) return;
    store.currentId = id;
    noteTitleInput.value = n.title || 'Untitled';
    editor.innerHTML = n.content || '<p><br></p>';
    statusLeft.textContent = 'Loaded';
    saveStore();
    renderNotesList(searchInput.value || '');
    showPaper();
    focusEditor();
    updateToolbarState();
    // refresh tooltips since shortcuts may have been loaded
    updateToolbarTooltips();
  }
  function deleteCurrentNote(){
    if(!store.currentId) return;
    showConfirm('Delete note', 'Are you sure you want to delete this note? This action cannot be undone.', ()=>{
      store.notes = store.notes.filter(n=>n.id !== store.currentId);
      store.currentId = store.notes.length ? store.notes[0].id : null;
      saveStore();
      renderNotesList();
      if(store.currentId) openNote(store.currentId);
      else { editor.innerHTML = ''; noteTitleInput.value = ''; showEmptyState(); }
      hideConfirm();
    }, ()=> { hideConfirm(); });
  }
  async function saveStore(){
    try {
      // write asynchronously; we don't block UI on persist
      Storage.setJSON(STORAGE_KEY, store).catch(e => console.warn('saveStore failed', e));
    } catch(e){
      console.warn('saveStore error', e);
    }
  }

  /* confirm modal */
  function showConfirm(title, message, onOk, onCancel){
    if(!confirmModal) {
      // fallback to browser confirm if modal not present
      if(window.confirm(message)){ if(onOk) onOk(); } else { if(onCancel) onCancel(); }
      return;
    }
    confirmModal.classList.remove('hidden');
    confirmModal.setAttribute('aria-hidden','false');
    const titleEl = document.querySelector('.confirm-title');
    if(titleEl) titleEl.textContent = title;
    confirmBody.textContent = message;
    confirmOk.onclick = ()=> { if(onOk) onOk(); };
    confirmCancel.onclick = ()=> { if(onCancel) onCancel(); };
    confirmModal.onclick = (e)=> { if(e.target === confirmModal) { if(onCancel) onCancel(); } };
  }
  function hideConfirm(){ if(confirmModal){ confirmModal.classList.add('hidden'); confirmModal.setAttribute('aria-hidden','true'); } }

  /* save debounce */
  let saveTimer = null;
  function scheduleSave(){
    if(statusLeft) statusLeft.textContent = 'Saving...';
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(()=> {
      if(!store.currentId) return;
      const note = store.notes.find(x=>x.id===store.currentId);
      if(!note) return;
      note.content = editor.innerHTML;
      note.title = (noteTitleInput.value || '').trim() || extractTitleFromHtml(note.content) || 'Untitled';
      note.updatedAt = nowISO();
      saveStore();
      renderNotesList(searchInput.value || '');
      if(statusLeft) statusLeft.textContent = 'Saved';
    }, 650);
  }
  function extractTitleFromHtml(html){
    const m = html.match(/<(h1|h2|h3)>(.*?)<\/\1>/i);
    if(m) return m[2].replace(/<[^>]+>/g,'').trim();
    const t = stripTags(html); return (t.split('\n')[0] || '').slice(0,60).trim();
  }

  /* focus */
  function focusEditor(){
    try {
      editor.focus();
      const r = document.createRange(); r.selectNodeContents(editor); r.collapse(false);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    } catch(e){}
  }

  /* --- TOOLBAR HANDLING (formatBlock toggle + list handling) --- */
  toolbarButtons.forEach(btn=>{
    btn.addEventListener('mousedown', e => e.preventDefault()); // preserve selection
    btn.addEventListener('click', (e)=>{
      const cmd = btn.dataset.command;
      if(cmd === 'formatBlock'){
        const value = (btn.dataset.value || '<p>').toLowerCase();
        toggleFormatBlock(value);
      } else if(cmd === 'insertUnorderedList'){
        toggleUnorderedList(false);
      } else if(cmd === 'insertOrderedList'){
        toggleOrderedList();
      } else {
        document.execCommand(cmd, false, null);
        scheduleSave();
        setTimeout(updateToolbarState, 20);
      }
      editor.focus();
    });
  });

  function toggleFormatBlock(tagWithBrackets) {
  const tag = tagWithBrackets.replace(/<|>/g,'').toLowerCase();
  const sel = window.getSelection();

  if (!sel.rangeCount) {
    document.execCommand('formatBlock', false, tagWithBrackets);
    setTimeout(updateToolbarState, 20);
    return;
  }

  let node = sel.anchorNode;
  if (node.nodeType === 3) node = node.parentNode;

  // Find nearest block element
  let block = node.closest ? node.closest('p,div,h1,h2,h3,li,blockquote') : null;

  if (!block) {
    // fallback: create a paragraph if no block exists
    block = document.createElement('p');
    block.innerHTML = '<br>';
    node.parentNode.insertBefore(block, node);
    placeCaretAtStartOrEnd(block, true);
  }

  const headingAncestor = block.closest('h1,h2,h3');

  if (headingAncestor) {
    const currentTag = headingAncestor.nodeName.toLowerCase();
    if (currentTag === tag) {
      // convert to paragraph
      const p = document.createElement('p');
      p.innerHTML = headingAncestor.innerHTML || '<br>';
      headingAncestor.parentNode.replaceChild(p, headingAncestor);
      placeCaretAtStartOrEnd(p, true);
      normalizeAroundNode(p);
      scheduleSave();
      setTimeout(updateToolbarState, 20);
      return;
    } else {
      // replace heading with requested heading
      const newHeading = document.createElement(tag);
      newHeading.innerHTML = headingAncestor.innerHTML || '<br>';
      headingAncestor.parentNode.replaceChild(newHeading, headingAncestor);
      placeCaretAtStartOrEnd(newHeading, true);
      scheduleSave();
      setTimeout(updateToolbarState, 20);
      return;
    }
    } else {
      // wrap current block in heading
      const newHeading = document.createElement(tag);
      newHeading.innerHTML = block.innerHTML || '<br>';
      block.parentNode.replaceChild(newHeading, block);
      placeCaretAtStartOrEnd(newHeading, true);
      scheduleSave();
      setTimeout(updateToolbarState, 20);
      return;
    }
  }

  /* === LIST LOGIC (create at current block) === */
  function createListAtCurrentBlock(type, isDash = false){
    const sel = window.getSelection();
    if(!sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    let block = range.startContainer;
    while(block && block !== editor){
      if(block.nodeType === 1){
        const name = block.nodeName.toLowerCase();
        if(['p','div','li','h1','h2','h3','blockquote'].includes(name)) break;
      }
      block = block.parentNode;
    }

    if(block && block.nodeType === 1 && block.nodeName.toLowerCase() === 'li'){
      document.execCommand(type === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
      setTimeout(()=>{ 
        let node = sel.anchorNode; if(node && node.nodeType === 3) node = node.parentNode;
        const ul = node && node.closest ? node.closest('ul') : null;
        if(ul){
          if(isDash) { ul.classList.add('dash-list'); ul.style.listStyleType='none'; }
          else { ul.classList.remove('dash-list'); ul.style.listStyleType=''; }
        }
        // normalize after exiting nested lists
        normalizeAroundSelection();
        scheduleSave(); updateToolbarState();
      }, 12);
      return;
    }

    if(block && block !== editor){
      const contentHTML = block.innerHTML.trim();
      const list = document.createElement(type);
      const li = document.createElement('li');
      li.innerHTML = (contentHTML === '') ? '<br>' : contentHTML;
      list.appendChild(li);
      if(isDash && type === 'ul'){ list.classList.add('dash-list'); list.style.listStyleType='none'; }
      block.parentNode.replaceChild(list, block);
      placeCaretAtStartOrEnd(li, true);
      scheduleSave(); updateToolbarState();
      return;
    }

    const list = document.createElement(type);
    const li = document.createElement('li');
    li.innerHTML = '<br>';
    list.appendChild(li);
    if(isDash && type === 'ul'){ list.classList.add('dash-list'); list.style.listStyleType='none'; }
    range.deleteContents();
    range.insertNode(list);
    placeCaretAtStartOrEnd(li, true);
    scheduleSave(); updateToolbarState();
  }

  function toggleUnorderedList(normalBullet = false){
    const sel = window.getSelection();
    if(sel.rangeCount){
      let node = sel.anchorNode;
      if(node && node.nodeType === 3) node = node.parentNode;
      const ul = node && node.closest ? node.closest('ul') : null;
      if(ul){
        if(ul.classList.contains('dash-list') && normalBullet){
          ul.classList.remove('dash-list'); ul.style.listStyleType='';
          // normalize surrounding blocks into paragraphs
          setTimeout(()=> { normalizeAroundSelection(); scheduleSave(); updateToolbarState(); }, 12);
          return;
        }
        document.execCommand('insertUnorderedList');
        setTimeout(()=> {
          let n = sel.anchorNode; if(n && n.nodeType === 3) n = n.parentNode;
          const newUl = n && n.closest ? n.closest('ul') : null;
          if(newUl) newUl.classList.remove('dash-list');
          // When list toggles off, ensure the resulting block(s) are paragraphs not divs
          normalizeAroundSelection();
          scheduleSave(); updateToolbarState();
        }, 10);
        return;
      }
    }
    createListAtCurrentBlock('ul', false);
  }

  function toggleOrderedList(){
    const sel = window.getSelection();
    if(sel.rangeCount){
      let node = sel.anchorNode; if(node && node.nodeType === 3) node = node.parentNode;
      const ol = node && node.closest ? node.closest('ol') : null;
      if(ol){
        document.execCommand('insertOrderedList');
        setTimeout(()=> { normalizeAroundSelection(); scheduleSave(); updateToolbarState(); }, 10);
        return;
      }
    }
    createListAtCurrentBlock('ol', false);
  }

  function toggleDashList(){
    const sel = window.getSelection();
    let insideDash = false;
    if(sel.rangeCount){
      let node = sel.anchorNode; if(node && node.nodeType === 3) node = node.parentNode;
      const ul = node && node.closest ? node.closest('ul') : null;
      if(ul && ul.classList.contains('dash-list')) insideDash = true;
    }

    if(insideDash){
      document.execCommand('insertUnorderedList');
      setTimeout(()=> {
        let node = (window.getSelection().anchorNode); if(node && node.nodeType === 3) node = node.parentNode;
        const ul = node && node.closest ? node.closest('ul') : null;
        if(ul) ul.classList.remove('dash-list');
        normalizeAroundSelection();
        scheduleSave(); updateToolbarState();
      }, 10);
      return;
    }

    createListAtCurrentBlock('ul', true);
  }
  if(dashListBtn) dashListBtn.addEventListener('click', toggleDashList);

  /* keyboard shortcuts matching */
  function matchShortcut(e, mapping){
    const key = (e.key || '').toLowerCase();
    const ctrl = Boolean(e.ctrlKey || e.metaKey);
    const shift = Boolean(e.shiftKey);
    const alt = Boolean(e.altKey);
    return key === mapping.key && ctrl === !!mapping.ctrl && shift === !!mapping.shift && alt === !!mapping.alt;
  }

  /* --- COLOR MODE FEATURE (fixed & theme-aware) --- */
  function isValidCssColor(s){
    const el = document.createElement('span');
    el.style.color = '';
    el.style.color = s;
    // If browser accepted it, style.color is non-empty
    return !!el.style.color;
  }

  function applyColorForTyping(colorStr){
    activeColor = colorStr;
    try { editor.focus(); } catch(e){}
    try {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('foreColor', false, colorStr);
    } catch (err) {
      // ignore; insertion fallback covers many browsers
    }
  }

  function resetColorTyping(){
    activeColor = null;
    try { editor.focus(); } catch(e){}
    try {
      // Reset CSS typing and fore color to default
      document.execCommand('foreColor', false, getEditorDefaultColor());
      document.execCommand('styleWithCSS', false, false);
    } catch (err) {
      // ignore
    }
    // Clean up any empty colored spans that could propagate
    cleanupEmptyColoredSpans();
  }

  function insertColoredSpanAtRange(range, colorStr){
    const span = document.createElement('span');
    span.setAttribute('data-colored', 'true');
    span.setAttribute('data-color', colorStr);
    span.style.color = colorStr;
    // put an empty text node so caret sits inside
    const txt = document.createTextNode('\u200B');
    span.appendChild(txt);
    range.deleteContents();
    range.insertNode(span);
    const newRange = document.createRange();
    newRange.setStart(txt, 0);
    newRange.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(newRange);
    applyColorForTyping(colorStr);
  }

  function unwrapColoredSpanIfInside(node){
    let span = node && node.closest ? node.closest('span[data-colored]') : null;
    if(!span) return false;
    const parent = span.parentNode;
    const textNode = document.createTextNode(span.textContent || '');
    parent.replaceChild(textNode, span);
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    resetColorTyping();
    return true;
  }

  function cleanupEmptyColoredSpans(){
    if(!editor) return;
    const spans = Array.from(editor.querySelectorAll('span[data-colored]'));
    spans.forEach(s => {
      // if span only contains zero-width or whitespace, remove it
      // const txt = (s.textContent || '').replace(/\u200B/g, '').trim();
      // if(txt.length === 0){
      //   const parent = s.parentNode;
      //   const replacement = document.createTextNode('');
      //   parent.replaceChild(replacement, s);
      // }
    });
  }

  /* helper: convert DIV -> P in the vicinity of selection (fixes divs after lists) */
  function normalizeAroundSelection(){
    const sel = window.getSelection();
    const node = (sel && sel.rangeCount) ? sel.anchorNode : null;
    if(node) normalizeAroundNode(node);
    else normalizeWholeEditor();
  }

  // Convert a node's nearest block ancestor from DIV -> P (only when safe)
  function normalizeAroundNode(node){
    try {
      let block = node;
      while(block && block !== editor){
        if(block.nodeType === 1){
          const name = block.nodeName.toLowerCase();
          if(['p','div','li','h1','h2','h3','blockquote'].includes(name)) break;
        }
        block = block.parentNode;
      }
      if(!block || block === editor) return;
      // if block is div, convert to p
      if(block.nodeName.toLowerCase() === 'div'){
        const p = document.createElement('p');
        // preserve inner HTML, but avoid moving editor-internal nodes like lists
        p.innerHTML = block.innerHTML || '<br>';
        block.parentNode.replaceChild(p, block);
        placeCaretAtStartOrEnd(p, true);
      }
    } catch(e){ /* ignore */ }
  }

  // Fallback normalization: scan for direct divs under editor and convert to paragraphs (safe)
  function normalizeWholeEditor(){
    try {
      const divs = Array.from(editor.querySelectorAll('div'));
      divs.forEach(d => {
        // skip divs that are inside lists or special elements
        if(d.closest('ul,ol,blockquote')) return;
        // skip divs that are not direct content (sanity)
        const p = document.createElement('p');
        p.innerHTML = d.innerHTML || '<br>';
        d.parentNode.replaceChild(p, d);
      });
    } catch(e){}
  }

  /* helper: insert nodes from HTML at a range (keeps it small and focused) */
  function insertHtmlAtRange(range, html){
    const frag = document.createDocumentFragment();
    const div = document.createElement('div');
    div.innerHTML = html;
    while(div.firstChild) frag.appendChild(div.firstChild);
    range.deleteContents();
    const lastInserted = frag.lastChild;
    range.insertNode(frag);
    // place caret after lastInserted
    const newRange = document.createRange();
    if(lastInserted){
      try {
        newRange.setStartAfter(lastInserted);
      } catch(e){
        newRange.selectNodeContents(editor); newRange.collapse(false);
      }
    } else {
      newRange.selectNodeContents(editor); newRange.collapse(false);
    }
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(newRange);
  }

  /* key handling in editor */
  if(editor){
    editor.addEventListener('keydown', (e)=>{
      // shortcuts
      for(const action in shortcuts){
        if(matchShortcut(e, shortcuts[action])){
          e.preventDefault();
          applyActionForShortcut(action);
          scheduleSave();
          updateToolbarState();
          return;
        }
      }

      // Tab inserts spaces
      if(e.key === 'Tab'){ e.preventDefault(); insertTextAtCursor('\u00a0\u00a0\u00a0\u00a0'); scheduleSave(); updateToolbarState(); return; }

      /* ---------- Slash and heading behavior ---------- */
      // If user types '/' check for exit color token '//' or toggling heading back if inside a heading
      if(e.key === '/'){
        const sel = window.getSelection(); if(!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const info = getTextBeforeCaretInBlock(range);
        if(!info) return;
        const t = info.textBefore;
        // exit color-mode when '//' typed
        if(t.endsWith('/')){
          e.preventDefault();
          deleteNCharsBeforeCaret(range, 1); // remove previous '/'
          const nodeAt = window.getSelection().anchorNode;
          const unwrapped = unwrapColoredSpanIfInside(nodeAt);
          if(!unwrapped) resetColorTyping();
          scheduleSave();
          updateToolbarState();
          return;
        }

        // If inside a heading and press '/', toggle heading back to paragraph (only for h1-h3)
        try {
          let node = window.getSelection().anchorNode;
          if(node && node.nodeType === 3) node = node.parentNode;
          const headingAncestor = node && node.closest ? node.closest('h1,h2,h3') : null;
          if(headingAncestor){
            e.preventDefault();
            // Convert heading back to paragraph
            const p = document.createElement('p');
            p.innerHTML = headingAncestor.innerHTML || '<br>';
            headingAncestor.parentNode.replaceChild(p, headingAncestor);
            placeCaretAtStartOrEnd(p, true);
            normalizeAroundNode(p);
            scheduleSave();
            updateToolbarState();
            return;
          }
        } catch(err) {
          // ignore
        }
      }

      /* ---------- Enter key: ensure color doesn't carry into new lines ---------- */
      if(e.key === 'Enter'){
        // after native handling, run normalization to avoid colored spans being carried
        setTimeout(()=>{
          try {
            const sel = window.getSelection();
            const node = sel && sel.anchorNode ? sel.anchorNode : null;
            if(node){
              // if inside colored span, unwrap it
              if(node.closest && node.closest('span[data-colored]')) {
                unwrapColoredSpanIfInside(node);
              }
              // normalize any DIV created by browser
              normalizeAroundSelection();
            }
            // ensure typing color reset if user exited color mode before Enter
            if(!activeColor) resetColorTyping();
            scheduleSave();
          } catch(e){}
        }, 0);
        return; // allow default Enter behaviour first (we normalized afterwards)
      }

      /* ---------- Space key: lists, headings, colors, inline markdown ---------- */
      if(e.key === ' '){
        const sel = window.getSelection(); if(!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const info = getTextBeforeCaretInBlock(range);
        if(!info) return;
        const t = info.textBefore.replace(/\u00a0/g,' ').replace(/\r/g,'').replace(/\n/g,'');

        // --- LIST TRIGGERS ---
        const mBullet = t.match(/^\s*(\*|-)\s*$/);
        const mNumber = t.match(/^\s*([0-9]+)\.\s*$/);
        if(mBullet){
          e.preventDefault();
          deleteNCharsBeforeCaret(range, mBullet[0].length);
          if(mBullet[1] === '-') createListAtCurrentBlock('ul', true);
          else createListAtCurrentBlock('ul', false);
          return;
        }
        if(mNumber){
          e.preventDefault();
          deleteNCharsBeforeCaret(range, mNumber[0].length);
          createListAtCurrentBlock('ol', false);
          return;
        }

        // --- HEADING TRIGGERS: # + Space => <h1>, ## => <h2>, ### => <h3> (limit to 1..3)
        const mHeading = t.match(/^\s*(#{1,3})\s*$/);
        if(mHeading){
          e.preventDefault();
          const tokenLen = mHeading[0].length;
          deleteNCharsBeforeCaret(range, tokenLen);
          const level = Math.min(3, mHeading[1].length);
          toggleFormatBlock(`<h${level}>`);
          return;
        }

        // --- COLOR TOKEN DETECTION: starts with '/' instead of '#'
        const colorTokenMatch = t.match(/\/([a-zA-Z]+|[0-9a-fA-F]{3,6})$/);
        if(colorTokenMatch){
          const token = colorTokenMatch[0];
          const raw = colorTokenMatch[1];
          let colorCandidate = raw;
          if(/^[0-9a-fA-F]{3,6}$/.test(raw)){
            colorCandidate = '#' + raw;
          }
          if(isValidCssColor(colorCandidate)){
            e.preventDefault();
            deleteNCharsBeforeCaret(range, token.length);
            const sel2 = window.getSelection();
            const r2 = sel2.getRangeAt(0);
            insertColoredSpanAtRange(r2, colorCandidate);
            scheduleSave();
            updateToolbarState();
            return;
          }
        }

        // --- INLINE MARKDOWN: Bold **word** and Italic *word* (applies on finishing token) ---
        // Check for bold first (longer token)
        const boldMatch = t.match(/(\*\*([^\*]+?)\*\*)$/);
        if(boldMatch){
          e.preventDefault();
          const token = boldMatch[1];
          const inner = boldMatch[2];
          deleteNCharsBeforeCaret(range, token.length);
          const sel2 = window.getSelection();
          const r2 = sel2.getRangeAt(0);
          insertHtmlAtRange(r2, `<strong>${escapeHtml(inner)}</strong>&nbsp;`);
          scheduleSave();
          updateToolbarState();
          return;
        }
        // italic
        const italicMatch = t.match(/(\*([^*]+?)\*)$/);
        if(italicMatch){
          e.preventDefault();
          const token = italicMatch[1];
          const inner = italicMatch[2];
          deleteNCharsBeforeCaret(range, token.length);
          const sel2 = window.getSelection();
          const r2 = sel2.getRangeAt(0);
          insertHtmlAtRange(r2, `<em>${escapeHtml(inner)}</em>&nbsp;`);
          scheduleSave();
          updateToolbarState();
          return;
        }

        // otherwise fall through to normal space key
      }

      // No special handling — let rest happen
    });

    // Additional safety: whenever selection changes or input occurs, remove trailing zero-width colored spans that might persist
    editor.addEventListener('keyup', () => {
      cleanupEmptyColoredSpans();
      normalizeAroundSelection(); // softly normalize to p when possible
    });
  }

  function applyActionForShortcut(action){
    switch(action){
      case 'dashList': toggleDashList(); break;
      case 'h1': toggleFormatBlock('<h1>'); break;
      case 'h2': toggleFormatBlock('<h2>'); break;
      case 'insertUnorderedList': toggleUnorderedList(false); break;
      case 'insertOrderedList': toggleOrderedList(); break;

      // NEW: keyboard shortcut action
      case 'tightLines': toggleTightLineGap(); break;

      default: document.execCommand(action, false, null);
    }
    editor.focus();
  }


  /* caret helpers */
  function insertTextAtCursor(text){
    const sel = window.getSelection();
    if(!sel.rangeCount){ editor.focus(); return; }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges(); sel.addRange(range);
  }
  function getTextBeforeCaretInBlock(range){
    try{
      let node = range.startContainer;
      let block = node;
      while(block && block !== editor){
        if(block.nodeType === 1){
          const name = block.nodeName.toLowerCase();
          if(['p','div','li','h1','h2','h3','h4','h5','h6','blockquote'].includes(name)) break;
        }
        block = block.parentNode;
      }
      if(!block) block = editor;
      let textBefore = '';
      const selNode = range.startContainer;
      const selOffset = range.startOffset;
      function walk(n){
        if(n === selNode){
          if(n.nodeType === 3) textBefore += n.textContent.slice(0, selOffset);
          return true;
        }
        if(n.nodeType === 3) textBefore += n.textContent;
        else {
          const name = n.nodeName.toLowerCase();
          if(['div','p','br','li','h1','h2','h3','h4','h5','h6'].includes(name)) textBefore += '\n';
          for(let i=0;i<n.childNodes.length;i++){
            if(walk(n.childNodes[i])) return true;
          }
        }
        return false;
      }
      for(let i=0;i<block.childNodes.length;i++){
        if(walk(block.childNodes[i])) break;
      }
      return { textBefore, startContainer: range.startContainer };
    }catch(e){ console.error(e); return null; }
  }
  function deleteNCharsBeforeCaret(range, n){
    const sel = window.getSelection();
    const startNode = range.startContainer;
    if(startNode.nodeType === 3){
      const offset = range.startOffset;
      const start = Math.max(0, offset - n);
      startNode.textContent = startNode.textContent.slice(0, start) + startNode.textContent.slice(offset);
      const newRange = document.createRange(); newRange.setStart(startNode, start); newRange.collapse(true);
      sel.removeAllRanges(); sel.addRange(newRange);
      return;
    }
    for(let i=0;i<n;i++) document.execCommand('delete', false, null);
  }

  /* small helper to safely escape HTML for text insertion */
  function escapeHtml(s){
    return (s+'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* save on input */
  if(editor) editor.addEventListener('input', scheduleSave);
  if(noteTitleInput) noteTitleInput.addEventListener('input', scheduleSave);

  /* toolbar active state update */
  function updateToolbarState(){
    // update each standard toolbar button as before
    toolbarButtons.forEach(btn => {
      const cmd = btn.dataset.command || '';
      if(['bold','italic','justifyLeft','justifyCenter','justifyRight'].includes(cmd)){
        try {
          if(document.queryCommandState(cmd)) btn.classList.add('active'); else btn.classList.remove('active');
        } catch(e) { btn.classList.remove('active'); }
      } else if(cmd === 'insertUnorderedList'){
        const sel = window.getSelection();
        let isActive = false;
        if(sel.rangeCount){
          let node = sel.anchorNode;
          if(node && node.nodeType === 3) node = node.parentNode;
          const ul = node && node.closest ? node.closest('ul') : null;
          if(ul && !ul.classList.contains('dash-list')) isActive = true;
        }
        if(isActive) btn.classList.add('active'); else btn.classList.remove('active');
      } else if(cmd === 'insertOrderedList'){
        try {
          if(document.queryCommandState('insertOrderedList')) btn.classList.add('active'); else btn.classList.remove('active');
        } catch(e){ btn.classList.remove('active'); }
      } else if(cmd === 'formatBlock'){
        const value = (btn.dataset.value || '').toLowerCase().replace(/<|>/g,'');
        const sel = window.getSelection();
        if(!sel.rangeCount){ btn.classList.remove('active'); return; }
        let node = sel.anchorNode;
        if(!node){ btn.classList.remove('active'); return; }
        if(node.nodeType === 3) node = node.parentNode;
        const ancestor = node && node.closest ? node.closest(value) : null;
        if(ancestor) btn.classList.add('active'); else btn.classList.remove('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if(dashListBtn){
      const sel = window.getSelection();
      let isDash = false;
      if(sel.rangeCount){
        let node = sel.anchorNode;
        if(node && node.nodeType === 3) node = node.parentNode;
        const ul = node && node.closest ? node.closest('ul') : null;
        if(ul && ul.classList.contains('dash-list')) isDash = true;
      }
      if(isDash) dashListBtn.classList.add('active'); else dashListBtn.classList.remove('active');
    }

    // TIGHT LINES button active/aria-pressed state
    const tightBtn = document.getElementById('tight-lines-btn');
    if(tightBtn){
      try {
        if(isSelectionTight()) {
          tightBtn.classList.add('active');
          tightBtn.setAttribute('aria-pressed', 'true');
        } else {
          tightBtn.classList.remove('active');
          tightBtn.setAttribute('aria-pressed', 'false');
        }
      } catch(e) {
        tightBtn.classList.remove('active');
        tightBtn.setAttribute('aria-pressed', 'false');
      }
    }
  }

  function placeCaretAtStartOrEnd(node, end = true){
    try {
      node.focus?.();
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(!end ? true : false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch(e){}
  }

  /* events that change state */
  ['keyup','mouseup','input','click'].forEach(evt => editor && editor.addEventListener(evt, () => setTimeout(updateToolbarState, 10)));
  document.addEventListener('selectionchange', () => setTimeout(updateToolbarState, 10));
  toolbarButtons.forEach(b => b.addEventListener('click', () => setTimeout(updateToolbarState, 40)));

  /* list interactions & wiring */
  if(newNoteBtn) newNoteBtn.addEventListener('click', ()=>{ createNote(); focusEditor(); });
  if(deleteBtn) deleteBtn.addEventListener('click', deleteCurrentNote);
  if(emptyCreate) emptyCreate.addEventListener('click', ()=> { createNote(); focusEditor(); });
  if(searchInput) searchInput.addEventListener('input', e=> renderNotesList(e.target.value));
  if(notesListEl) notesListEl.addEventListener('click', ()=> setTimeout(()=> editor.focus(), 80));

  /* settings overlay */
  if(openSettingsBtn) openSettingsBtn.addEventListener('click', ()=>{
    populateShortcutsUI();
    if(themeToggle) themeToggle.checked = document.body.classList.contains('dark-mode');
    if(settingsOverlay) settingsOverlay.classList.remove('hidden');
  });
  if(closeSettingsBtn) closeSettingsBtn.addEventListener('click', ()=> settingsOverlay.classList.add('hidden'));
  const closeBtn2 = document.getElementById('close-settings');
  if(closeBtn2) closeBtn2.addEventListener('click', ()=> settingsOverlay.classList.add('hidden'));

  /* theme persistence wiring */
  if(themeToggle){
    themeToggle.addEventListener('change', async (e)=>{
      if(e.target.checked){
        document.body.classList.add('dark-mode');
        try { await Storage.setJSON(THEME_KEY, 'dark'); } catch(e){}
      } else {
        document.body.classList.remove('dark-mode');
        try { await Storage.setJSON(THEME_KEY, 'light'); } catch(e){}
      }
      if(activeColor) applyColorForTyping(activeColor);
      else resetColorTyping();
    });
  }

  /* shortcuts UI */
  function populateShortcutsUI(){
    if(!shortcutsGrid) return;
    shortcutsGrid.innerHTML = '';
    for(const key of Object.keys(DEFAULT_SHORTCUTS)){
      const row = document.createElement('div'); row.className = 'shortcut-row';
      const label = document.createElement('div'); label.style.minWidth = '120px'; label.textContent = key;
      const input = document.createElement('input'); input.className = 'shortcut-input'; input.setAttribute('data-action', key); input.readOnly = true;
      const mapping = shortcuts[key] || DEFAULT_SHORTCUTS[key];
      input.value = mappingToString(mapping);
      row.appendChild(label); row.appendChild(input);
      shortcutsGrid.appendChild(row);

      input.addEventListener('focus', ()=>{
        input.value = 'Press keys...';
        function handler(e){
          e.preventDefault();
          if(['Control','Shift','Alt','Meta'].includes(e.key)){
            const parts = [];
            if(e.ctrlKey || e.metaKey) parts.push('Ctrl/Cmd');
            if(e.shiftKey) parts.push('Shift');
            if(e.altKey) parts.push('Alt');
            input.value = parts.length ? parts.join(' + ') + ' + ...' : 'Hold modifiers, then press key';
            return;
          }
          const map = { ctrl: Boolean(e.ctrlKey || e.metaKey), shift: Boolean(e.shiftKey), alt: Boolean(e.altKey), key: (e.key||'').toLowerCase() };
          shortcuts[key] = map;
          Storage.setJSON(SHORTCUTS_KEY, shortcuts).catch(()=>{});
          input.value = mappingToString(map);
          window.removeEventListener('keydown', handler, true);
          input.blur();
          // update the tooltips since shortcuts changed
          updateToolbarTooltips();
        }
        window.addEventListener('keydown', handler, true);
        input.addEventListener('blur', ()=> window.removeEventListener('keydown', handler, true), { once:true });
      });
    }
  }
  const resetShortcutsBtn = document.getElementById('reset-shortcuts');
  if(resetShortcutsBtn) resetShortcutsBtn.addEventListener('click', ()=>{
    if(!window.confirm('Reset shortcuts to defaults?')) return;
    shortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
    Storage.setJSON(SHORTCUTS_KEY, shortcuts).catch(()=>{});
    populateShortcutsUI();
    updateToolbarTooltips();
  });
  function mappingToString(m){
    if(!m) return '';
    const parts = [];
    if(m.ctrl) parts.push('Ctrl/Cmd');
    if(m.shift) parts.push('Shift');
    if(m.alt) parts.push('Alt');
    parts.push((m.key||'').toUpperCase());
    return parts.join(' + ');
  }

  /* update toolbar button titles to show shortcut & markdown */
  function updateToolbarTooltips(){
    toolbarButtons = document.querySelectorAll('.tool-btn'); // refresh
    const commandToMarkdown = {
      bold: '**bold**',
      italic: '*italic*',
      insertUnorderedList: '- item  OR  * item',
      insertOrderedList: '1. item',
      dashList: '- item (dash list)',
      formatBlock_h1: '# + Space → H1',
      formatBlock_h2: '## + Space → H2',
      formatBlock_h3: '### + Space → H3',
      tightLines: '(toggle) tight lines',
    };

    toolbarButtons.forEach(btn=>{
      const cmd = btn.dataset.command || '';
      let md = '';
      if(cmd === 'formatBlock'){
        const val = (btn.dataset.value || '').toLowerCase().replace(/<|>/g,'');
        md = commandToMarkdown['formatBlock_' + val] || (val ? `${val.toUpperCase()} (format)` : '');
      } else {
        md = commandToMarkdown[cmd] || '';
      }
      // Determine label for shortcut if present
      let sc = '';
      // map dataset.command -> shortcuts key name
      let shortcutKeyName = null;
      if(cmd === 'formatBlock'){
        const val = (btn.dataset.value || '').toLowerCase().replace(/<|>/g,'');
        if(val && val.startsWith('h')) shortcutKeyName = 'h' + val.replace('h',''); // e.g. h1 maps to 'h1'
      } else {
        shortcutKeyName = cmd; // many command names match shortcut keys
      }
      if(shortcutKeyName && shortcuts[shortcutKeyName]) sc = mappingToString(shortcuts[shortcutKeyName]);

      // build title (tooltip)
      const parts = [];
      if(btn.getAttribute('aria-label')) parts.push(btn.getAttribute('aria-label'));
      if(sc) parts.push(`Shortcut: ${sc}`);
      if(md) parts.push(`Markdown: ${md}`);
      const title = parts.join(' — ');
      if(title) btn.setAttribute('title', title);
    });
  }

  /* paste sanitize */
  if(editor) editor.addEventListener('paste', (e)=>{ 
    e.preventDefault(); 
    const text = (e.clipboardData || window.clipboardData).getData('text/plain'); 
    document.execCommand('insertText', false, text); 
  });

  /* expose store for debugging (live object) */
  Object.defineProperty(window, '__frosted_notes_final', {
    get(){ return store; },
    configurable: true
  });

  /* mobile hamburger logic */
  function openMobileSidebar(){
    document.documentElement.classList.add('mobile-sidebar-open');
    document.body.classList.add('mobile-sidebar-open');
    const root = document.querySelector('.root');
    if(root) root.classList.add('mobile-sidebar-open');
    if(mobileOverlay) mobileOverlay.classList.remove('hidden');
  }
  function closeMobileSidebar(){
    document.documentElement.classList.remove('mobile-sidebar-open');
    document.body.classList.remove('mobile-sidebar-open');
    const root = document.querySelector('.root');
    if(root) root.classList.remove('mobile-sidebar-open');
    if(mobileOverlay) mobileOverlay.classList.add('hidden');
  }
  if(hamburgerBtn) hamburgerBtn.addEventListener('click', ()=> {
    const root = document.querySelector('.root');
    const open = root ? root.classList.toggle('mobile-sidebar-open') : document.documentElement.classList.toggle('mobile-sidebar-open');
    if(open) mobileOverlay && mobileOverlay.classList.remove('hidden'); else mobileOverlay && mobileOverlay.classList.add('hidden');
  });
  if(mobileOverlay) mobileOverlay.addEventListener('click', ()=> closeMobileSidebar());

  /* --- TIGHT LINE-GAP TOGGLE IMPLEMENTATION --- */

  // Get the block elements (p, div, li, h1, h2, h3, blockquote, etc.) touched by the current selection
  function getSelectedBlockElements() {
    if(!editor) return [];
    const sel = window.getSelection();
    if(!sel.rangeCount) return [];
    const range = sel.getRangeAt(0);

    function findBlock(node) {
      while(node && node !== editor) {
        if(node.nodeType === 1) {
          const name = node.nodeName.toLowerCase();
          if(['p','div','li','h1','h2','h3','blockquote'].includes(name)) return node;
        }
        node = node.parentNode;
      }
      return editor;
    }

    const startBlock = findBlock(range.startContainer);
    const endBlock = findBlock(range.endContainer);

    if(startBlock === endBlock) return [startBlock];

    const allBlocks = Array.from(editor.querySelectorAll('p,div,li,h1,h2,h3,blockquote'));
    const startIndex = allBlocks.indexOf(startBlock);
    const endIndex = allBlocks.indexOf(endBlock);
    if(startIndex === -1 || endIndex === -1) {
      return [startBlock];
    }
    const from = Math.min(startIndex, endIndex);
    const to = Math.max(startIndex, endIndex);
    const result = [];
    for(let i = from; i <= to; i++) result.push(allBlocks[i]);
    return result;
  }

  function isSelectionTight() {
    const blocks = getSelectedBlockElements();
    if(!blocks.length) return false;
    return blocks.every(b => b && b.classList && b.classList.contains('tight-lines'));
  }

  function toggleTightLineGap() {
    const blocks = getSelectedBlockElements();
    if(!blocks.length) return;
    const makeTight = !isSelectionTight();
    blocks.forEach(b => {
      if(!b || b === editor) return;
      if(makeTight) b.classList.add('tight-lines');
      else b.classList.remove('tight-lines');
    });
    scheduleSave();
    setTimeout(updateToolbarState, 30);
    editor.focus();
  }

  const tightLinesBtn = document.getElementById('tight-lines-btn');
  if(tightLinesBtn) {
    tightLinesBtn.addEventListener('mousedown', e => e.preventDefault());
    tightLinesBtn.addEventListener('click', (e) => {
      toggleTightLineGap();
    });
  }

  /* caret placement helper (kept near the end) */
  function placeCaretAtStartOrEnd(node, end = true){
    try {
      node.focus?.();
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(!end ? true : false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch(e){}
  }

  /* ensure toolbar & visibility on load (small delay like original) */
  setTimeout(()=> {
    renderNotesList();
    updateToolbarState();
    if(activeColor) applyColorForTyping(activeColor);
    else resetColorTyping();
    updateToolbarTooltips();
  }, 60);

  /* --- Initialization: load storage, shortcuts and theme --- */
  (async function boot(){
    // load shortcuts & store from Storage (async)
    try {
      const savedShortcuts = await Storage.getJSON(SHORTCUTS_KEY, null);
      if(savedShortcuts) shortcuts = savedShortcuts;
    } catch(e){ /* ignore */ }

    try {
      const savedStore = await Storage.getJSON(STORAGE_KEY, null);
      if(savedStore) store = savedStore;
    } catch(e){ /* ignore */ }

    // load theme
    try {
      const savedTheme = await Storage.getJSON(THEME_KEY, null);
      if(savedTheme === 'dark'){ document.body.classList.add('dark-mode'); if(themeToggle) themeToggle.checked = true; }
      else if(savedTheme === 'light'){ document.body.classList.remove('dark-mode'); if(themeToggle) themeToggle.checked = false; }
      // If no saved theme, leave as-is (could be system)
    } catch(e){ /* ignore */ }

    // If store has no currentId but has notes, set it
    if(store.notes && store.notes.length && !store.currentId){
      store.currentId = store.notes[0].id;
    }

    renderNotesList();
    updateToolbarState();
    populateShortcutsUI();

    // If a note exists, open current
    if(store.currentId) openNote(store.currentId);
    else {
      // nothing yet
      if(!store.notes || store.notes.length === 0) {
        showEmptyState();
      } else {
        showPaper();
      }
    }

    // ensure typing color matches theme on load
    if(activeColor) applyColorForTyping(activeColor); else resetColorTyping();

    // ensure tooltips reflect loaded shortcuts
    updateToolbarTooltips();
  })();

});

