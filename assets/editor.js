// Admin site editor: change text, photos and colors right on the page. Loaded only for admins on the club pages.
// Saves to the site_content table (and exec_board on the Exec Board page). Layout and animations are not editable.
(function () {
  const SC = window.siteContent;
  if (!SC || document.querySelector('.ed-fab')) return;
  const isExec = SC.page === 'exec-board.html';
  let editing = false, theme = {}, savedTheme = {}, busy = 0;
  const execPending = new Map(); // exec_board id -> { photos: [...] } replaced photo paths

  // ---------- UI ----------
  const ui = document.createElement('div');
  ui.className = 'ed-ui';
  ui.innerHTML = `
    <button class="ed-fab" type="button" title="Edit this page's text, photos and colors"><span aria-hidden="true">✎</span> Edit page</button>
    <div class="ed-bar" role="toolbar" aria-label="Page editor" hidden>
      <div class="ed-status"><b>Editing</b> <span id="edMsg">Click any text to type. Click a photo to replace it.</span></div>
      <div class="ed-actions">
        <button type="button" class="ed-btn" id="edColors" aria-expanded="false">Colors</button>
        <button type="button" class="ed-btn" id="edReset">Reset page</button>
        <button type="button" class="ed-btn" id="edCancel">Cancel</button>
        <button type="button" class="ed-btn ed-save" id="edSave" disabled>Save</button>
      </div>
    </div>
    <div class="ed-colors" id="edPanel" hidden>
      <div class="ed-ph"><b>Site colors</b><span>Changes every page</span></div>
      ${Object.entries(SC.THEME).map(([k, [label, def]]) => `
        <label class="ed-color"><input type="color" data-var="${k}" value="${def}"><span>${label}</span>
          <button type="button" class="ed-mini" data-reset="${k}" title="Back to the original color">↺</button></label>`).join('')}
      <button type="button" class="ed-btn ed-wide" id="edThemeReset">Restore original colors</button>
    </div>
    <div class="ed-pop" id="edPop" hidden>
      <button type="button" class="ed-btn" id="edReplace">Replace photo</button>
      <button type="button" class="ed-btn" id="edOrig">Use original</button>
    </div>
    <input type="file" id="edFile" accept="image/*" hidden>`;
  document.body.appendChild(ui);
  const $e = (s) => ui.querySelector(s);
  const bar = $e('.ed-bar'), fab = $e('.ed-fab'), panel = $e('#edPanel'), pop = $e('#edPop'), fileIn = $e('#edFile');
  const say = (t) => { $e('#edMsg').textContent = t; };

  // ---------- what counts as changed ----------
  const rowOf = (it) => SC.applied.get(it);
  const textNow = (it) => SC.norm(SC.sanitize(it.el.innerHTML));
  const imgNow = (it) => it.cur ?? (rowOf(it)?.value || it.orig);
  function diff() {
    const ups = [], dels = [];
    for (const it of SC.items) {
      if (!it.el.isConnected) continue;
      const row = rowOf(it);
      const now = it.kind === 'text' ? textNow(it) : imgNow(it);
      const base = it.kind === 'text' ? it.origClean : it.orig;
      const saved = row ? (it.kind === 'text' ? SC.norm(SC.sanitize(row.value)) : row.value) : base;
      if (now === saved) continue;
      if (now === base) { if (row) dels.push(row.key); continue; }
      if (it.kind === 'text' && !now) continue; // never save an empty heading; it just goes back on reload
      ups.push({ key: row?.key || SC.keyOf(it), kind: it.kind, page: it.page, scope: it.scope, path: it.path, orig: it.orig,
        value: it.kind === 'text' ? SC.sanitize(it.el.innerHTML).replace(/&nbsp;/g, ' ').trim() : now });
    }
    const themeChanged = JSON.stringify(theme) !== JSON.stringify(savedTheme);
    return { ups, dels, themeChanged, exec: execChanges() };
  }
  function count() {
    const d = diff();
    return d.ups.length + d.dels.length + (d.themeChanged ? 1 : 0) + d.exec.length;
  }
  let t = 0;
  const refresh = () => { clearTimeout(t); t = setTimeout(() => {
    const n = count();
    $e('#edSave').disabled = !n || busy > 0;
    $e('#edSave').textContent = n ? `Save ${n} change${n > 1 ? 's' : ''}` : 'Save';
  }, 120); };

  // ---------- Exec Board (its text and photos live in the exec_board table) ----------
  const execRows = () => (window.execBoard?.rows || []);
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
      if (ph) patch.photos = ph;
      if (Object.keys(patch).length) out.push([r.id, patch]);
    }
    return out;
  }

  // ---------- turning editing on/off ----------
  function textEls() {
    const els = SC.items.filter((i) => i.kind === 'text' && i.el.isConnected).map((i) => i.el);
    if (isExec) els.push(...document.querySelectorAll('#board [data-db]'));
    return els;
  }
  function start() {
    editing = true;
    document.body.classList.add('editing');
    fab.hidden = true; bar.hidden = false;
    for (const el of textEls()) { el.contentEditable = 'true'; el.spellcheck = true; el.setAttribute('data-ed-text', ''); }
    for (const it of SC.items) if (it.kind === 'img' && it.el.isConnected) it.el.setAttribute('data-ed-img', '');
    if (isExec) document.querySelectorAll('#board [data-photo]').forEach((el) => el.setAttribute('data-ed-img', ''));
    let cur = {}; try { cur = JSON.parse(SC.rows.find((r) => r.kind === 'theme')?.value || '{}'); } catch (e) {}
    savedTheme = { ...cur }; theme = { ...cur };
    panel.querySelectorAll('input[data-var]').forEach((inp) => { inp.value = theme[inp.dataset.var] || SC.THEME[inp.dataset.var][1]; });
    refresh();
  }
  function stop() {
    editing = false;
    document.body.classList.remove('editing');
    document.querySelectorAll('[data-ed-text]').forEach((el) => { el.removeAttribute('contenteditable'); el.removeAttribute('data-ed-text'); });
    document.querySelectorAll('[data-ed-img]').forEach((el) => el.removeAttribute('data-ed-img'));
    bar.hidden = true; panel.hidden = true; pop.hidden = true; fab.hidden = false;
    $e('#edColors').setAttribute('aria-expanded', 'false');
  }
  fab.onclick = start;

  // ---------- typing ----------
  document.addEventListener('input', (e) => {
    if (!editing) return;
    const el = e.target.closest?.('[data-ed-text]'); if (!el) return;
    const it = SC.items.find((i) => i.el === el);
    if (it) { const tw = el.parentElement?.parentElement?.classList.contains('band') ? el.parentElement.children[[...el.parentElement.children].indexOf(el) + el.parentElement.children.length / 2] : null; if (tw) tw.innerHTML = el.innerHTML; }
    refresh();
  });
  document.addEventListener('keydown', (e) => {
    if (!editing) return;
    const el = e.target.closest?.('[data-ed-text]'); if (!el) { if (e.key === 'Escape') { pop.hidden = true; panel.hidden = true; } return; }
    if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey && el.tagName !== 'H1' && el.tagName !== 'H2' && !el.dataset.db) document.execCommand('insertLineBreak'); else el.blur(); }
    if (e.key === 'Escape') el.blur();
  });
  document.addEventListener('paste', (e) => {
    if (!editing || !e.target.closest?.('[data-ed-text]')) return;
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
  });

  // ---------- clicks: links don't navigate while editing; photos open the replace menu ----------
  let target = null; // { it } for site photos or { exec: id, idx, el } for exec board photos
  document.addEventListener('click', (e) => {
    if (!editing || ui.contains(e.target)) return;
    const inPage = e.target.closest('main, .site-footer'); if (!inPage) { pop.hidden = true; return; }
    if (e.target.closest('[data-ed-text]')) { e.preventDefault(); pop.hidden = true; return; } // typing, not following the link
    e.preventDefault(); e.stopPropagation();
    let found = null;
    const ex = isExec && e.target.closest('#board [data-photo]');
    if (ex) found = { exec: +ex.closest('article').dataset.id, idx: +ex.dataset.photo, el: ex };
    else for (let el = e.target; el && el !== inPage.parentElement; el = el.parentElement) {
      const it = SC.items.find((i) => i.kind === 'img' && i.el === el);
      if (it) { found = { it, el }; break; }
    }
    if (!found) { pop.hidden = true; return; }
    target = found;
    $e('#edOrig').hidden = !!found.exec || imgNow(found.it) === found.it.orig;
    const r = found.el.getBoundingClientRect();
    pop.hidden = false; openedAt = Date.now();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(innerWidth - pw - 8, r.left + r.width / 2 - pw / 2)) + 'px';
    pop.style.top = Math.max(8, Math.min(innerHeight - ph - 90, (r.top < 0 ? 0 : r.top) + Math.min(r.height, innerHeight) / 2 - ph / 2)) + 'px';
  }, true);
  let openedAt = 0;
  addEventListener('scroll', () => { if (Date.now() - openedAt > 400) pop.hidden = true; }, { passive: true });

  $e('#edReplace').onclick = () => { fileIn.value = ''; fileIn.click(); };
  $e('#edOrig').onclick = () => { const { it } = target; it.cur = it.orig; SC.setImg(it, it.orig); pop.hidden = true; refresh(); };
  fileIn.onchange = async () => {
    const f = fileIn.files[0]; if (!f || !target) return;
    const tg = target; pop.hidden = true; busy++; refresh();
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
        const url = URL.createObjectURL(blob);
        const img = tg.el.querySelector('img');
        if (img) img.src = url; else tg.el.outerHTML = `<button type="button" data-photo="${tg.idx}" data-ed-img><img src="${url}" alt=""></button>`;
      } else {
        const path = `${SC.page.replace('.html', '')}/${id}.${ext}`;
        const { error } = await sb.storage.from('site').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
        if (error) throw error;
        const url = SC.SITE_IMG + path;
        tg.it.cur = url; SC.setImg(tg.it, url);
      }
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

  // ---------- colors ----------
  $e('#edColors').onclick = () => {
    panel.hidden = !panel.hidden; pop.hidden = true;
    $e('#edColors').setAttribute('aria-expanded', String(!panel.hidden));
  };
  const previewTheme = () => SC.applyTheme(JSON.stringify(theme));
  panel.addEventListener('input', (e) => {
    const v = e.target.dataset?.var; if (!v) return;
    if (e.target.value.toLowerCase() === SC.THEME[v][1]) delete theme[v]; else theme[v] = e.target.value.toLowerCase();
    previewTheme(); refresh();
  });
  panel.addEventListener('click', (e) => {
    const k = e.target.dataset?.reset; if (!k) return;
    delete theme[k]; panel.querySelector(`[data-var="${k}"]`).value = SC.THEME[k][1]; previewTheme(); refresh();
  });
  $e('#edThemeReset').onclick = () => {
    theme = {}; panel.querySelectorAll('input[data-var]').forEach((i) => { i.value = SC.THEME[i.dataset.var][1]; }); previewTheme(); refresh();
  };

  // ---------- save / cancel / reset ----------
  $e('#edSave').onclick = async () => {
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
      for (const [id, patch] of d.exec) {
        const { error } = await sb.from('exec_board').update(patch).eq('id', id);
        if (error) throw error;
      }
      if (d.exec.length) { say('Saved! Reloading the board…'); setTimeout(() => location.reload(), 500); return; }
      for (const it of SC.items) delete it.cur;
      await SC.load();
      savedTheme = { ...theme };
      say('Saved! Everyone sees the changes now.');
    } catch (err) {
      say('Couldn’t save: ' + (err.message || err));
    }
    refresh();
  };
  $e('#edCancel').onclick = () => {
    if (count() && !confirm('Throw away the changes you haven’t saved?')) return;
    if (count()) return location.reload();
    stop();
  };
  $e('#edReset').onclick = async () => {
    const mine = SC.rows.filter((r) => r.page === SC.page);
    if (!mine.length && !count()) return say('Nothing on this page has been changed.');
    if (!confirm('Put every text and photo on this page back to the original? (Colors and the footer stay as they are.)')) return;
    if (mine.length) {
      const { error } = await sb.from('site_content').delete().eq('page', SC.page);
      if (error) return say('Couldn’t reset: ' + error.message);
    }
    location.reload();
  };
  addEventListener('beforeunload', (e) => { if (editing && count()) { e.preventDefault(); e.returnValue = ''; } });
})();
