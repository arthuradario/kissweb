const supabaseClient = window.supabase.createClient(
    'https://egbtpkskxgeemlqhdumc.supabase.co',
    'sb_publishable_r02WCcbv_raGKbPdcOYn_A_ELeokwwo'
);

/* ══════════════════════════════════════════════════════════
   kissweb — complete enhanced app
══════════════════════════════════════════════════════════ */

// ── helpers ──────────────────────────────────────────────
const $ = id => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 9);
const canvasEl = $('canvas');
const wrap = $('canvas-wrap');

// ── state ────────────────────────────────────────────────
let S = { users: [], currentUser: null, webs: [], currentWebId: null };
let vx = 0, vy = 0, vscale = 1;
let isDC = false, dcStart = null;
let connectingFrom = null;
let addPhoto = null, editPhoto = null;
let selGenderVal = 'female', editGenderVal = 'female';
let nodeEls = {};
let isShared = false, sharedData = null;
let editingId = null, ctxId = null;
let selectedPersonId = null;
let _layoutIdx = 0;
let _tvSort = { field: 'kisses', asc: false };
let _currentTheme = 'claro';

// solo view pan/zoom state
let soloVx = 0, soloVy = 0, soloVs = 1;
let soloPanning = false, soloPanStart = null;

// ── persist ──────────────────────────────────────────────
function save() {
    try {
        localStorage.setItem('kw5', JSON.stringify(S));
    }
    catch (e) {
        console.error('Erro ao salvar no localStorage:', e);
    }
}
function load() {
    try {
        const r = localStorage.getItem('kw5');
        if (r) Object.assign(S, JSON.parse(r));
    } catch (e) {
        console.error('Erro ao carregar do localStorage:', e);
    }
}
function cw() { return S.webs.find(w => w.id === S.currentWebId) || null; }
function myWebs() { return S.webs; }

// ── toast ────────────────────────────────────────────────
function showToast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2400); }

// ── custom dialogs ───────────────────────────────────────
function showAlert(msg, title = 'aviso') { $('alert-title').textContent = title; $('alert-message').textContent = msg; $('alert-modal').classList.add('v'); }
function showConfirm(msg, cb, title = 'confirmar') { $('confirm-title').textContent = title; $('confirm-message').textContent = msg; $('confirm-ok').onclick = () => { $('confirm-modal').classList.remove('v'); cb(); }; $('confirm-modal').classList.add('v'); }
function showInput(msg, def, cb, title = 'renomear', label = 'nome da teia') { $('input-title').textContent = title; $('input-message').textContent = msg; $('input-label').textContent = label; $('input-field').value = def || ''; $('input-ok').onclick = () => { const v = $('input-field').value.trim(); $('input-modal').classList.remove('v'); cb(v); }; $('input-modal').classList.add('v'); setTimeout(() => { $('input-field').focus(); $('input-field').onkeydown = e => { if (e.key === 'Enter') $('input-ok').click(); }; }, 80); }

function normText(v) { return (v || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function centerOnPerson(id) {
    const w = cw(); const p = w?.people.find(x => x.id === id);
    if (!p) return;
    vx = wrap.clientWidth / 2 - p.x * vscale;
    vy = wrap.clientHeight / 2 - p.y * vscale;
    canvasEl.style.transform = `translate(${vx}px,${vy}px) scale(${vscale})`;
    renderLines(cw());
}
function currentConnectedIds(w, id) {
    return new Set(w.connections.flatMap(c => c.a === id ? [c.a, c.b] : c.b === id ? [c.a, c.b] : []));
}
function hideSearchModal() { $('search-modal').classList.remove('v'); }
function closeSearchModal() { hideSearchModal(); }
function openSearchModal() {
    const w = cw(); if (!w) { showToast('nenhuma teia aberta.'); return; }
    $('search-input').value = '';
    $('search-modal').classList.add('v');
    renderSearchResults('');
    setTimeout(() => $('search-input').focus(), 80);
}
function renderSearchResults(q) {
    const w = cw();
    if (!w) return;
    const list = $('search-results');
    list.innerHTML = '';
    const nq = normText(q);
    // 👇 NÃO MOSTRA NADA SE NÃO DIGITAR
    if (!nq) {
        return;
    }
    // 👇 FILTRA POR INÍCIO DO NOME + ORDENA
    const people = [...w.people]
        .filter(p => normText(p.name).startsWith(nq))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));

    if (!people.length) {
        list.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem;padding:12px 2px">nenhum resultado encontrado.</div>';
        return;
    }

    people.forEach((p, idx) => {
        const kc = w.connections.filter(c => c.a === p.id || c.b === p.id).length;

        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'search-result' + (idx === 0 ? ' active' : '');

        const photo = p.photo
            ? `<img class="sr-photo" src="${p.photo}">`
            : `<div class="sr-photo"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`;

        row.innerHTML = `
            ${photo}
            <div class="sr-name">${p.name}</div>
            <div class="sr-meta">${kc} beijo${kc !== 1 ? 's' : ''}</div>
        `;

        row.onclick = () => {
            hideSearchModal();
            selPerson(p.id, true);
        };

        list.appendChild(row);
    });
}
$('search-input')?.addEventListener('input', e => renderSearchResults(e.target.value));
$('search-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        const first = $('search-results').querySelector('.search-result');
        if (first) first.click();
    }
    if (e.key === 'Escape') hideSearchModal();
});

// ── image crop ───────────────────────────────────────────
function cropCircle(dataUrl, size = 200) {
    return new Promise(res => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas'); c.width = c.height = size;
            const ctx = c.getContext('2d');
            const s = Math.min(img.width, img.height);
            ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
            res(c.toDataURL('image/jpeg', .82));
        }; img.src = dataUrl;
    });
}
function handlePhoto(inp, mode) {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async e => {
        const cr = await cropCircle(e.target.result, 200);
        if (mode === 'add') { addPhoto = cr; $('pu-add-prev').innerHTML = `<img class="pu-preview" src="${cr}"><div class="pu-label" style="font-size:.63rem">trocar foto</div>`; }
        else { editPhoto = cr; $('pu-edit-prev').innerHTML = `<img class="pu-preview" src="${cr}"><div class="pu-label" style="font-size:.63rem">trocar foto</div>`; }
    }; r.readAsDataURL(f);
}

// ── gender ───────────────────────────────────────────────
function selGender(g) { selGenderVal = g; $('gbf').className = 'gender-btn' + (g === 'female' ? ' af' : ''); $('gbm').className = 'gender-btn' + (g === 'male' ? ' am' : ''); }
function selEditGender(g) { editGenderVal = g; $('e-gbf').className = 'gender-btn' + (g === 'female' ? ' af' : ''); $('e-gbm').className = 'gender-btn' + (g === 'male' ? ' am' : ''); }

// ── svg icons ────────────────────────────────────────────
const GICONS = {
    female: `<svg viewBox="0 0 24 24" fill="white"><circle cx="12" cy="8" r="5"/><rect x="11" y="13" width="2" height="8" rx="1"/><rect x="8.5" y="18" width="7" height="2" rx="1"/></svg>`,
    male: `<svg viewBox="0 0 24 24" fill="white"><circle cx="9.5" cy="14.5" r="5.5"/><rect x="15.5" y="3" width="5.5" height="2" rx="1"/><rect x="19" y="3" width="2" height="5.5" rx="1"/><line x1="13.5" y1="10.5" x2="19.5" y2="4.5" stroke="white" stroke-width="2.2" stroke-linecap="round"/></svg>`
};
const PERSON_PH = `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.4" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

/* ══ AUTH ═══════════════════════════════════════════════ */
function switchTab(t) {
    document.querySelectorAll('.auth-tab').forEach((b, i) => b.classList.toggle('active', i === (t === 'login' ? 0 : 1)));
    $('form-login').style.display = t === 'login' ? 'flex' : 'none';
    $('form-register').style.display = t === 'register' ? 'flex' : 'none';
}
function doLogin() {
    const email = $('l-email').value.trim().toLowerCase(), pw = $('l-pw').value;
    const u = S.users.find(u => u.email === email && u.password === pw);
    if (!u) { showErr('l-err', 'e-mail ou senha incorretos.'); return; }
    hideErr('l-err'); S.currentUser = { id: u.id, name: u.name, email: u.email }; save(); enterApp();
}
function doRegister() {
    const name = $('r-name').value.trim(), email = $('r-email').value.trim().toLowerCase(), pw = $('r-pw').value;
    if (!name || !email || !pw) { showErr('r-err', 'preencha todos os campos.'); return; }
    if (pw.length < 6) { showErr('r-err', 'senha precisa ter pelo menos 6 caracteres.'); return; }
    if (S.users.find(u => u.email === email)) { showErr('r-err', 'e-mail já cadastrado.'); return; }
    hideErr('r-err');
    const u = { id: uid(), name, email, password: pw }; S.users.push(u);
    S.currentUser = { id: u.id, name: u.name, email: u.email }; save(); enterApp();
}
function doGuest() { S.currentUser = { guest: true, name: 'visitante' }; save(); enterApp(); }
function doLogout() {
    showConfirm('tem certeza que deseja sair da conta?', () => {
        S.currentUser = null; save(); $('user-modal').classList.remove('v');
        hideAppUI(); $('auth-overlay').classList.remove('hidden');
    });
}
function showErr(id, msg) { $(id).textContent = msg; $(id).classList.add('v'); }
function hideErr(id) { $(id).classList.remove('v'); }

function enterApp() {
    console.log("ENTROU NO APP");
    const el = $('algum-id');
    if (el) {
        el.classList.add('hidden');
    }
    showAppUI();
    const u = S.currentUser;
    $('uname').textContent = u.guest ? 'visitante' : u.name;
    $('ua').textContent = u.guest ? '?' : u.name.charAt(0).toUpperCase();
    $('um-name').textContent = u.guest ? 'modo visitante' : u.name;
    $('um-email').textContent = u.guest ? 'sem conta — dados salvos localmente' : u.email;
    if (!myWebs().length) { showNoWebsState(); return; }
    if (!S.currentWebId || !myWebs().find(w => w.id === S.currentWebId)) S.currentWebId = myWebs()[0].id;
    save(); rebuildNodes(); render();
}

//PARTE DE CONTROLE DE VISUALIZAÇÃO E INTERFACE QUANDO NÃO HÁ TEIAS

function showAppUI() {
    ['topbar', 'canvas-wrap', 'zoom-controls', 'btn-export', 'btn-table-view', 'btn-toggle-panel', 'btn-new-web', 'btn-manage-webs'].forEach(id => $(id).style.display = '');
    $('panel').style.display = 'flex'; $('panel-toggle').style.display = 'flex';
    $('empty-state').style.display = '';
    $('panel').classList.add('open'); $('panel-toggle').textContent = '▶';
}
function hideAppUI() {
    ['topbar', 'canvas-wrap', 'zoom-controls', 'panel', 'panel-toggle', 'empty-state', 'btn-export', 'btn-table-view', 'btn-toggle-panel', 'btn-new-web', 'btn-manage-webs'].forEach(id => $(id).style.display = 'none');
}
function showNoWebsState() {
    $('topbar').style.display = '';
    $('canvas-wrap').style.display = 'none';
    $('panel').style.display = 'none';
    $('panel-toggle').style.display = 'none';
    $('zoom-controls').style.display = 'none';
    $('btn-export').style.display = 'none';
    $('btn-table-view').style.display = 'none';
    $('btn-toggle-panel').style.display = 'none';
    $('btn-new-web').style.display = 'none';
    $('btn-manage-webs').style.display = 'none';
    $('empty-state').style.display = 'none';
    $('no-webs-state').classList.add('v');
}
function hideNoWebsState() { $('no-webs-state').classList.remove('v'); }

/* ══ WEB MANAGEMENT ══════════════════════════════════════ */
function createWeb(name, doSave = true) {
    const oid = S.currentUser ? (S.currentUser.guest ? 'guest' : S.currentUser.id) : 'guest';
    const w = { id: uid(), name, ownerId: oid, people: [], connections: [], groups: [], shared: false, shareId: uid(), sharePassword: '', shareAccess: 'free' };
    S.webs.push(w); S.currentWebId = w.id; if (doSave) save(); return w;
}

/* ══ RENDER ══════════════════════════════════════════════ */
function render() { renderTabs(); renderCanvas(); renderPanel(); updateEmpty(); }

function renderTabs() {
    const tabs = $('web-tabs'); tabs.innerHTML = '';
    myWebs().forEach(w => {
        const t = document.createElement('div'); t.className = 'web-tab-container';
        const btn = document.createElement('button');
        btn.className = 'web-tab' + (w.id === S.currentWebId ? ' active' : ''); btn.textContent = w.name;
        btn.onclick = () => switchWeb(w.id);
        btn.addEventListener('contextmenu', e => { e.preventDefault(); showWebCtx(e, w.id); });
        t.appendChild(btn); tabs.appendChild(t);
    });
}

function switchWeb(id) {
    S.currentWebId = id; selectedPersonId = null; save(); hideNoWebsState();
    canvasEl.querySelectorAll('.person').forEach(e => e.remove()); nodeEls = {};
    rebuildNodes(); render();
}

function rebuildNodes() {
    const w = cw(); if (!w) return;
    w.people.forEach(p => {
        if (!nodeEls[p.id]) { const el = makeNode(p); el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; canvasEl.appendChild(el); nodeEls[p.id] = el; }
    });
}

function renderCanvas() {
    const w = cw(); if (!w) return;
    canvasEl.style.transform = `translate(${vx}px,${vy}px) scale(${vscale})`;
    Object.keys(nodeEls).forEach(id => { if (!w.people.find(p => p.id === id)) { nodeEls[id].remove(); delete nodeEls[id]; } });
    const connectedIds = selectedPersonId ? currentConnectedIds(w, selectedPersonId) : new Set();
    w.people.forEach(p => {
        if (!nodeEls[p.id]) { const el = makeNode(p); canvasEl.appendChild(el); nodeEls[p.id] = el; }
        const el = nodeEls[p.id]; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; refreshNode(el, p, connectedIds);
    });
    renderLines(w);
}

/* ── Node ─────────────────────────────────────────────── */
function makeNode(p) {
    const el = document.createElement('div');
    el.className = 'person ' + p.gender; el.dataset.id = p.id;

    // wrapper so badge sits outside circle's overflow:hidden
    const wrap2 = document.createElement('div'); wrap2.className = 'person-node-wrap';
    const circle = document.createElement('div'); circle.className = 'person-circle';

    const photoDiv = document.createElement('div');
    if (p.photo) { const img = document.createElement('img'); img.src = p.photo; photoDiv.appendChild(img); }
    else { photoDiv.className = 'placeholder'; photoDiv.innerHTML = PERSON_PH; }
    circle.appendChild(photoDiv);

    // gender badge REMOVED from inside circle per user request (was causing visual issues)
    // kiss badge is now OUTSIDE circle (in wrap2) so it won't be clipped
    const kb = document.createElement('div'); kb.className = 'kiss-badge';
    wrap2.appendChild(circle); wrap2.appendChild(kb);

    const nm = document.createElement('div'); nm.className = 'person-name'; nm.textContent = p.name;
    el.appendChild(wrap2); el.appendChild(nm);

    // mouse drag
    let dragging = false, offX = 0, offY = 0, moved = false;
    el.addEventListener('mousedown', e => {
        if (e.button === 2 || isShared) return;
        e.stopPropagation(); dragging = true; moved = false;
        const r = canvasEl.getBoundingClientRect();
        offX = (e.clientX - r.left) / vscale - p.x; offY = (e.clientY - r.top) / vscale - p.y;
        el.classList.add('dragging'); e.preventDefault();
    });
    document.addEventListener('mousemove', ev => {
        if (!dragging) return;
        const r = canvasEl.getBoundingClientRect();
        p.x = (ev.clientX - r.left) / vscale - offX; p.y = (ev.clientY - r.top) / vscale - offY;
        el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; moved = true; renderLines(cw());
    });
    document.addEventListener('mouseup', () => { if (!dragging) return; dragging = false; el.classList.remove('dragging'); if (moved) { save(); renderLines(cw()); } });

    // touch drag
    let tOffX = 0, tOffY = 0, tMoved = false, tDragging = false;
    el.addEventListener('touchstart', e => {
        if (isShared) return; e.stopPropagation();
        const touch = e.touches[0]; tDragging = true; tMoved = false;
        const r = canvasEl.getBoundingClientRect();
        tOffX = (touch.clientX - r.left) / vscale - p.x; tOffY = (touch.clientY - r.top) / vscale - p.y;
        el.classList.add('dragging');
    }, { passive: true });
    el.addEventListener('touchmove', e => {
        if (!tDragging) return; e.stopPropagation(); e.preventDefault();
        const touch = e.touches[0]; const r = canvasEl.getBoundingClientRect();
        p.x = (touch.clientX - r.left) / vscale - tOffX; p.y = (touch.clientY - r.top) / vscale - tOffY;
        el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; tMoved = true; renderLines(cw());
    }, { passive: false });
    el.addEventListener('touchend', e => {
        if (!tDragging) return; e.stopPropagation();
        tDragging = false; el.classList.remove('dragging');
        if (tMoved) { save(); renderLines(cw()); }
        else { selPerson(p.id); } // tap = select
    });

    el.addEventListener('contextmenu', e => { if (isShared) return; e.preventDefault(); e.stopPropagation(); showCtx(e, p.id); });
    el.addEventListener('click', e => {
        e.stopPropagation();
        if (connectingFrom && connectingFrom !== p.id) { finishConn(p.id); return; }
        if (!connectingFrom) selPerson(p.id, false);
    });
    refreshNode(el, p); return el;
}

function refreshNode(el, p, connectedIds = new Set()) {
    const wasDragging = el.classList.contains('dragging');
    el.className = 'person ' + p.gender + (connectingFrom === p.id ? ' cs' : '') + (selectedPersonId === p.id ? ' focus' : '') + (selectedPersonId && connectedIds.has(p.id) && selectedPersonId !== p.id ? ' neighbor' : '');
    if (wasDragging) el.classList.add('dragging');
    el.querySelector('.person-name').textContent = p.name;
    const circle = el.querySelector('.person-circle');
    const first = circle.firstChild;
    if (p.photo) {
        if (first && first.tagName === 'IMG') { first.src = p.photo; }
        else { const img = document.createElement('img'); img.src = p.photo; if (first) circle.replaceChild(img, first); else circle.appendChild(img); }
    } else {
        if (first && first.tagName === 'IMG') { const ph = document.createElement('div'); ph.className = 'placeholder'; ph.innerHTML = PERSON_PH; circle.replaceChild(ph, first); }
        else if (first) { first.className = 'placeholder'; first.innerHTML = PERSON_PH; }
    }
    const w = isShared ? sharedData : cw();
    if (w) { const cnt = w.connections.filter(c => c.a === p.id || c.b === p.id).length; const kb = el.querySelector('.kiss-badge'); if (kb) { kb.textContent = cnt; kb.classList.toggle('v', cnt > 0); } }
}

/* ── Lines ─────────────────────────────────────────────── */
function renderLines(w) {
    const svg = $('lines'); svg.innerHTML = ''; if (!w) return;
    w.connections.forEach(conn => {
        const pa = w.people.find(p => p.id === conn.a), pb = w.people.find(p => p.id === conn.b);
        if (!pa || !pb) return;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', pa.x); line.setAttribute('y1', pa.y);
        line.setAttribute('x2', pb.x); line.setAttribute('y2', pb.y);
        let cls = 'kiss-line';
        if (selectedPersonId && (conn.a === selectedPersonId || conn.b === selectedPersonId)) cls += ' active';
        line.setAttribute('class', cls);
        if (!isShared) {
            line.addEventListener('click', e => {
                e.stopPropagation();
                showConfirm(`remover beijo entre ${pa.name} e ${pb.name}?`, () => {
                    w.connections = w.connections.filter(c => c !== conn);
                    save(); renderCanvas(); renderPanel(); showToast('beijo removido');
                });
            });
        }
        svg.appendChild(line);
    });
}

/* ══ AUTO LAYOUT ═════════════════════════════════════════ 
const LAYOUT_NAMES = ['círculo', 'anéis', 'grade', 'estrela', 'espiral', 'aleatório'];
function autoLayout() {
    const w = cw(); if (!w || !w.people.length) { showToast('nenhuma pessoa para organizar.'); return; }
    const n = w.people.length, SP = 220;
    let pos = [];
    const mode = LAYOUT_NAMES[_layoutIdx % LAYOUT_NAMES.length]; _layoutIdx++;
    if (mode === 'círculo') { const r = Math.max(200, n * 38); for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i / n) - Math.PI / 2; pos.push({ x: Math.cos(a) * r, y: Math.sin(a) * r }); } }
    else if (mode === 'anéis') {
        const sorted = [...w.people].sort((a, b) => w.connections.filter(c => c.a === b.id || c.b === b.id).length - w.connections.filter(c => c.a === a.id || c.b === a.id).length);
        let placed = 0, ring = 0; const tmp = [];
        while (placed < n) { if (ring === 0) { tmp.push({ x: 0, y: 0 }); placed++; ring++; } else { const rc = Math.min(Math.round(2.5 * Math.PI * ring), n - placed), rr = ring * SP; for (let i = 0; i < rc && placed < n; i++) { const a = (2 * Math.PI * i / rc) - Math.PI / 2; tmp.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr }); placed++; } ring++; } }
        const idxMap = {}; w.people.forEach((p, i) => { idxMap[p.id] = i; });
        pos = new Array(n); sorted.forEach((p, i) => { pos[idxMap[p.id]] = tmp[i]; });
    } else if (mode === 'grade') { const cols = Math.ceil(Math.sqrt(n)); for (let i = 0; i < n; i++)pos.push({ x: (i % cols - (cols - 1) / 2) * SP, y: (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * SP }); }
    else if (mode === 'estrela') { const arms = Math.min(n, 7), perArm = Math.ceil((n - 1) / arms); pos.push({ x: 0, y: 0 }); let placed = 1; for (let a = 0; a < arms && placed < n; a++) { for (let j = 1; j <= perArm && placed < n; j++) { const angle = (2 * Math.PI * a / arms) - Math.PI / 2; pos.push({ x: Math.cos(angle) * j * SP * .9, y: Math.sin(angle) * j * SP * .9 }); placed++; } } }
    else if (mode === 'espiral') { const c = SP * .55; for (let i = 0; i < n; i++) { const a = i * .85; pos.push({ x: Math.cos(a) * a * c * .4, y: Math.sin(a) * a * c * .4 }); } }
    else { const area = Math.ceil(Math.sqrt(n)) * SP * 1.4; for (let i = 0; i < n; i++)pos.push({ x: (Math.random() - .5) * area, y: (Math.random() - .5) * area }); }
    const vcx = (wrap.clientWidth / 2 - vx) / vscale, vcy = (wrap.clientHeight / 2 - vy) / vscale;
    const from = w.people.map(p => ({ x: p.x, y: p.y }));
    const to = pos.map(p => ({ x: vcx + p.x, y: vcy + p.y }));
    const start = performance.now();
    function ease(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
    function anim(now) {
        const t = Math.min((now - start) / 500, 1), e = ease(t);
        w.people.forEach((p, i) => {
            p.x = from[i].x + (to[i].x - from[i].x) * e; p.y = from[i].y + (to[i].y - from[i].y) * e;
            if (nodeEls[p.id]) { nodeEls[p.id].style.left = p.x + 'px'; nodeEls[p.id].style.top = p.y + 'px'; }
        });
        renderLines(w); if (t < 1) requestAnimationFrame(anim); else { save(); showToast(`layout: ${mode}`); }
    }
    requestAnimationFrame(anim);
} função de auto layout/ organizar automaticamente removida indeterminadamente */

/* ══ TABLE VIEW ══════════════════════════════════════════ */
function openTableView() {
    const w = cw(); if (!w) { showToast('nenhuma teia aberta.'); return; }
    $('table-modal').classList.add('v'); renderTableView(w);
}
function renderTableView(w) {
    if (!w) return;
    const tbody = $('tv-body'); tbody.innerHTML = '';
    const q = ($('tv-search')?.value || '').toLowerCase();
    let people = [...w.people].filter(p => !q || p.name.toLowerCase().includes(q));
    people.sort((a, b) => {
        let va, vb;
        if (_tvSort.field === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
        else if (_tvSort.field === 'kisses') { va = w.connections.filter(c => c.a === a.id || c.b === a.id).length; vb = w.connections.filter(c => c.a === b.id || c.b === b.id).length; }
        else if (_tvSort.field === 'gender') { va = a.gender; vb = b.gender; }
        else { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
        return _tvSort.asc ? (va > vb ? 1 : va < vb ? -1 : 0) : (va < vb ? 1 : va > vb ? -1 : 0);
    });
    people.forEach(p => {
        const kc = w.connections.filter(c => c.a === p.id || c.b === p.id).length;
        const partners = w.connections.filter(c => c.a === p.id || c.b === p.id)
            .map(c => { const oid = c.a === p.id ? c.b : c.a; return w.people.find(x => x.id === oid)?.name || '?'; }).join(', ');
        const gn = (p.groups || []).map(gid => w.groups.find(x => x.id === gid)?.name || '').filter(Boolean).join(', ');
        const tr = document.createElement('tr'); tr.className = 'tv-row';
        const photoHtml = p.photo
            ? `<img src="${p.photo}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;vertical-align:middle">`
            : `<div style="width:32px;height:32px;border-radius:50%;background:${p.gender === 'female' ? 'var(--female-light)' : 'var(--male-light)'};border:2px solid ${p.gender === 'female' ? 'var(--female)' : 'var(--male)'};display:inline-flex;align-items:center;justify-content:center;font-size:.8rem;color:${p.gender === 'female' ? 'var(--female)' : 'var(--male)'}">${p.gender === 'female' ? '♀' : '♂'}</div>`;
        tr.innerHTML = `
      <td style="padding:8px">${photoHtml}</td>
      <td style="padding:8px;font-weight:600;font-size:.84rem;color:var(--text)">${p.name}</td>
      <td style="padding:8px"><span style="font-size:.78rem;padding:4px 10px;border-radius:20px;background:${p.gender === 'female' ? 'var(--female-light)' : 'var(--male-light)'};color:${p.gender === 'female' ? 'var(--female)' : 'var(--male)'};font-weight:600">${p.gender === 'female' ? 'mulher' : 'homem'}</span></td>
      <td style="padding:8px;text-align:center;font-weight:700;font-size:1rem;color:var(--text)">${kc}</td>
      <td style="padding:8px;font-size:.75rem;color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${partners}">${partners || '—'}</td>
      <td style="padding:8px;font-size:.75rem;color:var(--text-muted)">${gn || '—'}</td>
      <td style="padding:8px">
        <div style="display:flex;gap:4px">
          <button onclick="event.stopPropagation();$('table-modal').classList.remove('v');openSoloView('${p.id}')" style="background:none;border:none;cursor:pointer;color:var(--text);font-size:.72rem;padding:3px 8px;border-radius:6px" title="ver teia individual"><span class="material-symbols-outlined">hub</span></button>
          <button onclick="event.stopPropagation();$('table-modal').classList.remove('v');openEdit('${p.id}')" style="background:none;border:none;cursor:pointer;color:var(--text);font-size:.72rem;padding:3px 8px;border-radius:6px" title="editar"><span class="material-symbols-outlined">edit_square</span></button>
          <button onclick="event.stopPropagation();delPerson('${p.id}');renderTableView(cw())" style="background:none;border:none;cursor:pointer;color:var(--accent);font-size:.8rem;padding:3px 7px;border-radius:6px" title="remover"><span class="material-symbols-outlined">delete</span></button>
        </div>
      </td>`;
        tbody.appendChild(tr);
    });
    $('tv-count').textContent = `${people.length} / ${w.people.length} pessoa${w.people.length !== 1 ? 's' : ''}`;
}
let _tvSort2 = { field: 'kisses', asc: false };
function sortTable(field) {
    if (_tvSort.field === field) _tvSort.asc = !_tvSort.asc; else { _tvSort.field = field; _tvSort.asc = field === 'name'; }
    const w = cw(); if (w) renderTableView(w);
    document.querySelectorAll('.tv-th').forEach(th => { const arr = th.querySelector('.sort-arrow'); if (arr) arr.textContent = th.dataset.field === field ? (_tvSort.asc ? '↑' : '↓') : ''; });
}

/* ══ GROUP MEMBER PICKER ═════════════════════════════════ */
function openGroupPicker(gid) {
    const w = cw();
    if (!w) return;

    if (!w.people || !w.people.length) {
        showToast('não há pessoas na teia ainda.');
        return;
    }
    const g = w.groups.find(x => x.id === gid);
    if (!g) return;
    gpLimit = 20;
    gpQuery = '';
    $('gp-title').textContent = `adicionar pessoas ao grupo ${g.name}`;
    $('gp-gid').value = gid;
    renderGroupPicker(w, gid);
    $('group-picker-modal').classList.add('v');
}
function renderGroupPicker(w, gid) {
    const ul = $('gp-list');
    ul.innerHTML = '';

    const g = w.groups.find(x => x.id === gid);
    if (!g) return;

    // 🔍 filtro + ordenação
    let people = [...w.people]
        .filter(p => !gpQuery || normText(p.name).includes(normText(gpQuery)))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));

    const total = people.length;
    people = people.slice(0, gpLimit);

    if (!people.length) {
        ul.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem;text-align:center;padding:20px">nenhum resultado.</div>';
        return;
    }

    people.forEach(p => {
        const inGroup = p.groups && p.groups.includes(gid);

        const li = document.createElement('div');

        li.style.cssText = `
            display:flex;
            align-items:center;
            gap:10px;
            padding:9px 11px;
            border-radius:10px;
            cursor:pointer;
            transition:all .12s;
            margin-bottom:6px;
            background:${inGroup ? g.color + '22' : 'var(--bg)'};
            border:1.5px solid ${inGroup ? g.color : 'var(--border)'};
        `;

        const ph = p.photo
            ? `<img src="${p.photo}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0">`
            : `<div style="width:34px;height:34px;border-radius:50%;background:${p.gender === 'female' ? 'var(--female-light)' : 'var(--male-light)'};border:2px solid ${p.gender === 'female' ? 'var(--female)' : 'var(--male)'};"></div>`;

        li.innerHTML = `
            ${ph}
            <span style="flex:1;font-size:.84rem;font-weight:600;color:var(--text)">
                ${p.name}
            </span>
        `;

        li.onclick = () => {
            if (!p.groups) p.groups = [];

            if (inGroup) {
                p.groups = p.groups.filter(x => x !== gid);
            } else {
                p.groups.push(gid);
            }

            save();
            renderGroupPicker(w, gid);
            renderPanel();
        };

        ul.appendChild(li);
    });
    // 🔽 BOTÃO "CARREGAR MAIS"
    if (gpLimit < total) {
        const more = document.createElement('div');
        more.classList.add('btn-load-more');
        more.innerHTML = '<span class="material-symbols-outlined icone-carregar">refresh</span> carregar mais';
        more.style.cssText = `
            text-align:center;
            padding:10px;
            cursor:pointer;
            color:var(--accent);
            font-weight:600;
        `;
        more.onclick = () => {
            gpLimit += 20;
            renderGroupPicker(w, gid);
        };
        ul.appendChild(more);
    }
}

/* ══ SOLO VIEW (enhanced with pan/zoom/download) ════════ */
let soloSvgData = null; // store nodes for re-render


function openSoloView(pid) {
    const w = cw(); if (!w) return;
    const p = w.people.find(x => x.id === pid); if (!p) return;
    const partners = w.connections.filter(c => c.a === pid || c.b === pid)
        .map(c => w.people.find(x => x.id === (c.a === pid ? c.b : c.a))).filter(Boolean);
    $('solo-title').textContent = `${p.name} — ${partners.length} ${partners.length !== 1 ? 'conexões' : 'conexão'}`;
    soloVx = 0; soloVy = 0; soloVs = 1;
    soloSvgData = { person: p, partners };
    renderSoloSvg();
    $('solo-modal').classList.add('v');
}

function renderSoloSvg() {
    const svg = $('solo-svg'); svg.innerHTML = '';
    if (!soloSvgData) return;
    const { person: p, partners } = soloSvgData;
    const svgEl = svg; const W = svgEl.clientWidth || 520, H = svgEl.clientHeight || 400;
    const cx = W / 2, cy = H / 2, radius = Math.min(W, H) * 0.28;

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${soloVx},${soloVy}) scale(${soloVs})`);

    const mkNode = (person, x, y, size) => {
        const ng = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        ng.setAttribute('transform', `translate(${x},${y})`);
        const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circ.setAttribute('r', size);
        circ.setAttribute('fill', person.gender === 'female' ? getCssVar('--female-light') : getCssVar('--male-light'));
        circ.setAttribute('stroke', person.gender === 'female' ? getCssVar('--female') : getCssVar('--male'));
        circ.setAttribute('stroke-width', '2.5');
        ng.appendChild(circ);
        if (person.photo) {
            const clipId = 'clip_' + person.id + Math.random().toString(36).slice(2);
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
            clipPath.setAttribute('id', clipId);
            const clipCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            clipCircle.setAttribute('r', size - 1.5); clipCircle.setAttribute('cx', '0'); clipCircle.setAttribute('cy', '0');
            clipPath.appendChild(clipCircle); defs.appendChild(clipPath); ng.appendChild(defs);
            const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            image.setAttribute('x', -size); image.setAttribute('y', -size);
            image.setAttribute('width', size * 2); image.setAttribute('height', size * 2);
            image.setAttribute('href', person.photo); image.setAttribute('clip-path', `url(#${clipId})`);
            ng.appendChild(image);
        } else {
            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            icon.setAttribute('x', '0'); icon.setAttribute('y', '0'); icon.setAttribute('text-anchor', 'middle');
            icon.setAttribute('dominant-baseline', 'middle'); icon.setAttribute('font-size', size * .8);
            icon.setAttribute('fill', person.gender === 'female' ? getCssVar('--female') : getCssVar('--male'));
            icon.textContent = person.gender === 'female' ? '♀' : '♂'; ng.appendChild(icon);
        }
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', '0'); label.setAttribute('y', size + 15); label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '11'); label.setAttribute('fill', getCssVar('--text')); label.setAttribute('font-weight', '600');
        label.textContent = person.name.length > 14 ? person.name.slice(0, 13) + '…' : person.name;
        ng.appendChild(label); return ng;
    };

    partners.forEach((partner, i) => {
        const angle = partners.length === 1 ? -Math.PI / 2 : (Math.PI * 2 * i / partners.length) - Math.PI / 2;
        const x = cx + Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', cx); line.setAttribute('y1', cy); line.setAttribute('x2', x); line.setAttribute('y2', y);
        line.setAttribute('stroke', getCssVar('--line')); line.setAttribute('stroke-width', '2'); line.setAttribute('stroke-dasharray', '6 4');
        g.appendChild(line); g.appendChild(mkNode(partner, x, y, 24));
    });
    g.appendChild(mkNode(p, cx, cy, 38));

    if (!partners.length) {
        const nt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        nt.setAttribute('x', cx); nt.setAttribute('y', cy + 72); nt.setAttribute('text-anchor', 'middle');
        nt.setAttribute('fill', getCssVar('--text-muted')); nt.setAttribute('font-size', '13');
        nt.textContent = 'nenhuma conexão ainda'; g.appendChild(nt);
    }
    svg.appendChild(g);
}

function soloZoom(d) { soloVs = Math.max(.3, Math.min(3, soloVs * d)); renderSoloSvg(); }
function soloCenter() { soloVx = 0; soloVy = 0; soloVs = 1; renderSoloSvg(); }

const soloSvgEl = $('solo-svg');
soloSvgEl.addEventListener('mousedown', e => { soloPanning = true; soloPanStart = { x: e.clientX - soloVx, y: e.clientY - soloVy }; soloSvgEl.classList.add('panning'); });
document.addEventListener('mousemove', e => { if (!soloPanning) return; soloVx = e.clientX - soloPanStart.x; soloVy = e.clientY - soloPanStart.y; renderSoloSvg(); });
document.addEventListener('mouseup', () => { soloPanning = false; soloSvgEl.classList.remove('panning'); });
soloSvgEl.addEventListener('wheel', e => { e.preventDefault(); soloZoom(e.deltaY > 0 ? .85 : 1.18); }, { passive: false });

function getCssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function svgToPngDataUrl(svgEl, bgColor) {
    const serializer = new XMLSerializer();
    let svgStr = serializer.serializeToString(svgEl);
    const vars = {
        '--text': getCssVar('--text'),
        '--text-muted': getCssVar('--text-muted'),
        '--line': getCssVar('--line'),
        '--female-light': getCssVar('--female-light'),
        '--male-light': getCssVar('--male-light'),
        '--female': getCssVar('--female'),
        '--male': getCssVar('--male'),
        '--bg': getCssVar('--bg')
    };
    Object.entries(vars).forEach(([k, v]) => { svgStr = svgStr.replace(new RegExp(`var\\(${k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\)`, 'g'), v); });
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    return URL.createObjectURL(blob);
}
async function soloSvgToCanvas() {
    const svg = $('solo-svg');
    const url = svgToPngDataUrl(svg);
    try {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
        const c = document.createElement('canvas');
        c.width = svg.clientWidth * 2; c.height = svg.clientHeight * 2;
        const ctx = c.getContext('2d');
        ctx.scale(2, 2);
        ctx.fillStyle = getCssVar('--bg');
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        return { canvas: c, url };
    } catch (err) {
        URL.revokeObjectURL(url);
        throw err;
    }
}
async function exportSoloAsImage() {
    if (!soloSvgData) return;
    try {
        const { canvas, url } = await soloSvgToCanvas();
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        const pName = soloSvgData?.person?.name || 'solo';
        a.download = `kissweb-${sanitizeFilename(pName)}.png`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('imagem exportada!');
    } catch {
        showToast('falha ao exportar imagem.');
    }
}
async function exportSoloAsPDF() {
    if (!soloSvgData) return;
    if (!window.jspdf) { showAlert('bibliotecas não carregadas. tente novamente.'); return; }
    try {
        const { canvas, url } = await soloSvgToCanvas();
        const imgData = canvas.toDataURL('image/png');
        const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        const pName = soloSvgData?.person?.name || 'solo';
        pdf.save(`kissweb-${sanitizeFilename(pName)}.pdf`);
        URL.revokeObjectURL(url);
        showToast('pdf exportado!');
    } catch {
        showToast('falha ao exportar pdf.');
    }
}
function buildSoloKissData() {
    const base = cw();
    const { person, partners } = soloSvgData || {};
    if (!base || !person) return null;
    const ids = new Set([person.id, ...partners.map(p => p.id)]);
    const people = base.people.filter(p => ids.has(p.id)).map(p => ({ ...p, groups: [...(p.groups || [])] }));
    const connections = base.connections.filter(c => ids.has(c.a) && ids.has(c.b)).map(c => ({ ...c }));
    const groupIds = new Set();
    people.forEach(p => (p.groups || []).forEach(gid => groupIds.add(gid)));
    const groups = base.groups.filter(g => groupIds.has(g.id)).map(g => ({ ...g }));
    return {
        id: uid(),
        name: `${person.name} - teia individual`,
        ownerId: base.ownerId,
        people,
        connections,
        groups,
        shared: false,
        shareId: uid(),
        sharePassword: '',
        shareAccess: 'free'
    };
}
function exportSoloAsFile() {
    const data = buildSoloKissData();
    if (!data) { showToast('não foi possível gerar o arquivo.'); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `kissweb-${sanitizeFilename(data.name)}.kiss`);
    showToast('arquivo exportado!');
}
function toggleSoloExportMenu() { $('solo-export-menu').classList.toggle('v'); }
function hideSoloExportMenu() { $('solo-export-menu').classList.remove('v'); }

/* ══ THEMES ══════════════════════════════════════════════ */
const THEMES = {
    claro: { bg: '#f7f5f2', surface: '#ffffff', text: '#1a1a1a', textMuted: 'rgba(136,136,136,0.8)', accent: '#ff4d6d', male: '#4a90d9', female: '#e8608a', border: '#e8e4df', nameBg: 'rgba(255,255,255,0.9)', nameText: '#1a1a1a' },
    escuro: { bg: '#0f0f12', surface: '#1a1a20', text: '#e8e4df', textMuted: 'rgba(232,228,223,0.7)', accent: '#ff4d6d', male: '#5ba3f5', female: '#f07ab0', border: '#2a2a35', nameBg: '#242430', nameText: '#e8e4df' },
};
function applyTheme(name) {
    const t = THEMES[name] || THEMES.claro; _currentTheme = name;
    const r = document.documentElement.style;
    r.setProperty('--bg', t.bg); r.setProperty('--surface', t.surface);
    r.setProperty('--text', t.text); r.setProperty('--text-muted', t.textMuted); r.setProperty('--accent', t.accent);
    r.setProperty('--male', t.male); r.setProperty('--female', t.female); r.setProperty('--border', t.border);
    r.setProperty('--male-light', t.male + '22'); r.setProperty('--female-light', t.female + '22');
    r.setProperty('--accent-soft', t.accent + '22');
    r.setProperty('--line', 'rgba(180,180,180,0.4)'); r.setProperty('--line-active', t.accent);
    r.setProperty('--name-bg', t.nameBg); r.setProperty('--name-text', t.nameText);
    localStorage.setItem('kw_theme', name); updateThemeIcon();
}
function toggleTheme() { applyTheme(_currentTheme === 'claro' ? 'escuro' : 'claro'); }
function updateThemeIcon() {
    // Buscamos o span que contém o ícone
    const icon = $('btn-theme').querySelector('.material-symbols-outlined');

    if (_currentTheme === 'claro') {
        // Ícone para quando o site ESTÁ no modo claro (Sol)
        icon.innerText = 'light_mode';
    } else {
        // Ícone para quando o site ESTÁ no modo escuro (Lua)
        icon.innerText = 'dark_mode';
    }
}

/* ══ BATCH ADD ════════════════════════════════════════════ */
function openBatchAdd() { $('batch-modal').classList.add('v'); $('batch-input').value = ''; $('batch-preview').innerHTML = ''; }
function parseBatch() {
    const lines = $('batch-input').value.split('\n').map(l => l.trim()).filter(Boolean);
    const prev = $('batch-preview'); prev.innerHTML = '';
    if (!lines.length) { prev.innerHTML = '<div style="color:var(--text-muted);font-size:.75rem">nenhuma entrada válida</div>'; return; }
    lines.forEach(line => {
        const parts = line.split(',').map(s => s.trim());
        const name = parts[0], gender = (parts[1] || '').toLowerCase().startsWith('m') ? 'male' : 'female';
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:.8rem;color:var(--text)';
        div.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${gender === 'female' ? 'var(--female)' : 'var(--male)'};display:inline-block;flex-shrink:0"></span><span>${name}</span><span style="color:var(--text-muted);font-size:.7rem">${gender === 'female' ? '♀' : '♂'}</span>`;
        prev.appendChild(div);
    });
}
function confirmBatchAdd() {
    const w = cw(); if (!w) { showToast('nenhuma teia.'); return; }
    const lines = $('batch-input').value.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const vcx = (wrap.clientWidth / 2 - vx) / vscale, vcy = (wrap.clientHeight / 2 - vy) / vscale;
    lines.forEach((line, i) => {
        const parts = line.split(',').map(s => s.trim());
        const name = parts[0]; if (!name) return;
        const gender = (parts[1] || '').toLowerCase().startsWith('m') ? 'male' : 'female';
        const angle = (2 * Math.PI * i / lines.length) - Math.PI / 2, r = Math.max(180, lines.length * 35);
        const p = { id: uid(), name, gender, photo: null, groups: [], x: vcx + Math.cos(angle) * r, y: vcy + Math.sin(angle) * r };
        w.people.push(p);
        const el = makeNode(p); el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
        canvasEl.appendChild(el); nodeEls[p.id] = el;
    });
    save(); renderLines(w); renderPanel(); updateEmpty();
    $('batch-modal').classList.remove('v');
    showToast(`${lines.length} pessoa${lines.length !== 1 ? 's' : ''} adicionada${lines.length !== 1 ? 's' : ''}!`);
}

/* ══ PANEL ════════════════════════════════════════════════ */
function renderPanel() {
    const w = cw(); if (!w) return;
    // group selector add
    const gs = $('inp-group'); gs.innerHTML = '';
    w.groups.forEach(g => { const o = document.createElement('option'); o.value = g.id; o.textContent = g.name; gs.appendChild(o); });
    renderGroupSelector('group-selector-add', w, 'inp-group');
    // group list
    const gl = $('group-list'); gl.innerHTML = '';
    w.groups.forEach(g => {
        const c = connInGroup(w, g.id), tot = w.people.filter(p => p.groups && p.groups.includes(g.id)).length;
        const item = document.createElement('div'); item.className = 'group-item';
        item.innerHTML = `<div class="group-dot" style="background:${g.color}"></div><div class="group-name">${g.name}</div><div class="group-count">${c}/${tot}</div><button class="group-members-btn" title="gerenciar membros"><span class="material-symbols-outlined">group</span></button><div class="group-del"><span class="material-symbols-outlined">close</span></div>`;
        item.querySelector('.group-members-btn').onclick = e => { e.stopPropagation(); openGroupPicker(g.id); };
        item.querySelector('.group-del').onclick = () => {
            w.groups = w.groups.filter(x => x.id !== g.id);
            w.people.forEach(p => { if (p.groups) p.groups = p.groups.filter(x => x !== g.id); });
            save(); renderPanel();
        };
        gl.appendChild(item);
    });
    // stats
    const tot = w.people.length, kisses = w.connections.length;
    const f = w.people.filter(p => p.gender === 'female').length, m = w.people.filter(p => p.gender === 'male').length;
    $('stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-num">${tot}</div><div class="stat-label">pessoas</div></div>
    <div class="stat-card"><div class="stat-num">${kisses}</div><div class="stat-label">beijos</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--male)">${m}</div><div class="stat-label">homens</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--female)">${f}</div><div class="stat-label">mulheres</div></div>`;
    // group stats
    const gs2 = $('group-stats'); gs2.innerHTML = '';
    w.groups.forEach(g => {
        const mem = w.people.filter(p => p.groups && p.groups.includes(g.id)), c = connInGroup(w, g.id);
        const row = document.createElement('div'); row.className = 'group-item';
        row.innerHTML = `<div class="group-dot" style="background:${g.color}"></div><div class="group-name">${g.name}</div><div class="group-count">${c}/${mem.length} beijou</div>`;
        gs2.appendChild(row);
    });
    // people list
    const pl = $('people-list'); pl.innerHTML = '';
    const sortedPeople = [...w.people].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    sortedPeople.forEach(p => {
        const kc = w.connections.filter(c => c.a === p.id || c.b === p.id).length;
        const gn = (p.groups || []).map(gid => { const g = w.groups.find(x => x.id === gid); return g ? g.name : ''; }).filter(Boolean).join(', ');
        const row = document.createElement('div'); row.className = 'person-row'; row.dataset.id = p.id;
        if (p.id === selectedPersonId) row.classList.add('sel');
        const ph = p.photo ? `<img src="${p.photo}">` : `<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
        row.innerHTML = `<div class="person-row-photo">${ph}</div><div class="person-row-info"><div class="person-row-name">${p.name}</div><div class="person-row-sub">${kc} beijo${kc !== 1 ? 's' : ''}${gn ? ' · ' + gn : ''}</div></div><div class="person-row-del"><span class="material-symbols-outlined">close</span></div>`;
        row.querySelector('.person-row-del').onclick = e => { e.stopPropagation(); delPerson(p.id); };
        row.onclick = () => selPerson(p.id, true);
        // right-click on person row → same ctx menu as canvas
        row.addEventListener('contextmenu', e => { e.preventDefault(); showCtx(e, p.id); });
        pl.appendChild(row);
    });
}

function connInGroup(w, gid) {
    const mem = w.people.filter(p => p.groups && p.groups.includes(gid)).map(p => p.id);
    const seen = new Set(); w.connections.forEach(c => { if (mem.includes(c.a)) seen.add(c.a); if (mem.includes(c.b)) seen.add(c.b); });
    return seen.size;
}

function renderGroupSelector(containerId, w, selectId) {
    const container = $(containerId), select = $(selectId); if (!container || !select) return;
    container.innerHTML = ''; const selectedIds = [...select.selectedOptions].map(o => o.value);
    w.groups.forEach(g => {
        const isChecked = selectedIds.includes(g.id);
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'group-checkbox' + (isChecked ? ' checked' : '');
        if (isChecked) { button.style.borderColor = g.color; button.style.color = g.color; const rgb = parseInt(g.color.slice(1), 16); const r = (rgb >> 16) & 255, gr = (rgb >> 8) & 255, b = rgb & 255; button.style.backgroundColor = `rgba(${r},${gr},${b},0.1)`; }
        button.innerHTML = `<div class="group-checkbox-dot" style="background:${g.color}"></div><span>${g.name}</span>`;
        button.addEventListener('click', () => {
            const option = select.querySelector(`option[value="${g.id}"]`);
            const isNow = option && option.selected;
            if (!isNow) { option.selected = true; button.classList.add('checked'); button.style.borderColor = g.color; button.style.color = g.color; const rgb = parseInt(g.color.slice(1), 16); const r = (rgb >> 16) & 255, gr = (rgb >> 8) & 255, b = rgb & 255; button.style.backgroundColor = `rgba(${r},${gr},${b},0.1)`; }
            else { option.selected = false; button.classList.remove('checked'); button.style.borderColor = ''; button.style.color = ''; button.style.backgroundColor = ''; }
        });
        container.appendChild(button);
    });
}

/* ══ ADD / EDIT / DELETE ════════════════════════════════ */
function addPerson() {
    const w = cw(); const name = $('inp-name').value.trim();
    if (!name) { showToast('digite um nome!'); return; }
    const groups = [...$('inp-group').selectedOptions].map(o => o.value);
    const cx = (wrap.clientWidth / 2 - vx) / vscale + (Math.random() - .5) * 130;
    const cy = (wrap.clientHeight / 2 - vy) / vscale + (Math.random() - .5) * 130;
    const p = {
        id: uid(), name, gender: selGenderVal, photo: addPhoto, groups, x: cx, y: cy,
    // fisica:
    vx: 0, 
    vy: 0, 
    fx: 0, 
    fy: 0
    };
    w.people.push(p); save();
    const el = makeNode(p); el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    canvasEl.appendChild(el); nodeEls[p.id] = el;
    renderLines(w); renderPanel(); updateEmpty();
    $('inp-name').value = ''; addPhoto = null; $('inp-photo').value = ''; $('inp-group').selectedIndex = -1;
    $('pu-add-prev').innerHTML = `<div class="pu-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><div class="pu-label">clique para adicionar foto</div>`;
    renderGroupSelector('group-selector-add', cw(), 'inp-group');
    el.style.opacity = '0'; el.style.transform = 'translate(-50%,-50%) scale(0.4)';
    requestAnimationFrame(() => {
        el.style.transition = 'opacity .2s,transform .28s cubic-bezier(.34,1.56,.64,1)';
        el.style.opacity = '1'; el.style.transform = 'translate(-50%,-50%) scale(1)';
        setTimeout(() => el.style.transition = '', 350);
    });
    showToast(`${name} adicionado${selGenderVal === 'female' ? 'a' : ''}!`);
}

function delPerson(id) {
    const w = cw(); const p = w.people.find(x => x.id === id); if (!p) return;
    showConfirm(`remover ${p.name} e todos os beijos?`, () => {
        w.people = w.people.filter(x => x.id !== id);
        w.connections = w.connections.filter(c => c.a !== id && c.b !== id);
        if (nodeEls[id]) { nodeEls[id].remove(); delete nodeEls[id]; }
        save(); renderLines(w); renderPanel(); updateEmpty(); showToast('pessoa removida');
    });
}

function addGroup() {
    const w = cw(), name = $('inp-gname').value.trim(); if (!name) return;
    const color = $('inp-gcolor').value;
    w.groups.push({ id: uid(), name, color });
    $('inp-gname').value = ''; save(); renderPanel();
    // auto-open picker for the new group
    openGroupPicker(w.groups[w.groups.length - 1].id);
    showToast(`grupo "${name}" criado!`);
}

function openEdit(id) {
    const w = cw(); const p = w.people.find(x => x.id === id); if (!p) return;
    editingId = id; editPhoto = p.photo || null;
    const prev = $('pu-edit-prev');
    if (p.photo) { prev.innerHTML = `<img class="pu-preview" src="${p.photo}"><div class="pu-label" style="font-size:.63rem">trocar foto</div>`; }
    else { prev.innerHTML = `<div class="pu-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><div class="pu-label">adicionar foto</div>`; }
    $('edit-name').value = p.name; selEditGender(p.gender);
    const sel = $('edit-groups'); sel.innerHTML = '';
    w.groups.forEach(g => { const o = document.createElement('option'); o.value = g.id; o.textContent = g.name; if (p.groups && p.groups.includes(g.id)) o.selected = true; sel.appendChild(o); });
    renderGroupSelector('group-selector-edit', w, 'edit-groups');
    $('edit-photo-inp').value = ''; $('edit-modal').classList.add('v');
}

$('edit-save').onclick = () => {
    const w = cw(); const p = w.people.find(x => x.id === editingId); if (!p) return;
    p.name = $('edit-name').value.trim() || p.name; p.gender = editGenderVal; p.photo = editPhoto;
    p.groups = [...$('edit-groups').selectedOptions].map(o => o.value);
    save(); if (nodeEls[p.id]) refreshNode(nodeEls[p.id], p);
    renderLines(w); renderPanel(); $('edit-modal').classList.remove('v'); showToast('salvo! ✓');
};

/* ══ CTX MENU ════════════════════════════════════════════ */
function showCtx(e, id) {
    ctxId = id; const m = $('ctx-menu'); m.classList.add('v');
    let x = e.clientX, y = e.clientY;
    if (x + 175 > window.innerWidth) x = window.innerWidth - 180;
    if (y + 150 > window.innerHeight) y = window.innerHeight - 155;
    m.style.left = x + 'px'; m.style.top = y + 'px'; e.stopPropagation();
}
function hideCtx() { $('ctx-menu').classList.remove('v'); ctxId = null; }
function showWebCtx(e, webId) {
    window._webCtxId = webId; const m = $('web-ctx-menu'); m.classList.add('v');
    let x = e.clientX, y = e.clientY;
    if (x + 155 > window.innerWidth) x = window.innerWidth - 160;
    if (y + 90 > window.innerHeight) y = window.innerHeight - 95;
    m.style.left = x + 'px'; m.style.top = y + 'px'; e.stopPropagation();
}
function hideWebCtx() { $('web-ctx-menu').classList.remove('v'); }

document.addEventListener('click', e => {
    // Fecha o menu de contexto comum
    if (!$('ctx-menu').contains(e.target)) {
        hideCtx();
    }
    // Fecha o menu de contexto web
    if (!$('web-ctx-menu').contains(e.target)) {
        hideWebCtx();
    }
    // Lógica do Menu de Exportação
    const em = $('export-menu');
    const eb = $('btn-export');
    if (em && eb && !eb.contains(e.target) && !em.contains(e.target)) {
        em.classList.remove('v');
    }
    // Lógica do Menu de Exportação Solo
    const sem = $('solo-export-menu');
    const seb = $('solo-export-btn');
    if (sem && seb && !seb.contains(e.target) && !sem.contains(e.target)) {
        sem.classList.remove('v');
    }
});

$('ctx-connect').onclick = () => { const id = ctxId; hideCtx(); if (id) startConn(id); };
$('ctx-edit').onclick = () => { const id = ctxId; hideCtx(); if (id) openEdit(id); };
$('ctx-solo').onclick = () => { const id = ctxId; hideCtx(); if (id) openSoloView(id); };
$('ctx-delete').onclick = () => { const id = ctxId; hideCtx(); if (id) delPerson(id); };
$('web-ctx-rename').onclick = () => { hideWebCtx(); const w = S.webs.find(w => w.id === window._webCtxId); if (w) showInput('', w.name, n => { if (n && n.trim()) { w.name = n.trim(); save(); renderTabs(); } }); };
$('web-ctx-delete').onclick = () => { hideWebCtx(); confirmDeleteWeb(window._webCtxId); };

function confirmDeleteWeb(webId) {
    const w = S.webs.find(w => w.id === webId); if (!w) return;
    showConfirm(`excluir a teia "${w.name}"? esta ação não pode ser desfeita.`, () => {
        showConfirm(`confirme: excluir "${w.name}" permanentemente?`, () => {
            const idx = S.webs.findIndex(w => w.id === webId); if (idx === -1) return;
            const wasCurrent = S.currentWebId === webId; S.webs.splice(idx, 1);
            if (wasCurrent) S.currentWebId = S.webs.length ? S.webs[0].id : null;
            save(); renderTabs();
            if (!S.webs.length) showNoWebsState(); else switchWeb(S.currentWebId);
        });
    });
}

/* ══ CONNECTING ══════════════════════════════════════════ */
function startConn(fromId) {
    connectingFrom = fromId; if (nodeEls[fromId]) nodeEls[fromId].classList.add('cs');
    wrap.classList.add('conn'); $('temp-svg').style.display = 'block'; showToast('clique em outra pessoa para conectar');
}
function cancelConn() {
    if (connectingFrom && nodeEls[connectingFrom]) nodeEls[connectingFrom].classList.remove('cs');
    connectingFrom = null; wrap.classList.remove('conn'); $('temp-svg').style.display = 'none';
}
function finishConn(toId) {
    const w = cw(); const fromId = connectingFrom; cancelConn();
    if (!fromId || fromId === toId) return;
    if (w.connections.some(c => (c.a === fromId && c.b === toId) || (c.a === toId && c.b === fromId))) { showToast('já conectados!'); return; }
    w.connections.push({ id: uid(), a: fromId, b: toId }); save(); renderCanvas(); renderPanel();
    const pa = w.people.find(p => p.id === fromId), pb = w.people.find(p => p.id === toId);
    showToast(`beijo entre ${pa.name} e ${pb.name}`);
}

document.addEventListener('mousemove', e => {
    if (!connectingFrom) return;
    const fe = nodeEls[connectingFrom]; if (!fe) return;
    const r = fe.getBoundingClientRect(); const tl = $('temp-line');
    tl.setAttribute('x1', r.left + r.width / 2); tl.setAttribute('y1', r.top + r.height / 2);
    tl.setAttribute('x2', e.clientX); tl.setAttribute('y2', e.clientY);
});

wrap.addEventListener('click', () => { if (connectingFrom) { cancelConn(); return; } selectedPersonId = null; renderCanvas(); });
document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        openSearchModal();
        return;
    }
    if (e.key === 'Escape') {
        cancelConn(); hideCtx(); hideWebCtx(); hideSearchModal(); hideSoloExportMenu();
        document.querySelectorAll('.modal-overlay.v').forEach(m => m.classList.remove('v'));
    }
});

/* ══ CANVAS PAN & ZOOM ════════════════════════════════════ */
wrap.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target !== wrap && e.target !== canvasEl && e.target.tagName.toLowerCase() !== 'svg') return;
    if (connectingFrom) return;
    isDC = true; dcStart = { x: e.clientX - vx, y: e.clientY - vy }; wrap.classList.add('dc');
});
document.addEventListener('mousemove', e => {
    if (!isDC) return;
    vx = e.clientX - dcStart.x; vy = e.clientY - dcStart.y;
    canvasEl.style.transform = `translate(${vx}px,${vy}px) scale(${vscale})`;
    renderLines(isShared ? sharedData : cw());
});
document.addEventListener('mouseup', () => { isDC = false; wrap.classList.remove('dc'); });
wrap.addEventListener('wheel', e => {
    e.preventDefault(); hideCtx(); hideWebCtx();
    const d = e.deltaY > 0 ? .9 : 1.11, ns = Math.max(.2, Math.min(3, vscale * d));
    const r = wrap.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    vx = mx - (mx - vx) * (ns / vscale); vy = my - (my - vy) * (ns / vscale); vscale = ns;
    canvasEl.style.transform = `translate(${vx}px,${vy}px) scale(${vscale})`;
}, { passive: false });

// Touch pan & pinch zoom for mobile
let _touches = {}, _lastDist = 0;
wrap.addEventListener('touchstart', e => {
    if (e.touches.length === 1 && !connectingFrom) {
        const t = e.touches[0];
        if (e.target === wrap || e.target === canvasEl || e.target.tagName.toLowerCase() === 'svg') {
            isDC = true; dcStart = { x: t.clientX - vx, y: t.clientY - vy };
        }
    }
    if (e.touches.length === 2) {
        _lastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
}, { passive: true });
wrap.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && isDC) {
        const t = e.touches[0]; vx = t.clientX - dcStart.x; vy = t.clientY - dcStart.y;
        canvasEl.style.transform = `translate(${vx}px,${vy}px) scale(${vscale})`;
        renderLines(cw());
    }
    if (e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (_lastDist) {
            const d = dist / _lastDist, ns = Math.max(.2, Math.min(3, vscale * d));
            const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2, my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            vx = mx - (mx - vx) * (ns / vscale); vy = my - (my - vy) * (ns / vscale); vscale = ns;
            canvasEl.style.transform = `translate(${vx}px,${vy}px) scale(${vscale})`;
        }
        _lastDist = dist;
    }
}, { passive: false });
wrap.addEventListener('touchend', () => { isDC = false; _lastDist = 0; });

$('search-open').onclick = () => openSearchModal();
$('zoom-in').onclick = () => applyZoom(1.2);
$('zoom-out').onclick = () => applyZoom(.8);
//$('zoom-reset').onclick = () => { vx = 0; vy = 0; vscale = 1; canvasEl.style.transform = 'translate(0,0) scale(1)'; renderLines(cw()); }; botão removido indeterminadamente, pode ser refeito mais tarde se houver demanda
function applyZoom(d) {
    hideCtx(); hideWebCtx();
    const ns = Math.max(.2, Math.min(3, vscale * d));
    const cx = wrap.clientWidth / 2, cy = wrap.clientHeight / 2;
    vx = cx - (cx - vx) * (ns / vscale); vy = cy - (cy - vy) * (ns / vscale); vscale = ns;
    canvasEl.style.transform = `translate(${vx}px,${vy}px) scale(${vscale})`;
}
$('btn-center').onclick = () => {
    const w = isShared ? sharedData : cw();
    if (!w || !w.people.length) { vx = 0; vy = 0; vscale = 1; canvasEl.style.transform = 'translate(0,0) scale(1)'; return; }
    const xs = w.people.map(p => p.x), ys = w.people.map(p => p.y);
    const cx2 = (Math.min(...xs) + Math.max(...xs)) / 2, cy2 = (Math.min(...ys) + Math.max(...ys)) / 2;
    vx = wrap.clientWidth / 2 - cx2 * vscale; vy = wrap.clientHeight / 2 - cy2 * vscale;
    canvasEl.style.transform = `translate(${vx}px,${vy}px) scale(${vscale})`;
};

/* ══ PANEL TOGGLE ════════════════════════════════════════ */
function togglePanel() {
    const p = $('panel'), b = $('panel-toggle');
    p.classList.toggle('open'); 
    b.textContent = p.classList.contains('open') ? '▶' : '◀'; 
}
$('panel-toggle').onclick = togglePanel;
$('btn-toggle-panel').onclick = togglePanel;

/* ══ EMPTY STATE ══════════════════════════════════════════ */
function updateEmpty() {
    const w = isShared ? sharedData : cw(); const show = !w || !w.people.length;
    const el = $('empty-state'); el.style.opacity = show ? '1' : '0'; el.style.pointerEvents = show ? 'auto' : 'none';
}

function selPerson(id, centerCanvas = false) {
    selectedPersonId = id;
    document.querySelectorAll('.person-row').forEach(r => r.classList.toggle('sel', r.dataset.id === id));
    const row = document.querySelector(`.person-row[data-id="${id}"]`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (centerCanvas) centerOnPerson(id);
    renderCanvas();
}

/* ══ NEW WEB ══════════════════════════════════════════════ */
$('btn-new-web').onclick = () => { $('new-web-name').value = ''; $('new-web-modal').classList.add('v'); setTimeout(() => $('new-web-name').focus(), 80); };
$('btn-create-first-web').onclick = () => { $('new-web-name').value = ''; $('new-web-modal').classList.add('v'); setTimeout(() => $('new-web-name').focus(), 80); };
$('new-web-create').onclick = () => {
    const name = $('new-web-name').value.trim() || 'nova teia';
    createWeb(name); $('new-web-modal').classList.remove('v');
    canvasEl.querySelectorAll('.person').forEach(e => e.remove()); nodeEls = {};
    save(); hideNoWebsState(); showAppUI(); render(); showToast(`teia "${name}" criada!`);
};
$('new-web-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('new-web-create').click(); });

/* ══ SHARE ════════════════════════════════════════════════ */
$('btn-share').onclick = () => { hideWebCtx();const w = cw(); if (!w) return; updateShareUI(w); $('share-modal').classList.add('v'); };
function updateShareUI(w) {
    const on = w.shared; $('share-toggle').classList.toggle('on', on);
    $('share-on').style.display = on ? 'block' : 'none'; $('share-off').style.display = on ? 'none' : 'block';
    if (on) { $('share-link-inp').value = window.location.href.split('?')[0] + `?share=${w.shareId}`; }
    $('acc-free').classList.toggle('active', w.shareAccess !== 'password');
    $('acc-pw').classList.toggle('active', w.shareAccess === 'password');
    $('share-pw-sec').classList.toggle('v', w.shareAccess === 'password');
    $('share-info').textContent = w.shareAccess === 'password' ? 'quem acessar precisará digitar a senha.' : 'qualquer pessoa com o link pode visualizar (somente leitura).';
}
function toggleShare() { const w = cw(); w.shared = !w.shared; persistShare(w); save(); updateShareUI(w); }
function setAccess(m) { const w = cw(); w.shareAccess = m; persistShare(w); save(); updateShareUI(w); }
function savePw() { const w = cw(); w.sharePassword = $('share-pw-inp').value; persistShare(w); save(); showToast('senha salva!'); }
function copyLink() { navigator.clipboard.writeText($('share-link-inp').value).then(() => { const b = $('copy-btn'); b.textContent = '✓ copiado!'; b.classList.add('copied'); setTimeout(() => { b.textContent = 'copiar'; b.classList.remove('copied'); }, 2000); }); }
function persistShare(w) {
    const ownerName = w.ownerId === 'guest' ? 'visitante' : (S.users.find(u => u.id === w.ownerId) || { name: 'alguém' }).name;
    const snap = { id: w.id, name: w.name, ownerName, people: w.people, connections: w.connections, groups: w.groups, shared: w.shared, shareId: w.shareId, sharePassword: w.sharePassword, shareAccess: w.shareAccess };
    localStorage.setItem(`kwsh_${w.shareId}`, JSON.stringify(snap));
}

function checkSharedLink() {
    const p = new URLSearchParams(window.location.search).get('share'); if (!p) return false;
    const raw = localStorage.getItem(`kwsh_${p}`); if (!raw) { showAlert('link inválido ou desativado.'); return false; }
    const data = JSON.parse(raw); if (!data.shared) { showAlert('esta teia não está mais compartilhada.'); return false; }
    if (data.shareAccess === 'password' && data.sharePassword) {
        sharedData = data; const overlay = $('auth-overlay');

        if (overlay) {
            overlay.classList.add('hidden');
        } $('pw-gate').classList.add('v'); return true;
    }
    loadShared(data); return true;
}
function checkGate() {
    const v = $('gate-pw').value;
    if (v === sharedData.sharePassword) { $('pw-gate').classList.remove('v'); loadShared(sharedData); }
    else { showErr('gate-err', 'senha incorreta. tente novamente.'); $('gate-pw').value = ''; }
}
function cancelGate() { $('pw-gate').classList.remove('v'); window.history.replaceState({}, '', window.location.pathname); $('auth-overlay').classList.remove('hidden'); }
function loadShared(data) {
    isShared = true; sharedData = data; selectedPersonId = null; $('auth-overlay').classList.add('hidden');
    ['topbar', 'canvas-wrap', 'zoom-controls'].forEach(id => $(id).style.display = '');
    $('empty-state').style.display = ''; $('panel').style.display = 'none'; $('panel-toggle').style.display = 'none';
    ['btn-new-web', 'btn-share', 'btn-toggle-panel', 'btn-batch-add'/*, 'btn-auto-layout'*/].forEach(id => $(id).style.display = 'none');
    $('shared-owner').textContent = data.ownerName; $('shared-banner').classList.add('v');
    $('canvas-wrap').style.top = '94px'; $('uname').textContent = 'visualizando'; $('ua').textContent = 'V';
    data.people.forEach(p => { const el = makeNode(p); el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; canvasEl.appendChild(el); nodeEls[p.id] = el; });
    renderLines(data); updateEmpty();
}

/* ══ EXPORT / IMPORT ═════════════════════════════════════ */
function toggleExportMenu() {
    console.log("botão exportar clicado");
    $('export-menu').classList.toggle('v');
}
function hideExportMenu() { $('export-menu').classList.remove('v'); }
function toggleSoloExportMenu() { $('solo-export-menu').classList.toggle('v'); }
function hideSoloExportMenu() { $('solo-export-menu').classList.remove('v'); }

//consertar a exportação como imagem e pdf, imagem cortada

async function exportWebAsImage() {
    const w = cw();
    if (!w || w.people.length === 0) return;
    if (typeof html2canvas === 'undefined') { showAlert('Biblioteca não carregada.'); return; }

    try {
        showToast('Enquadrando teia...');

        // 1. Calcular os limites reais (Bounding Box)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        w.people.forEach(p => {
            const el = nodeEls[p.id];
            const nW = el ? el.offsetWidth : 80;
            const nH = el ? el.offsetHeight : 80;
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + nW);
            maxY = Math.max(maxY, p.y + nH);
        });

        const padding = 100;
        const exportW = (maxX - minX) + (padding * 2);
        const exportH = (maxY - minY) + (padding * 2);

        // 2. REPOSICIONAR E "CONGELAR" (Como você pediu, ele não volta ao que era)
        vx = -minX + padding;
        vy = -minY + padding;
        vscale = 1; 
        renderCanvas();

        // 3. O SEGREDO: Forçar o canvasEl a ter o tamanho total da teia
        // Isso impede que o CSS "overflow: hidden" do pai corte a imagem
        const originalWidth = canvasEl.style.width;
        const originalHeight = canvasEl.style.height;
        const originalPosition = canvasEl.style.position;

        canvasEl.style.width = exportW + 'px';
        canvasEl.style.height = exportH + 'px';
        canvasEl.style.position = 'relative'; // Garante que o html2canvas veja o ponto 0,0 corretamente

        // Pequeno delay para o DOM atualizar o novo tamanho
        await new Promise(r => setTimeout(r, 200));

        showToast('Gerando arquivo...');

        const c = await html2canvas(canvasEl, {
            backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#f7f5f2',
            scale: 2,
            useCORS: true,
            // x: 0 e y: 0 agora funcionam porque o canvasEl tem o tamanho exato da teia
            x: 0,
            y: 0,
            width: exportW,
            height: exportH,
            // Estas duas linhas abaixo corrigem o problema de cortar o topo/lateral
            scrollX: 0,
            scrollY: -window.scrollY 
        });

        // 4. Restaurar apenas o estilo de tamanho (a posição vx/vy continua nova)
        canvasEl.style.width = originalWidth;
        canvasEl.style.height = originalHeight;
        canvasEl.style.position = originalPosition;

        const url = c.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `kissweb-${sanitizeFilename(w.name)}.png`;
        a.click();
        showToast('Imagem exportada!');

    } catch (e) {
        console.error(e);
        showToast('Erro ao exportar.');
    }
}

async function exportWebAsPDF() {
    const w = cw();
    if (!w || w.people.length === 0) return;
    if (!window.jspdf) { showAlert('PDF lib não carregada.'); return; }

    try {
        showToast('Enquadrando teia para PDF...');

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        w.people.forEach(p => {
            const el = nodeEls[p.id];
            const nW = el ? el.offsetWidth : 80;
            const nH = el ? el.offsetHeight : 80;
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + nW);
            maxY = Math.max(maxY, p.y + nH);
        });

        const padding = 100;
        const exportW = (maxX - minX) + (padding * 2);
        const exportH = (maxY - minY) + (padding * 2);

        vx = -minX + padding;
        vy = -minY + padding;
        vscale = 1;
        renderCanvas();

        const originalWidth = canvasEl.style.width;
        const originalHeight = canvasEl.style.height;

        canvasEl.style.width = exportW + 'px';
        canvasEl.style.height = exportH + 'px';

        await new Promise(r => setTimeout(r, 200));

        const c = await html2canvas(canvasEl, {
            backgroundColor: '#ffffff',
            scale: 2,
            useCORS: true,
            x: 0,
            y: 0,
            width: exportW,
            height: exportH,
            scrollX: 0,
            scrollY: -window.scrollY
        });

        canvasEl.style.width = originalWidth;
        canvasEl.style.height = originalHeight;

        const imgData = c.toDataURL('image/png');
        const pdf = new window.jspdf.jsPDF({
            orientation: exportW > exportH ? 'landscape' : 'portrait',
            unit: 'px',
            format: [exportW, exportH]
        });

        pdf.addImage(imgData, 'PNG', 0, 0, exportW, exportH);
        pdf.save(`kissweb-${sanitizeFilename(w.name)}.pdf`);
        showToast('PDF exportado!');
    } catch (e) {
        console.error(e);
        showToast('Erro no PDF.');
    }
}
function exportWebAsFile() {
    const w = cw(); if (!w) return;
    const blob = new Blob([JSON.stringify(w, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `kissweb-${sanitizeFilename(w.name)}.kiss`); showToast('arquivo exportado!');
}
function importWebData(data) {
    if (!data || !Array.isArray(data.people) || !Array.isArray(data.connections) || typeof data.name !== 'string') { showToast('arquivo inválido.'); return; }
    const oid = S.currentUser ? (S.currentUser.guest ? 'guest' : S.currentUser.id) : 'guest';
    const w = { ...data, id: uid(), shareId: uid(), ownerId: oid, shared: false, sharePassword: '', shareAccess: 'free' };
    selectedPersonId = null;
    S.webs.push(w); S.currentWebId = w.id; save();
    canvasEl.querySelectorAll('.person').forEach(e => e.remove()); nodeEls = {};
    hideNoWebsState(); showAppUI(); rebuildNodes(); render(); showToast('teia importada!');
}
function handleImportFile(evt) {
    const file = evt.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => { try { importWebData(JSON.parse(e.target.result)); } catch { showToast('falha ao ler o arquivo.'); } evt.target.value = ''; };
    reader.readAsText(file);
}
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
function sanitizeFilename(name) { return (name || 'teia').replace(/[\\/:*?"<>|]/g, '_').trim().replace(/\s+/g, '-').toLowerCase(); }

$('btn-export').onclick = toggleExportMenu;
$('export-img').onclick = () => { hideExportMenu(); exportWebAsImage(); };
$('export-pdf').onclick = () => { hideExportMenu(); exportWebAsPDF(); };
$('export-file').onclick = () => { hideExportMenu(); exportWebAsFile(); };
const triggerImport = () => { 
    if (typeof hideExportMenu === 'function') hideExportMenu(); 
    $('import-file').click(); 
};
if ($('import-file-btn')) {
    $('import-file-btn').onclick = triggerImport;
}
if ($('import-first-file-btn')) {
    $('import-first-file-btn').onclick = triggerImport;
}
$('import-file').addEventListener('change', handleImportFile);
//$('btn-import').onclick = () => $('import-file').click();; removido pois foi integrado ao menu de exportação, pode ser refeito mais tarde se houver demanda
$('solo-export-btn').onclick = e => { e.stopPropagation(); toggleSoloExportMenu(); };
$('solo-export-img').onclick = () => { hideSoloExportMenu(); exportSoloAsImage(); };
$('solo-export-pdf').onclick = () => { hideSoloExportMenu(); exportSoloAsPDF(); };
$('solo-export-file').onclick = () => { hideSoloExportMenu(); exportSoloAsFile(); };

/* ══ BUTTONS ══════════════════════════════════════════════ */
$('btn-add-person').onclick = addPerson;
$('inp-name').addEventListener('keydown', e => { if (e.key === 'Enter') addPerson(); });
$('btn-add-group').onclick = addGroup;
$('inp-gname').addEventListener('keydown', e => { if (e.key === 'Enter') addGroup(); });
//$('btn-auto-layout').onclick = autoLayout; organizar automaticamente retirado temporariamente, pode ser refeito mais tarde se houver demanda e melhorado
$('btn-table-view').onclick = openTableView;
//$('btn-batch-add').onclick = openBatchAdd; adicionar em lote retirado temporariamente
$('btn-theme').onclick = toggleTheme;

// modal click-outside
['edit-modal', 'new-web-modal', 'share-modal', 'user-modal', 'alert-modal', 'confirm-modal',
    'input-modal', 'search-modal', /*'batch-modal',*/ 'group-picker-modal', 'solo-modal'].forEach(id => {
        $(id).addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('v'); });
    }); //batch modal/adicionar em lote retirado temporariamente

/* ══ INIT ════════════════════════════════════════════════ */
function init() {
    load();
    S.currentUser = { guest: true, name: 'visitante' };
    const savedTheme = localStorage.getItem('kw_theme');
    applyTheme(savedTheme && THEMES[savedTheme] ? savedTheme : 'claro');
    if (checkSharedLink()) return;
    if (!S.currentUser) doGuest();
    else enterApp();
}
init();