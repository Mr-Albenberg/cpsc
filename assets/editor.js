// Admin site editor: change text, photos, colors, fonts and a few layout touches right on the page.
// Loaded only for admins on the club pages. Saves to site_content (and exec_board on the Exec Board page).
// Animations and the page structure are not editable.
(function () {
  const SC = window.siteContent;
  if (!SC || document.querySelector('.ed-fab')) return;
  const isExec = SC.page === 'exec-board.html';
  const SIZES = [0.75, 0.85, 1, 1.15, 1.3, 1.5, 1.75];
  let editing = false, theme = {}, settings = { list: [] }, savedTheme = '{}', savedSettings = '{"list":[]}', busy = 0;
  let sel = null; // what's selected: { it } (site text/photo), { db: el } (exec text), { exec: id, idx, el } (exec photo)
  let execPending = new Map(); // exec_board id -> replaced photo paths

  // ---------- UI ----------
  const ui = document.createElement('div');
  ui.className = 'ed-ui';
  const fontOpts = (list) => list.map((f, i) => `<option value="${f}">${f}${i ? '' : ' (original)'}</option>`).join('');
  ui.innerHTML = `
    <button class="ed-fab" type="button" title="Edit this page's text, photos, colors and fonts"><span aria-hidden="true">✎</span> Edit page</button>
    <div class="ed-bar" role="toolbar" aria-label="Page editor" hidden>
      <div class="ed-tools" id="edTools" hidden></div>
      <form class="ed-field" id="edField" hidden><label for="edFieldIn" id="edFieldLabel"></label><input id="edFieldIn" autocomplete="off">
        <button type="submit" class="ed-btn ed-save">OK</button><button type="button" class="ed-btn" id="edFieldX">Cancel</button></form>
      <div class="ed-main">
        <div class="ed-hist">
          <button type="button" class="ed-btn ed-ico" id="edUndo" title="Undo (Ctrl/⌘ Z)" aria-label="Undo" disabled>↶</button>
          <button type="button" class="ed-btn ed-ico" id="edRedo" title="Redo (Ctrl/⌘ Shift Z)" aria-label="Redo" disabled>↷</button>
        </div>
        <div class="ed-status"><b>Editing</b> <span id="edMsg">Click any text to type, or a photo to change it.</span></div>
        <div class="ed-actions">
          <button type="button" class="ed-btn" id="edPreview" aria-pressed="false" title="See the page without the edit outlines">Preview</button>
          <button type="button" class="ed-btn" id="edDesign" aria-expanded="false">Colors &amp; fonts</button>
          <button type="button" class="ed-btn" id="edReset">Reset page</button>
          <button type="button" class="ed-btn" id="edCancel">Done</button>
          <button type="button" class="ed-btn ed-save" id="edSave" disabled>Save</button>
        </div>
      </div>
    </div>
    <div class="ed-colors" id="edPanel" hidden>
      <div class="ed-ph"><b>Colors &amp; fonts</b><span>Changes every page</span></div>
      ${Object.entries(SC.THEME).map(([k, [label, def]]) => `
        <label class="ed-color"><input type="color" data-var="${k}" value="${def}"><span>${label}</span>
          <button type="button" class="ed-mini" data-reset="${k}" title="Back to the original color" aria-label="Reset ${label}">↺</button></label>`).join('')}
      <label class="ed-font"><span>Headings &amp; buttons</span><select data-font="font-head">${fontOpts(SC.FONTS.head)}</select></label>
      <label class="ed-font"><span>Body text</span><select data-font="font-body">${fontOpts(SC.FONTS.body)}</select></label>
      <button type="button" class="ed-btn ed-wide" id="edThemeReset">Restore original colors &amp; fonts</button>
    </div>
    <input type="file" id="edFile" accept="image/*" hidden>`;
  document.body.appendChild(ui);
  const $e = (s) => ui.querySelector(s);
  const bar = $e('.ed-bar'), fab = $e('.ed-fab'), panel = $e('#edPanel'), tools = $e('#edTools'), fileIn = $e('#edFile');
  const say = (t) => { $e('#edMsg').textContent = t; };
  // Tool buttons must not steal the text selection
  ui.addEventListener('mousedown', (e) => { if (e.target.closest('.ed-tools button')) e.preventDefault(); });

  // ---------- helpers ----------
  const rowOf = (it) => SC.applied.get(it);
  const textItems = () => SC.items.filter((i) => i.kind === 'text');
  const imgItems = () => SC.items.filter((i) => i.kind === 'img');
  const textNow = (it) => SC.norm(SC.sanitize(it.el.innerHTML));
  const imgNow = (it) => it.cur ?? (rowOf(it)?.value || it.orig);
  const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.keys(x).sort().reduce((o, key) => ((o[key] = x[key]), o), {}) : x));
  const canonSettings = (s) => canon({ list: [...(s.list || [])].sort((a, b) => (a.k + a.s + a.p < b.k + b.s + b.p ? -1 : 1)) });
  const execRows = () => (window.execBoard?.rows || []);
  const blockOf = (it) => {
    const main = document.querySelector('main'), sec = it.el.closest('main > *');
    return sec && sec.parentElement === main ? SC.items.find((i) => i.kind === 'block' && i.el === sec) : null;
  };

  // ---------- page settings (size, alignment, button link, photo description, hidden sections) ----------
  const entryOf = (it) => settings.list.find((e) => e.k === it.kind && e.s === it.scope && e.p === it.path && e.o === it.orig);
  const getSet = (it, f) => entryOf(it)?.[f];
  function setSet(it, f, v) {
    let e = entryOf(it);
    if (!e) { e = { k: it.kind, s: it.scope, p: it.path, o: it.orig }; settings.list.push(e); }
    if (v === undefined || v === null || v === '' || v === false) delete e[f]; else e[f] = v;
    settings.list = settings.list.filter((x) => Object.keys(x).length > 4);
    SC.applySettings(JSON.stringify(settings));
    commit(); updateTools();
  }

  // ---------- what counts as changed ----------
  function execChanges() {
    if (!isExec) return [];
    const out = [];
    for (const r of execRows()) {
      const art = document.querySelector(`article[data-id="${r.id}"]`); if (!art) continue;
      const patch = {};
      art.querySelectorAll('[data-db]').forEach((el) => {
        const f = el.dataset.db, v = SC.norm(el.textContent);
        if (v && v !== SC.norm(r[f] || '')) patch[f] = v;
      });
      const ph = execPending.get(r.id);
      if (ph && canon(ph) !== canon(r.photos)) patch.photos = ph;
      if (Object.keys(patch).length) out.push([r.id, patch]);
    }
    return out;
  }
  function diff() {
    const ups = [], dels = [];
    for (const it of SC.items) {
      if (it.kind === 'block' || !it.el.isConnected) continue;
      const row = rowOf(it);
      const now = it.kind === 'text' ? textNow(it) : imgNow(it);
      const base = it.kind === 'text' ? it.origClean : it.orig;
      const saved = row ? (it.kind === 'text' ? SC.norm(SC.sanitize(row.value)) : row.value) : base;
      if (now === saved) continue;
      if (now === base) { if (row) dels.push(row.key); continue; }
      if (it.kind === 'text' && !now) continue; // never save empty text
      ups.push({ key: row?.key || SC.keyOf(it), kind: it.kind, page: it.page, scope: it.scope, path: it.path, orig: it.orig,
        value: it.kind === 'text' ? SC.sanitize(it.el.innerHTML).replace(/&nbsp;/g, ' ').trim() : now });
    }
    return { ups, dels, themeChanged: canon(theme) !== savedTheme, settingsChanged: canonSettings(settings) !== savedSettings, exec: execChanges() };
  }
  const count = () => { const d = diff(); return d.ups.length + d.dels.length + d.themeChanged + d.settingsChanged + d.exec.length; };
  let rt = 0;
  const refresh = () => { clearTimeout(rt); rt = setTimeout(() => {
    const n = count();
    $e('#edSave').disabled = !n || busy > 0;
    $e('#edSave').textContent = n ? `Save ${n} change${n > 1 ? 's' : ''}` : 'Save';
    $e('#edUndo').disabled = idx <= 0 && !typing;
    $e('#edRedo').disabled = idx >= hist.length - 1;
  }, 80); };

  // ---------- undo / redo (whole-page snapshots) ----------
  let hist = [], idx = -1, typing = 0;
  function snap() {
    return JSON.stringify({
      t: textItems().map((it) => it.el.innerHTML),
      i: imgItems().map((it) => it.cur ?? null),
      th: theme, st: settings,
      x: isExec ? [...document.querySelectorAll('#board [data-db]')].map((e) => e.textContent) : [],
      xp: isExec ? [...document.querySelectorAll('#board .exec-photos')].map((e) => e.innerHTML) : [],
      xq: [...execPending],
    });
  }
  function commit() {
    clearTimeout(typing); typing = 0;
    const s = snap();
    if (hist[idx] === s) return refresh();
    hist = hist.slice(0, idx + 1); hist.push(s);
    if (hist.length > 150) hist.shift();
    idx = hist.length - 1; refresh();
  }
  const flush = () => { if (typing) commit(); };
  function restoreSnap(str) {
    const s = JSON.parse(str);
    textItems().forEach((it, i) => { if (it.el.innerHTML !== s.t[i]) SC.setText(it, s.t[i]); });
    imgItems().forEach((it, i) => {
      const v = s.i[i]; if ((it.cur ?? null) === v) return;
      if (v === null) { delete it.cur; SC.setImg(it, rowOf(it)?.value || it.orig); } else { it.cur = v; SC.setImg(it, v); }
    });
    theme = { ...s.th }; SC.applyTheme(JSON.stringify(theme)); syncDesign();
    settings = JSON.parse(JSON.stringify(s.st)); SC.applySettings(JSON.stringify(settings));
    if (isExec) {
      document.querySelectorAll('#board [data-db]').forEach((e, i) => { if (s.x[i] !== undefined && e.textContent !== s.x[i]) e.textContent = s.x[i]; });
      document.querySelectorAll('#board .exec-photos').forEach((e, i) => { if (s.xp[i] !== undefined && e.innerHTML !== s.xp[i]) e.innerHTML = s.xp[i]; });
      execPending = new Map(s.xq);
    }
    updateTools(); refresh();
  }
  function undo() { flush(); if (idx <= 0) return say('Nothing to undo.'); idx--; restoreSnap(hist[idx]); say('Undone.'); }
  function redo() { flush(); if (idx >= hist.length - 1) return say('Nothing to redo.'); idx++; restoreSnap(hist[idx]); say('Redone.'); }
  $e('#edUndo').onclick = undo;
  $e('#edRedo').onclick = redo;

  // ---------- turning editing on/off ----------
  function markEditable() {
    for (const it of textItems()) if (it.el.isConnected) { it.el.contentEditable = 'true'; it.el.setAttribute('data-ed-text', ''); }
    if (isExec) document.querySelectorAll('#board [data-db]').forEach((el) => { try { el.contentEditable = 'plaintext-only'; } catch (e) { el.contentEditable = 'true'; } el.setAttribute('data-ed-text', ''); });
    for (const it of imgItems()) if (it.el.isConnected) it.el.setAttribute('data-ed-img', '');
    if (isExec) document.querySelectorAll('#board [data-photo]').forEach((el) => el.setAttribute('data-ed-img', ''));
  }
  function start() {
    editing = true;
    document.body.classList.add('editing');
    fab.hidden = true; bar.hidden = false;
    markEditable();
    let t = {}; try { t = JSON.parse(SC.rows.find((r) => r.key === 'theme')?.value || '{}'); } catch (e) {}
    let st = { list: [] }; try { st = JSON.parse(SC.rows.find((r) => r.kind === 'theme' && r.scope === 'page' && r.page === SC.page)?.value || '{"list":[]}'); } catch (e) {}
    if (!Array.isArray(st.list)) st.list = [];
    theme = t; settings = st; savedTheme = canon(theme); savedSettings = canonSettings(settings);
    syncDesign();
    hist = [snap()]; idx = 0;
    select(null); refresh();
  }
  function stop() {
    editing = false;
    document.body.classList.remove('editing', 'ed-preview');
    document.querySelectorAll('[data-ed-text]').forEach((el) => { el.removeAttribute('contenteditable'); el.removeAttribute('data-ed-text'); });
    document.querySelectorAll('[data-ed-img]').forEach((el) => el.removeAttribute('data-ed-img'));
    select(null);
    bar.hidden = true; panel.hidden = true; fab.hidden = false;
    $e('#edDesign').setAttribute('aria-expanded', 'false'); $e('#edPreview').setAttribute('aria-pressed', 'false');
  }
  fab.onclick = start;

  // ---------- selection + context tools ----------
  function select(s) {
    document.querySelectorAll('.ed-sel').forEach((e) => e.classList.remove('ed-sel'));
    sel = s;
    if (s?.el && !s.el.matches('[data-ed-text]')) s.el.classList.add('ed-sel');
    closeField(); updateTools();
  }
  const B = (act, label, title, on) => `<button type="button" class="ed-btn ed-t${on ? ' on' : ''}" data-act="${act}" title="${title}" aria-label="${title}"${on !== undefined ? ` aria-pressed="${!!on}"` : ''}>${label}</button>`;
  function updateTools() {
    if (!sel || !editing) { tools.hidden = true; return; }
    let h = '';
    if (sel.db) {
      h = '<span class="ed-tl">Exec board text</span><span class="ed-note">Plain text — saves to the board.</span>';
    } else if (sel.exec) {
      h = '<span class="ed-tl">Photo</span>' + B('replace', 'Replace photo', 'Replace this photo');
    } else if (sel.it) {
      const it = sel.it, main = it.scope === 'main', blk = main && blockOf(it), a = main && SC.linkOf(it);
      if (it.kind === 'text') {
        h += '<span class="ed-tl">Text</span><span class="ed-grp">' + B('bold', '<b>B</b>', 'Bold') + B('italic', '<i>I</i>', 'Italic')
          + B('mark', '<span class="ed-hl">H</span>', 'Highlight') + B('link', '🔗', 'Link the selected words') + B('clear', 'T̶', 'Clear formatting') + '</span>';
        if (main) {
          const size = getSet(it, 'size') || 1, al = getSet(it, 'align') || '';
          h += '<span class="ed-grp">' + B('smaller', 'A−', 'Smaller text') + `<span class="ed-val">${Math.round(size * 100)}%</span>` + B('bigger', 'A+', 'Bigger text') + '</span>'
            + '<span class="ed-grp">' + B('al-left', '⟸', 'Align left', al === 'left') + B('al-center', '≡', 'Center', al === 'center') + B('al-right', '⟹', 'Align right', al === 'right') + '</span>';
        }
      } else {
        h += '<span class="ed-tl">Photo</span><span class="ed-grp">' + B('replace', 'Replace photo', 'Replace this photo')
          + (imgNow(it) !== it.orig ? B('orig', 'Use original', 'Go back to the original photo') : '')
          + (it.el.tagName === 'IMG' && main ? B('alt', 'Description', 'Describe the photo for screen readers') : '') + '</span>';
      }
      if (a) h += '<span class="ed-grp">' + B('href', 'Button link', 'Change where this goes') + '</span>';
      if (blk) h += '<span class="ed-grp">' + B('hide', getSet(blk, 'hide') ? 'Show section' : 'Hide section', 'Hide or show this whole section', !!getSet(blk, 'hide')) + '</span>';
    }
    tools.innerHTML = h; tools.hidden = !h;
  }

  tools.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act || !sel) return;
    const it = sel.it;
    const editable = it?.kind === 'text' ? it.el : null;
    const inside = () => { const s = getSelection(); return editable && s.rangeCount && editable.contains(s.anchorNode); };
    switch (act) {
      case 'bold': case 'italic':
        if (!inside()) return say('Click into the text and select some words first.');
        document.execCommand(act); commit(); break;
      case 'mark': {
        if (!inside()) return say('Select some words to highlight.');
        const s = getSelection(), m = (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest('mark');
        if (m && editable.contains(m)) m.replaceWith(...m.childNodes);
        else if (!s.isCollapsed) { const t = s.toString(); document.execCommand('insertHTML', false, '<mark>' + esc(t) + '</mark>'); }
        else return say('Select some words to highlight.');
        commit(); break;
      }
      case 'link': {
        if (!inside()) return say('Select the words you want to link.');
        const s = getSelection(), cur = (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest('a');
        if (s.isCollapsed && !(cur && editable.contains(cur) && cur !== editable)) return say('Select the words you want to link.');
        const range = s.getRangeAt(0).cloneRange();
        const url = await ask('Link to', cur && cur !== editable ? cur.getAttribute('href') : 'https://', 'Leave empty to remove the link');
        if (url === null) return;
        s.removeAllRanges(); s.addRange(range); editable.focus();
        if (!url) { if (cur && cur !== editable) cur.replaceWith(...cur.childNodes); }
        else if (!SC.okHref(url)) return say('That link doesn’t look right — use a full https:// address, or a page like events.html.');
        else { document.execCommand('createLink', false, url); editable.querySelectorAll(`a[href="${CSS.escape(url)}"]`).forEach((a) => { if (/^https?:/.test(url)) { a.target = '_blank'; a.rel = 'noopener'; } }); }
        commit(); break;
      }
      case 'clear':
        editable.querySelectorAll('b, strong, i, em, u, mark, a, small, sup, sub').forEach((x) => x.replaceWith(...x.childNodes));
        commit(); say('Formatting cleared.'); break;
      case 'smaller': case 'bigger': {
        const cur = getSet(it, 'size') || 1, i = SIZES.indexOf(cur) < 0 ? 2 : SIZES.indexOf(cur);
        const n = SIZES[Math.max(0, Math.min(SIZES.length - 1, i + (act === 'bigger' ? 1 : -1)))];
        setSet(it, 'size', n === 1 ? null : n); break;
      }
      case 'al-left': case 'al-center': case 'al-right': {
        const v = act.slice(3); setSet(it, 'align', getSet(it, 'align') === v ? null : v); break;
      }
      case 'href': {
        const a = SC.linkOf(it);
        const url = await ask('Goes to', a.getAttribute('href'), 'https://… or a page like join.html');
        if (url === null) return;
        if (url && !SC.okHref(url)) return say('That link doesn’t look right — use a full https:// address, or a page like events.html.');
        const orig = it.origHref ?? a.getAttribute('href');
        setSet(it, 'href', !url || url === orig ? null : url);
        say('Link updated.'); break;
      }
      case 'alt': {
        const v = await ask('Photo description', it.el.getAttribute('alt') || '', 'What’s in the photo?');
        if (v === null) return;
        const orig = it.origAlt ?? (it.el.getAttribute('alt') || '');
        setSet(it, 'alt', v.trim() === orig ? null : v.trim()); break;
      }
      case 'hide': {
        const blk = blockOf(it); setSet(blk, 'hide', !getSet(blk, 'hide'));
        say(getSet(blk, 'hide') ? 'Section hidden — visitors won’t see it after you save (it stays faded here so you can bring it back).' : 'Section is showing again.');
        break;
      }
      case 'replace': fileIn.value = ''; fileIn.click(); break;
      case 'orig': it.cur = it.orig; SC.setImg(it, it.orig); commit(); updateTools(); break;
    }
  });

  // Small inline question box (link address, photo description)
  let fieldDone = null;
  function ask(label, value, placeholder) {
    closeField();
    $e('#edFieldLabel').textContent = label;
    const inp = $e('#edFieldIn'); inp.value = value || ''; inp.placeholder = placeholder || '';
    $e('#edField').hidden = false; inp.focus(); inp.select();
    return new Promise((res) => { fieldDone = res; });
  }
  function closeField(v = null) { if (fieldDone) { const f = fieldDone; fieldDone = null; f(v); } $e('#edField').hidden = true; }
  $e('#edField').onsubmit = (e) => { e.preventDefault(); closeField($e('#edFieldIn').value.trim()); };
  $e('#edFieldX').onclick = () => closeField(null);

  // ---------- typing ----------
  document.addEventListener('focusin', (e) => {
    if (!editing) return;
    const el = e.target.closest?.('[data-ed-text]'); if (!el) return;
    if (el.dataset.db) return select({ db: el, el });
    const it = SC.items.find((i) => i.el === el); if (it && sel?.it !== it) select({ it, el });
  });
  document.addEventListener('input', (e) => {
    if (!editing) return;
    const el = e.target.closest?.('[data-ed-text]'); if (!el) return;
    const row = el.parentElement;
    if (row?.parentElement?.classList.contains('band')) { const k = [...row.children], tw = k[k.indexOf(el) + k.length / 2]; if (tw) tw.innerHTML = el.innerHTML; }
    clearTimeout(typing); typing = setTimeout(commit, 600); refresh();
  });
  document.addEventListener('keydown', (e) => {
    if (!editing) return;
    const inUi = e.target.closest?.('.ed-ui input, .ed-ui select');
    if ((e.metaKey || e.ctrlKey) && !inUi) {
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (k === 'y') { e.preventDefault(); redo(); return; }
    }
    const el = e.target.closest?.('[data-ed-text]');
    if (!el) { if (e.key === 'Escape') { if (!$e('#edField').hidden) closeField(null); else { panel.hidden = true; select(null); } } return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey && !/^H[1-6]$/.test(el.tagName) && !el.dataset.db) document.execCommand('insertLineBreak'); else el.blur();
    }
    if (e.key === 'Escape') el.blur();
  }, true);
  document.addEventListener('paste', (e) => {
    if (!editing || !e.target.closest?.('[data-ed-text]')) return;
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
  });

  // ---------- clicks: links don't navigate while editing; clicking a photo selects it ----------
  document.addEventListener('click', (e) => {
    if (!editing || ui.contains(e.target)) return;
    const inPage = e.target.closest('main, .site-footer'); if (!inPage) return;
    if (e.target.closest('[data-ed-text]')) { e.preventDefault(); return; } // typing, not following the link
    e.preventDefault(); e.stopPropagation();
    const ex = isExec && e.target.closest('#board [data-photo]');
    if (ex) return select({ exec: +ex.closest('article').dataset.id, idx: +ex.dataset.photo, el: ex });
    for (let el = e.target; el && el !== document.body; el = el.parentElement) {
      const it = SC.items.find((i) => i.kind === 'img' && i.el === el);
      if (it) return select({ it, el });
    }
    select(null);
  }, true);

  fileIn.onchange = async () => {
    const f = fileIn.files[0]; if (!f || !sel) return;
    const tg = sel; busy++; refresh();
    say('Uploading photo…');
    try {
      const blob = await shrink(f);
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg', id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      if (tg.exec) {
        const path = `exec/${tg.exec}-${id}.${ext}`;
        const { error } = await sb.storage.from('club').upload(path, blob, { contentType: blob.type });
        if (error) throw error;
        const r = execRows().find((x) => x.id === tg.exec);
        const photos = [...(execPending.get(tg.exec) || r.photos)];
        photos[tg.idx] = path; execPending.set(tg.exec, photos);
        const url = URL.createObjectURL(blob), img = tg.el.querySelector('img');
        if (img) img.src = url;
        else { const b = document.createElement('button'); b.type = 'button'; b.dataset.photo = tg.idx; b.setAttribute('data-ed-img', ''); b.innerHTML = `<img src="${url}" alt="">`; tg.el.replaceWith(b); }
      } else {
        const path = `${SC.page.replace('.html', '')}/${id}.${ext}`;
        const { error } = await sb.storage.from('site').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
        if (error) throw error;
        const url = SC.SITE_IMG + path;
        tg.it.cur = url; SC.setImg(tg.it, url);
      }
      commit(); updateTools();
      say('Photo ready. Save to publish it.');
    } catch (err) {
      say('Upload failed: ' + (err.message || err));
    } finally { busy--; refresh(); }
  };
  // Big phone photos are shrunk before upload (max 2000px)
  async function shrink(file) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const webp = await new Promise((res) => c.toBlob(res, 'image/webp', 0.86));
    if (webp && webp.type === 'image/webp') return webp;
    return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
  }

  // ---------- colors & fonts ----------
  function syncDesign() {
    panel.querySelectorAll('input[data-var]').forEach((i) => { i.value = theme[i.dataset.var] || SC.THEME[i.dataset.var][1]; });
    panel.querySelectorAll('select[data-font]').forEach((s) => { s.value = theme[s.dataset.font] || s.options[0].value; });
  }
  $e('#edDesign').onclick = () => { panel.hidden = !panel.hidden; $e('#edDesign').setAttribute('aria-expanded', String(!panel.hidden)); };
  const previewTheme = () => SC.applyTheme(JSON.stringify(theme));
  panel.addEventListener('input', (e) => {
    const v = e.target.dataset?.var; if (!v) return;
    if (e.target.value.toLowerCase() === SC.THEME[v][1]) delete theme[v]; else theme[v] = e.target.value.toLowerCase();
    previewTheme(); refresh();
  });
  panel.addEventListener('change', (e) => {
    const f = e.target.dataset?.font;
    if (f) { if (e.target.selectedIndex === 0) delete theme[f]; else theme[f] = e.target.value; previewTheme(); }
    if (f || e.target.dataset?.var) commit();
  });
  panel.addEventListener('click', (e) => {
    const k = e.target.dataset?.reset; if (!k) return;
    delete theme[k]; syncDesign(); previewTheme(); commit();
  });
  $e('#edThemeReset').onclick = () => { theme = {}; syncDesign(); previewTheme(); commit(); };

  // ---------- preview / save / done / reset ----------
  $e('#edPreview').onclick = () => {
    const on = document.body.classList.toggle('ed-preview');
    $e('#edPreview').setAttribute('aria-pressed', String(on)); $e('#edPreview').textContent = on ? 'Back to editing' : 'Preview';
    if (on) { select(null); panel.hidden = true; }
  };
  $e('#edSave').onclick = async () => {
    flush();
    const d = diff();
    $e('#edSave').disabled = true; say('Saving…');
    try {
      if (d.ups.length) { const { error } = await sb.from('site_content').upsert(d.ups); if (error) throw error; }
      if (d.dels.length) { const { error } = await sb.from('site_content').delete().in('key', d.dels); if (error) throw error; }
      if (d.themeChanged) {
        const { error } = Object.keys(theme).length
          ? await sb.from('site_content').upsert({ key: 'theme', kind: 'theme', page: '*', scope: 'theme', path: '', orig: '', value: JSON.stringify(theme) })
          : await sb.from('site_content').delete().eq('key', 'theme');
        if (error) throw error;
      }
      if (d.settingsChanged) {
        const key = 'page:' + SC.page;
        const { error } = settings.list.length
          ? await sb.from('site_content').upsert({ key, kind: 'theme', page: SC.page, scope: 'page', path: '', orig: '', value: JSON.stringify(settings) })
          : await sb.from('site_content').delete().eq('key', key);
        if (error) throw error;
      }
      for (const [id, patch] of d.exec) {
        const { error } = await sb.from('exec_board').update(patch).eq('id', id);
        if (error) throw error;
      }
      if (d.exec.length) { say('Saved! Reloading the board…'); setTimeout(() => location.reload(), 500); return; }
      const keep = snap();
      for (const it of SC.items) delete it.cur;
      await SC.load();
      savedTheme = canon(theme); savedSettings = canonSettings(settings);
      if (snap() !== keep) restoreSnap(keep); // keep the page exactly as it was on screen
      hist[idx] = snap();
      say('Saved! Everyone sees the changes now.');
    } catch (err) {
      say('Couldn’t save: ' + (err.message || err));
    }
    refresh();
  };
  $e('#edCancel').onclick = () => {
    flush();
    if (count()) {
      if (!confirm('You have changes that aren’t saved. Throw them away?')) return;
      return location.reload();
    }
    stop();
  };
  $e('#edReset').onclick = async () => {
    const mine = SC.rows.filter((r) => r.page === SC.page);
    if (!mine.length && !count()) return say('Nothing on this page has been changed.');
    if (!confirm('Put every text, photo and layout tweak on this page back to the original? (Colors, fonts and the footer stay as they are.)')) return;
    if (mine.length) {
      const { error } = await sb.from('site_content').delete().eq('page', SC.page);
      if (error) return say('Couldn’t reset: ' + error.message);
    }
    location.reload();
  };
  addEventListener('beforeunload', (e) => { if (editing && count()) { e.preventDefault(); e.returnValue = ''; } });
})();
