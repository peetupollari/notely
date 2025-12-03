/* Frosted Notes — color-mode theme fix
   Keeps typed text color reset consistent with Light/Dark theme.
*/

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
  h2: { ctrl:true, shift:true, alt:false, key:'2' }
};

/* helpers */
function loadJSON(k, fallback){ try{ const r = localStorage.getItem(k); return r ? JSON.parse(r) : fallback; }catch(e){ return fallback; } }
function saveJSON(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

/* state */
let store = loadJSON(STORAGE_KEY, { notes: [], currentId: null });
let shortcuts = loadJSON(SHORTCUTS_KEY, DEFAULT_SHORTCUTS);

/* DOM refs */
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
const toolbarButtons = document.querySelectorAll('.tool-btn');
const hamburgerBtn = document.getElementById('hamburger-btn');
const mobileOverlay = document.getElementById('mobile-overlay');

/* confirm modal */
const confirmModal = document.getElementById('confirm-modal');
const confirmBody = document.getElementById('confirm-body');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmOk = document.getElementById('confirm-ok');

/* utilities */
function uid(){ return 'n-' + Date.now() + '-' + Math.floor(Math.random()*10000); }
function nowISO(){ return new Date().toISOString(); }
function stripTags(html){ return html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }

/* color-mode state */
let activeColor = null; // current color string while color-mode active

/* helper to read the editor's default (theme) color at runtime */
function getEditorDefaultColor(){
  try {
    const c = getComputedStyle(editor).color;
    return c || '#000000';
  } catch(e){
    return '#000000';
  }
}

/* visibility helpers */
function showEmptyState(){ emptyState.classList.remove('hidden'); paperWrap.classList.add('hidden'); }
function showPaper(){ emptyState.classList.add('hidden'); paperWrap.classList.remove('hidden'); }

/* render */
function renderNotesList(filter=''){
  notesListEl.innerHTML = '';
  const q = (filter || '').toLowerCase().trim();
  const items = store.notes.filter(n=>{
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

  if(store.notes.length === 0) {
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
  saveStore(); renderNotesList(); openNote(n.id);
}
function openNote(id){
  const n = store.notes.find(x=>x.id===id); if(!n) return;
  store.currentId = id;
  noteTitleInput.value = n.title || 'Untitled';
  editor.innerHTML = n.content || '<p><br></p>';
  statusLeft.textContent = 'Loaded';
  saveStore();
  renderNotesList(searchInput.value);
  showPaper();
  focusEditor();
  updateToolbarState();
}
function deleteCurrentNote(){
  if(!store.currentId) return;
  showConfirm('Delete note', 'Are you sure you want to delete this note? This action cannot be undone.', ()=>{
    store.notes = store.notes.filter(n=>n.id !== store.currentId);
    store.currentId = store.notes.length ? store.notes[0].id : null;
    saveStore(); renderNotesList();
    if(store.currentId) openNote(store.currentId);
    else { editor.innerHTML = ''; noteTitleInput.value = ''; showEmptyState(); }
    hideConfirm();
  }, ()=> { hideConfirm(); });
}
function saveStore(){ saveJSON(STORAGE_KEY, store); }

/* confirm modal */
function showConfirm(title, message, onOk, onCancel){
  confirmModal.classList.remove('hidden');
  confirmModal.setAttribute('aria-hidden','false');
  document.querySelector('.confirm-title').textContent = title;
  confirmBody.textContent = message;
  confirmOk.onclick = ()=> { if(onOk) onOk(); };
  confirmCancel.onclick = ()=> { if(onCancel) onCancel(); };
  confirmModal.onclick = (e)=> { if(e.target === confirmModal) { if(onCancel) onCancel(); } };
}
function hideConfirm(){ confirmModal.classList.add('hidden'); confirmModal.setAttribute('aria-hidden','true'); }

/* save debounce */
let saveTimer = null;
function scheduleSave(){
  statusLeft.textContent = 'Saving...';
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(()=> {
    if(!store.currentId) return;
    const note = store.notes.find(x=>x.id===store.currentId);
    if(!note) return;
    note.content = editor.innerHTML;
    note.title = (noteTitleInput.value || '').trim() || extractTitleFromHtml(note.content) || 'Untitled';
    note.updatedAt = nowISO();
    saveStore();
    renderNotesList(searchInput.value);
    statusLeft.textContent = 'Saved';
  }, 650);
}
function extractTitleFromHtml(html){
  const m = html.match(/<(h1|h2|h3)>(.*?)<\/\1>/i);
  if(m) return m[2].replace(/<[^>]+>/g,'').trim();
  const t = stripTags(html); return (t.split('\n')[0] || '').slice(0,60).trim();
}

/* focus */
function focusEditor(){
  editor.focus();
  const r = document.createRange(); r.selectNodeContents(editor); r.collapse(false);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
}

/* initial render */
renderNotesList();

/* --- TOOLBAR HANDLING (formatBlock toggle + list handling) --- */
document.querySelectorAll('.tool-btn').forEach(btn=>{
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

/* toggle heading block — works inside lists too */
function toggleFormatBlock(tagWithBrackets){
  const tag = tagWithBrackets.replace(/<|>/g,'').toLowerCase();
  const sel = window.getSelection();
  if(!sel.rangeCount){
    document.execCommand('formatBlock', false, tagWithBrackets);
    setTimeout(updateToolbarState, 20);
    return;
  }
  let node = sel.anchorNode;
  if(node.nodeType === 3) node = node.parentNode;

  const headingAncestor = node && node.closest ? node.closest('h1,h2,h3') : null;

  if(headingAncestor){
    const currentTag = headingAncestor.nodeName.toLowerCase();
    if(currentTag === tag){
      const p = document.createElement('p');
      p.innerHTML = headingAncestor.innerHTML || '<br>';
      headingAncestor.parentNode.replaceChild(p, headingAncestor);
      placeCaretAtStartOrEnd(p, true);
      scheduleSave();
      setTimeout(updateToolbarState, 20);
      return;
    } else {
      const newHeading = document.createElement(tag);
      newHeading.innerHTML = headingAncestor.innerHTML || '<br>';
      headingAncestor.parentNode.replaceChild(newHeading, headingAncestor);
      placeCaretAtStartOrEnd(newHeading, true);
      scheduleSave();
      setTimeout(updateToolbarState, 20);
      return;
    }
  }

  document.execCommand('formatBlock', false, `<${tag}>`);
  setTimeout(()=>{ scheduleSave(); updateToolbarState(); }, 40);
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
      let node = sel.anchorNode;
      if(node && node.nodeType === 3) node = node.parentNode;
      const ul = node && node.closest ? node.closest('ul') : null;
      if(ul){
        if(isDash) { ul.classList.add('dash-list'); ul.style.listStyleType='none'; }
        else { ul.classList.remove('dash-list'); ul.style.listStyleType=''; }
      }
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
        scheduleSave(); updateToolbarState(); return;
      }
      document.execCommand('insertUnorderedList');
      setTimeout(()=> {
        let n = sel.anchorNode; if(n && n.nodeType === 3) n = n.parentNode;
        const newUl = n && n.closest ? n.closest('ul') : null;
        if(newUl) newUl.classList.remove('dash-list');
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
      scheduleSave(); updateToolbarState(); return;
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
      scheduleSave(); updateToolbarState();
    }, 10);
    return;
  }

  createListAtCurrentBlock('ul', true);
}
dashListBtn && dashListBtn.addEventListener('click', toggleDashList);

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
  return !!el.style.color;
}

function applyColorForTyping(colorStr){
  activeColor = colorStr;
  // Ensure editor has focus so execCommand applies correctly
  try { editor.focus(); } catch(e){}
  try {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('foreColor', false, colorStr);
  } catch (err) {
    // ignore; span insertion will still provide color
  }
}

function resetColorTyping(){
  activeColor = null;
  // Ensure editor has focus so execCommand applies correctly
  try { editor.focus(); } catch(e){}
  try {
    // Reset typing color to the editor's default (theme-aware)
    document.execCommand('foreColor', false, getEditorDefaultColor());
    document.execCommand('styleWithCSS', false, false);
  } catch (err) {
    // ignore
  }
}

// Insert a colored span at the given range and put caret inside it.
// Uses a zero-width space so the caret has a text node that's selectable.
function insertColoredSpanAtRange(range, colorStr){
  const span = document.createElement('span');
  span.setAttribute('data-colored', 'true');
  span.setAttribute('data-color', colorStr);
  span.style.color = colorStr;

  // zero-width space text node inside the span so typing replaces it
  const txt = document.createTextNode('\u200B');
  span.appendChild(txt);

  range.deleteContents();
  range.insertNode(span);

  // Move caret inside the text node
  const newRange = document.createRange();
  newRange.setStart(txt, 0);
  newRange.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(newRange);

  // apply execCommand as well to help with some browsers
  applyColorForTyping(colorStr);
}

// If caret is inside a colored span, unwrap it (replace with textual node) and reset typing color
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

/* key handling in editor */
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

  // If user types '#' and there was a previous '#' immediately before caret -> treat as '##' exit token
  if(e.key === '#'){
    const sel = window.getSelection(); if(!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const info = getTextBeforeCaretInBlock(range);
    if(!info) return;
    const t = info.textBefore;
    if(t.endsWith('#')){
      e.preventDefault();
      deleteNCharsBeforeCaret(range, 1); // remove previous '#'
      const nodeAt = window.getSelection().anchorNode;
      const unwrapped = unwrapColoredSpanIfInside(nodeAt);
      if(!unwrapped) resetColorTyping();
      scheduleSave();
      updateToolbarState();
      return;
    }
  }

  // On Space: handle list tokens and also color token (#name or #hex)
  if(e.key === ' '){
    const sel = window.getSelection(); if(!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const info = getTextBeforeCaretInBlock(range);
    if(!info) return;
    const t = info.textBefore.replace(/\u00a0/g,' ').replace(/\r/g,'').replace(/\n/g,'');

    // list triggers
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

    // COLOR token detection: token is "#name" or "#hex" immediately before caret
    const colorTokenMatch = t.match(/#([a-zA-Z]+|[0-9a-fA-F]{3,6})$/);
    if(colorTokenMatch){
      const token = colorTokenMatch[0]; // includes '#'
      const raw = colorTokenMatch[1]; // name or hex digits
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
  }
});

/* applyActionForShortcut */
function applyActionForShortcut(action){
  switch(action){
    case 'dashList': toggleDashList(); break;
    case 'h1': toggleFormatBlock('<h1>'); break;
    case 'h2': toggleFormatBlock('<h2>'); break;
    case 'insertUnorderedList': toggleUnorderedList(false); break;
    case 'insertOrderedList': toggleOrderedList(); break;
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
        if(['p','div','li','h1','h2','h3','blockquote'].includes(name)) break;
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
        if(['div','p','br','li','h1','h2','h3'].includes(name)) textBefore += '\n';
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

/* save on input */
editor.addEventListener('input', scheduleSave);
noteTitleInput.addEventListener('input', scheduleSave);

/* toolbar active state update */
function updateToolbarState(){
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
}

/* caret placement helper */
function placeCaretAtStartOrEnd(node, end = true){
  node.focus?.();
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(!end ? true : false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/* events that change state */
['keyup','mouseup','input','click'].forEach(evt => editor.addEventListener(evt, () => setTimeout(updateToolbarState, 10)));
document.addEventListener('selectionchange', () => setTimeout(updateToolbarState, 10));
toolbarButtons.forEach(b => b.addEventListener('click', () => setTimeout(updateToolbarState, 40)));

/* list interactions & wiring */
newNoteBtn.addEventListener('click', ()=>{ createNote(); focusEditor(); });
deleteBtn.addEventListener('click', deleteCurrentNote);
emptyCreate.addEventListener('click', ()=> { createNote(); focusEditor(); });
searchInput.addEventListener('input', e=> renderNotesList(e.target.value));
notesListEl.addEventListener('click', ()=> setTimeout(()=> editor.focus(), 80));

/* settings */
openSettingsBtn.addEventListener('click', ()=>{
  populateShortcutsUI();
  themeToggle.checked = document.body.classList.contains('dark-mode');
  settingsOverlay.classList.remove('hidden');
});
closeSettingsBtn.addEventListener('click', ()=> settingsOverlay.classList.add('hidden'));
document.getElementById('close-settings').addEventListener('click', ()=> settingsOverlay.classList.add('hidden'));

/* theme persistence */
themeToggle.addEventListener('change', (e)=>{
  if(e.target.checked){
    document.body.classList.add('dark-mode');
    localStorage.setItem(THEME_KEY,'dark');
  } else {
    document.body.classList.remove('dark-mode');
    localStorage.setItem(THEME_KEY,'light');
  }
  // Update typing color to reflect theme change (only if not in custom color mode)
  if(activeColor) applyColorForTyping(activeColor);
  else resetColorTyping();
});
const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
if(savedTheme === 'dark'){ document.body.classList.add('dark-mode'); themeToggle.checked = true; }

/* shortcuts UI */
function populateShortcutsUI(){
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
        saveJSON(SHORTCUTS_KEY, shortcuts);
        input.value = mappingToString(map);
        window.removeEventListener('keydown', handler, true);
        input.blur();
      }
      window.addEventListener('keydown', handler, true);
      input.addEventListener('blur', ()=> window.removeEventListener('keydown', handler, true), { once:true });
    });
  }
}
document.getElementById('reset-shortcuts').addEventListener('click', ()=>{
  if(!confirm('Reset shortcuts to defaults?')) return;
  shortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
  saveJSON(SHORTCUTS_KEY, shortcuts);
  populateShortcutsUI();
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

/* paste sanitize */
editor.addEventListener('paste', (e)=>{ e.preventDefault(); const text = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, text); });

/* quick-export removed — per request exports/imports disabled */

/* expose store for debugging */
window.__frosted_notes_final = store;

/* mobile hamburger logic */
function openMobileSidebar(){
  document.documentElement.classList.add('mobile-sidebar-open');
  document.body.classList.add('mobile-sidebar-open');
  document.querySelector('.root').classList.add('mobile-sidebar-open');
  mobileOverlay.classList.remove('hidden');
}
function closeMobileSidebar(){
  document.documentElement.classList.remove('mobile-sidebar-open');
  document.body.classList.remove('mobile-sidebar-open');
  document.querySelector('.root').classList.remove('mobile-sidebar-open');
  mobileOverlay.classList.add('hidden');
}
hamburgerBtn.addEventListener('click', ()=> {
  const open = document.querySelector('.root').classList.toggle('mobile-sidebar-open');
  if(open) mobileOverlay.classList.remove('hidden'); else mobileOverlay.classList.add('hidden');
});
mobileOverlay.addEventListener('click', ()=> closeMobileSidebar());

/* ensure toolbar & visibility on load */
setTimeout(()=> {
  renderNotesList();
  updateToolbarState();
  // ensure typing color matches theme on load
  if(activeColor) applyColorForTyping(activeColor);
  else resetColorTyping();
}, 60);
