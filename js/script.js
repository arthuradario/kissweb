// ═══════════════════════════════════════════════════════════════
// js/script.js — Lógica principal do kissweb (versão Supabase)
// Depende de (nesta ordem): supabase.js → auth.js → db.js → account.js
// ESTA É A ÚNICA VERSÃO. Substitui o script.js original por completo.
// ═══════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);
const canvasEl = $('canvas');
const wrap     = $('canvas-wrap');

// ── Estado global ─────────────────────────────────────────────
// O banco é a fonte de verdade. S é o espelho em memória.
let S = { currentUser: null, webs: [], currentWebId: null };

// Estado de UI / canvas (idêntico ao original)
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
let _tvSort    = { field: 'kisses', asc: false };
let _currentTheme = 'claro';
let soloVx = 0, soloVy = 0, soloVs = 1;
let gpLimit = 20, gpQuery = '';

// ── Helpers de estado ─────────────────────────────────────────
function cw()     { return S.webs.find(w => w.id === S.currentWebId) || null; }
function myWebs() { return S.webs; }
const uid = () => Math.random().toString(36).slice(2, 9);

// ── save() — stub vazio ───────────────────────────────────────
// A versão Supabase persiste via chamadas atômicas em db.js.
// Mantemos a função para evitar erros em código que ainda a chama.
// Timer de debounce para salvar posições após drag.
let _movePendingTimers = {};
function save() {
    // Intencional: no-op. Use as funções do db.js diretamente.
}

// ── Carregar dados do usuário ─────────────────────────────────
async function loadUserData(user) {
    const { data, error } = await fetchWebs(user.id);
    if (error) {
        console.error('[script.js] loadUserData: falha ao buscar teias.', error);
        showToast('Erro ao carregar seus dados. Verifique o console.');
        return;
    }
    S.webs = data || [];
}

// ═══ TEMAS ═══════════════════════════════════════════════════
const THEMES = {
    claro: {
        bg: '#f7f5f2', surface: '#ffffff', text: '#1a1a1a',
        textMuted: 'rgba(136,136,136,0.8)', accent: '#ff4d6d',
        male: '#4a90d9', female: '#e8608a', border: '#e8e4df',
        nameBg: 'rgba(255,255,255,0.9)', nameText: '#1a1a1a', bgbtns: '#0c0c0c'
    },
    escuro: {
        bg: '#0f0f12', surface: '#1a1a20', text: '#e8e4df',
        textMuted: 'rgba(232,228,223,0.7)', accent: '#ff4d6d',
        male: '#5ba3f5', female: '#f07ab0', border: '#2a2a35',
        nameBg: '#242430', nameText: '#e8e4df', bgbtns: '#ebebeb'
    }
};
function applyTheme(name) {
    const t = THEMES[name] || THEMES.claro;
    _currentTheme = name;
    const r = document.documentElement.style;
    r.setProperty('--bg',          t.bg);
    r.setProperty('--surface',     t.surface);
    r.setProperty('--text',        t.text);
    r.setProperty('--text-muted',  t.textMuted);
    r.setProperty('--accent',      t.accent);
    r.setProperty('--male',        t.male);
    r.setProperty('--female',      t.female);
    r.setProperty('--border',      t.border);
    r.setProperty('--male-light',  t.male   + '22');
    r.setProperty('--female-light',t.female + '22');
    r.setProperty('--accent-soft', t.accent + '22');
    r.setProperty('--line',        'rgba(180,180,180,0.4)');
    r.setProperty('--line-active', t.accent);
    r.setProperty('--name-bg',     t.nameBg);
    r.setProperty('--name-text',   t.nameText);
    r.setProperty('--bgbtns',      t.bgbtns);
    // Tema de UI salvo no localStorage é aceitável (preferência de display)
    localStorage.setItem('kw_theme', name);
    updateThemeIcon();
}
function toggleTheme() { applyTheme(_currentTheme === 'claro' ? 'escuro' : 'claro'); }
function updateThemeIcon() {
    const btn = $('btn-theme');
    if (!btn) return;
    const icon = btn.querySelector('.material-symbols-outlined');
    if (icon) icon.innerText = _currentTheme === 'claro' ? 'light_mode' : 'dark_mode';
}

// ═══ TOAST / MODAIS ══════════════════════════════════════════
function showToast(m) {
    const t = $('toast');
    if (!t) return;
    t.textContent = m;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 2400);
}

function showAlert(msg, title = 'aviso') {
    $('alert-title').textContent   = title;
    $('alert-message').textContent = msg;
    $('alert-modal').style.zIndex  = '9999';
    $('alert-modal').classList.add('v');
}
function showConfirm(msg, cb, title = 'EXCLUIR') {
    $('confirm-title').textContent   = title;
    $('confirm-message').textContent = msg;
    $('confirm-ok').onclick = () => { $('confirm-modal').classList.remove('v'); cb(); };
    $('confirm-modal').style.zIndex  = '9999';
    $('confirm-modal').classList.add('v');
}
function showInput(msg, def, cb, title = 'RENOMEAR', label = 'nome da teia') {
    $('input-title').textContent   = title;
    $('input-message').textContent = msg;
    $('input-label').textContent   = label;
    $('input-field').value         = def || '';
    $('input-ok').onclick = () => {
        const v = $('input-field').value.trim();
        $('input-modal').classList.remove('v');
        cb(v);
    };
    $('input-modal').style.zIndex = '9999';
    $('input-modal').classList.add('v');
    setTimeout(() => {
        $('input-field').focus();
        $('input-field').onkeydown = e => { if (e.key === 'Enter') $('input-ok').click(); };
    }, 80);
}

// ═══ CONTROLE DE VISIBILIDADE DA UI ══════════════════════════

function showAppUI() {
    ['topbar','canvas-wrap','zoom-controls','btn-export','btn-table-view',
     'btn-toggle-panel','btn-new-web','btn-manage-webs'].forEach(id => {
        const el = $(id);
        if (el) el.style.display = '';
    });
    const panel = $('panel');
    if (panel) { panel.style.display = 'flex'; panel.classList.add('open'); }
    const es = $('empty-state');
    if (es) es.style.display = '';
}

function hideAppUI() {
    ['topbar','canvas-wrap','zoom-controls','panel','empty-state','btn-export',
     'btn-table-view','btn-toggle-panel','btn-new-web','btn-manage-webs'].forEach(id => {
        const el = $(id);
        if (el) el.style.display = 'none';
    });
}

function showNoWebsState() {
    const ids = ['canvas-wrap','panel','zoom-controls','btn-export',
                 'btn-table-view','btn-toggle-panel','btn-new-web',
                 'btn-manage-webs','empty-state'];
    ids.forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
    const topbar = $('topbar');
    if (topbar) topbar.style.display = '';
    const nws = $('no-webs-state');
    if (nws) nws.classList.add('v');
}

function hideNoWebsState() {
    const nws = $('no-webs-state');
    if (nws) nws.classList.remove('v');
}

// ═══ ÍCONES / UTILITÁRIOS ════════════════════════════════════
const GICONS = {
    female: `<svg viewBox="0 0 24 24" fill="white"><circle cx="12" cy="8" r="5"/><rect x="11" y="13" width="2" height="8" rx="1"/><rect x="8.5" y="18" width="7" height="2" rx="1"/></svg>`,
    male:   `<svg viewBox="0 0 24 24" fill="white"><circle cx="9.5" cy="14.5" r="5.5"/><rect x="15.5" y="3" width="5.5" height="2" rx="1"/><rect x="19" y="3" width="2" height="5.5" rx="1"/><line x1="13.5" y1="10.5" x2="19.5" y2="4.5" stroke="white" stroke-width="2.2" stroke-linecap="round"/></svg>`
};
const PERSON_PH = `<span class="material-symbols-outlined" style="font-size:inherit">person</span>`;

function normText(v) {
    return (v||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}

// ═══ GÊNERO ══════════════════════════════════════════════════
function selGender(g) {
    selGenderVal = g;
    const gbf = $('gbf'); const gbm = $('gbm');
    if (gbf) gbf.className = 'gender-btn' + (g === 'female' ? ' af' : '');
    if (gbm) gbm.className = 'gender-btn' + (g === 'male'   ? ' am' : '');
}
function selEditGender(g) {
    editGenderVal = g;
    const egbf = $('e-gbf'); const egbm = $('e-gbm');
    if (egbf) egbf.className = 'gender-btn' + (g === 'female' ? ' af' : '');
    if (egbm) egbm.className = 'gender-btn' + (g === 'male'   ? ' am' : '');
}

// ═══ FOTO / CROP ═════════════════════════════════════════════
function cropCircle(dataUrl, size = 200) {
    return new Promise(res => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = c.height = size;
            const ctx = c.getContext('2d');
            const s = Math.min(img.width, img.height);
            ctx.beginPath();
            ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, (img.width-s)/2, (img.height-s)/2, s, s, 0, 0, size, size);
            res(c.toDataURL('image/jpeg', 0.82));
        };
        img.src = dataUrl;
    });
}
function handlePhoto(inp, mode) {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async e => {
        const cr = await cropCircle(e.target.result, 200);
        if (mode === 'add') {
            addPhoto = cr;
            $('pu-add-prev').innerHTML = `<img class="pu-preview" src="${cr}"><div class="pu-label" style="font-size:.63rem">trocar foto</div>`;
        } else {
            editPhoto = cr;
            $('pu-edit-prev').innerHTML = `<img class="pu-preview" src="${cr}"><div class="pu-label" style="font-size:.63rem">trocar foto</div>`;
        }
    };
    r.readAsDataURL(f);
}

// ═══ RENDER ══════════════════════════════════════════════════
function render() {
    renderTabs();
    renderCanvas();
    renderPanel();
    updateEmpty();
}

function renderTabs() {
    const tabs = $('web-tabs');
    if (!tabs) return;
    tabs.innerHTML = '';
    myWebs().forEach(w => {
        const t   = document.createElement('div');
        t.className = 'web-tab-container';
        const btn = document.createElement('button');
        btn.className = 'web-tab' + (w.id === S.currentWebId ? ' active' : '');
        btn.textContent = w.name;
        btn.onclick = () => { switchWeb(w.id); centerWeb(); };
        btn.addEventListener('contextmenu', e => { e.preventDefault(); showWebCtx(e, w.id); });

        let _tabLongPress = null;
        btn.addEventListener('touchstart', e => {
            const touch = e.touches[0];
            _tabLongPress = setTimeout(() => {
                if (navigator.vibrate) navigator.vibrate(40);
                const fakeEvt = { clientX: touch.clientX, clientY: touch.clientY, stopPropagation: ()=>{}, preventDefault: ()=>{} };
                showWebCtx(fakeEvt, w.id);
                e.preventDefault();
            }, 500);
        }, { passive: true });
        btn.addEventListener('touchmove',   () => clearTimeout(_tabLongPress));
        btn.addEventListener('touchend',    () => clearTimeout(_tabLongPress));
        btn.addEventListener('touchcancel', () => clearTimeout(_tabLongPress));

        t.appendChild(btn);
        tabs.appendChild(t);
    });
}

function switchWeb(id) {
    S.currentWebId    = id;
    selectedPersonId  = null;
    hideNoWebsState();
    canvasEl.querySelectorAll('.person').forEach(e => e.remove());
    Object.keys(nodeEls).forEach(k => delete nodeEls[k]);
    rebuildNodes();
    render();
}

function rebuildNodes() {
    const w = cw(); if (!w) return;
    w.people.forEach(p => {
        if (!nodeEls[p.id]) {
            const el = makeNode(p);
            el.style.left = p.x + 'px';
            el.style.top  = p.y + 'px';
            canvasEl.appendChild(el);
            nodeEls[p.id] = el;
        }
    });
}

function renderCanvas() {
    const w = cw(); if (!w) return;
    canvasEl.style.transform = `translate(${vx}px,${vy}px) scale(${vscale})`;
    // Remove nós de pessoas que já não existem
    Object.keys(nodeEls).forEach(id => {
        if (!w.people.find(p => p.id === id)) { nodeEls[id].remove(); delete nodeEls[id]; }
    });
    const connectedIds = selectedPersonId ? currentConnectedIds(w, selectedPersonId) : new Set();
    w.people.forEach(p => {
        if (!nodeEls[p.id]) {
            const el = makeNode(p);
            canvasEl.appendChild(el);
            nodeEls[p.id] = el;
        }
        const el = nodeEls[p.id];
        el.style.left = p.x + 'px';
        el.style.top  = p.y + 'px';
        refreshNode(el, p, connectedIds);
    });
    renderLines(w);
}

function currentConnectedIds(w, id) {
    return new Set(w.connections.flatMap(c =>
        c.a === id ? [c.a, c.b] : c.b === id ? [c.a, c.b] : []
    ));
}

// ═══ NÓ (PESSOA NO CANVAS) ═══════════════════════════════════
function makeNode(p) {
    const el = document.createElement('div');
    el.className = 'person ' + p.gender;
    el.dataset.id = p.id;

    const wrap2  = document.createElement('div'); wrap2.className  = 'person-node-wrap';
    const circle = document.createElement('div'); circle.className = 'person-circle';
    const photoDiv = document.createElement('div');
    if (p.photo) {
        const img = document.createElement('img'); img.src = p.photo;
        photoDiv.appendChild(img);
    } else {
        photoDiv.className = 'placeholder';
        photoDiv.innerHTML = PERSON_PH;
    }
    circle.appendChild(photoDiv);
    const kb = document.createElement('div'); kb.className = 'kiss-badge';
    wrap2.appendChild(circle); wrap2.appendChild(kb);
    const nm = document.createElement('div'); nm.className = 'person-name'; nm.textContent = p.name;
    el.appendChild(wrap2); el.appendChild(nm);

    // ── Drag (mouse) ──────────────────────────────────────────
    let dragging = false, offX = 0, offY = 0, moved = false;
    el.addEventListener('mousedown', e => {
        if (e.button === 2 || isShared) return;
        e.stopPropagation(); dragging = true; moved = false;
        const r = canvasEl.getBoundingClientRect();
        offX = (e.clientX - r.left) / vscale - p.x;
        offY = (e.clientY - r.top)  / vscale - p.y;
        el.classList.add('dragging'); e.preventDefault();
    });
    document.addEventListener('mousemove', ev => {
        if (!dragging) return;
        const r = canvasEl.getBoundingClientRect();
        p.x = (ev.clientX - r.left) / vscale - offX;
        p.y = (ev.clientY - r.top)  / vscale - offY;
        el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
        moved = true; renderLines(cw());
    });
    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false; el.classList.remove('dragging');
        if (moved) {
            renderLines(cw());
            // Debounce: salva posição no banco 600ms após o drag parar
            if (S.currentUser && !S.currentUser.guest) {
                clearTimeout(_movePendingTimers[p.id]);
                _movePendingTimers[p.id] = setTimeout(() => {
                    movePersonDB(p.id, p.x, p.y);
                }, 600);
            }
        }
    });

    // ── Drag (touch) + long-press ─────────────────────────────
    let tOffX = 0, tOffY = 0, tMoved = false, tDragging = false;
    let _longPressTimer = null;
    el.addEventListener('touchstart', e => {
        if (isShared) return;
        e.stopPropagation();
        const touch = e.touches[0];
        tDragging = true; tMoved = false;
        const r = canvasEl.getBoundingClientRect();
        tOffX = (touch.clientX - r.left) / vscale - p.x;
        tOffY = (touch.clientY - r.top)  / vscale - p.y;
        el.classList.add('dragging');
        _longPressTimer = setTimeout(() => {
            if (!tMoved) {
                if (navigator.vibrate) navigator.vibrate(40);
                const fakeEvt = { clientX: touch.clientX, clientY: touch.clientY, stopPropagation:()=>{}, preventDefault:()=>{} };
                tDragging = false; el.classList.remove('dragging');
                showCtx(fakeEvt, p.id);
            }
        }, 500);
    }, { passive: true });
    el.addEventListener('touchmove', e => {
        if (!tDragging) return;
        if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
        e.stopPropagation(); e.preventDefault();
        const touch = e.touches[0]; const r = canvasEl.getBoundingClientRect();
        p.x = (touch.clientX - r.left) / vscale - tOffX;
        p.y = (touch.clientY - r.top)  / vscale - tOffY;
        el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
        tMoved = true; renderLines(cw());
    }, { passive: false });
    el.addEventListener('touchend', e => {
        if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
        if (!tDragging) return;
        e.stopPropagation(); tDragging = false; el.classList.remove('dragging');
        if (tMoved) {
            renderLines(cw());
            if (S.currentUser && !S.currentUser.guest) {
                clearTimeout(_movePendingTimers[p.id]);
                _movePendingTimers[p.id] = setTimeout(() => movePersonDB(p.id, p.x, p.y), 600);
            }
        } else { selPerson(p.id); }
    });
    el.addEventListener('touchcancel', () => {
        if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
        tDragging = false; el.classList.remove('dragging');
    });

    el.addEventListener('contextmenu', e => { if (isShared) return; e.preventDefault(); e.stopPropagation(); showCtx(e, p.id); });
    el.addEventListener('click', e => {
        e.stopPropagation();
        if (connectingFrom && connectingFrom !== p.id) { finishConn(p.id); return; }
        if (!connectingFrom) selPerson(p.id, false);
    });

    refreshNode(el, p);
    return el;
}

function refreshNode(el, p, connectedIds = new Set()) {
    const wasDragging = el.classList.contains('dragging');
    el.className = 'person ' + p.gender
        + (connectingFrom === p.id ? ' cs' : '')
        + (selectedPersonId === p.id ? ' focus' : '')
        + (selectedPersonId && connectedIds.has(p.id) && selectedPersonId !== p.id ? ' neighbor' : '');
    if (wasDragging) el.classList.add('dragging');
    el.querySelector('.person-name').textContent = p.name;
    const circle = el.querySelector('.person-circle');
    const first  = circle.firstChild;
    if (p.photo) {
        if (first && first.tagName === 'IMG') { first.src = p.photo; }
        else {
            const img = document.createElement('img'); img.src = p.photo;
            if (first) circle.replaceChild(img, first); else circle.appendChild(img);
        }
    } else {
        if (first && first.tagName === 'IMG') {
            const ph = document.createElement('div'); ph.className = 'placeholder'; ph.innerHTML = PERSON_PH;
            circle.replaceChild(ph, first);
        } else if (first) { first.className = 'placeholder'; first.innerHTML = PERSON_PH; }
    }
    const w = isShared ? sharedData : cw();
    if (w) {
        const cnt = w.connections.filter(c => c.a === p.id || c.b === p.id).length;
        const kb  = el.querySelector('.kiss-badge');
        if (kb) { kb.textContent = cnt; kb.classList.toggle('v', cnt > 0); }
    }
}

// ═══ LINHAS (SVG) ════════════════════════════════════════════
function renderLines(w) {
    const svg = $('lines');
    if (!svg) return;
    svg.innerHTML = ''; if (!w) return;
    w.connections.forEach(conn => {
        const pa = w.people.find(p => p.id === conn.a);
        const pb = w.people.find(p => p.id === conn.b);
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
                showConfirm(`remover beijo entre ${pa.name} e ${pb.name}?`, async () => {
                    const localW = cw(); if (!localW) return;
                    // Remove do banco (usuário autenticado)
                    if (S.currentUser && !S.currentUser.guest) {
                        const { error } = await deleteConnectionDB(conn.id);
                        if (error) return;
                    }
                    localW.connections = localW.connections.filter(c => c.id !== conn.id);
                    renderCanvas(); renderPanel(); showToast('beijo removido');
                });
            });
        }
        svg.appendChild(line);
    });
}

// ═══ PANEL ═══════════════════════════════════════════════════
function renderPanel() {
    const w = cw(); if (!w) return;

    // Selector de grupo no formulário de adicionar pessoa
    const gs = $('inp-group');
    if (gs) {
        gs.innerHTML = '';
        w.groups.forEach(g => {
            const o = document.createElement('option'); o.value = g.id; o.textContent = g.name;
            gs.appendChild(o);
        });
        renderGroupSelector('group-selector-add', w, 'inp-group');
    }

    // Lista de grupos
    const gl = $('group-list');
    if (gl) {
        gl.innerHTML = '';
        w.groups.forEach(g => {
            const c   = connInGroup(w, g.id);
            const tot = w.people.filter(p => p.groups && p.groups.includes(g.id)).length;
            const item = document.createElement('div'); item.className = 'group-item';
            item.innerHTML = `<div class="group-dot" style="background:${g.color}"></div><div class="group-name">${g.name}</div><div class="group-count">${c}/${tot}</div><button class="group-members-btn" title="gerenciar membros"><span class="material-symbols-outlined">group</span></button><div class="group-del"><span class="material-symbols-outlined">close</span></div>`;
            item.querySelector('.group-members-btn').onclick = e => { e.stopPropagation(); openGroupPicker(g.id); };
            item.querySelector('.group-del').onclick = async () => {
                // Remove do banco
                if (S.currentUser && !S.currentUser.guest) {
                    const { error } = await deleteGroupDB(g.id);
                    if (error) return;
                }
                w.groups = w.groups.filter(x => x.id !== g.id);
                w.people.forEach(p => { if (p.groups) p.groups = p.groups.filter(x => x !== g.id); });
                renderPanel();
            };
            gl.appendChild(item);
        });
    }

    // Estatísticas
    const tot    = w.people.length;
    const kisses = w.connections.length;
    const f      = w.people.filter(p => p.gender === 'female').length;
    const m      = w.people.filter(p => p.gender === 'male').length;
    const sg = $('stats-grid');
    if (sg) sg.innerHTML = `
        <div class="stat-card"><div class="stat-num">${tot}</div><div class="stat-label">pessoas</div></div>
        <div class="stat-card"><div class="stat-num">${kisses}</div><div class="stat-label">beijos</div></div>
        <div class="stat-card"><div class="stat-num" style="color:var(--male)">${m}</div><div class="stat-label">homens</div></div>
        <div class="stat-card"><div class="stat-num" style="color:var(--female)">${f}</div><div class="stat-label">mulheres</div></div>`;

    // Lista de pessoas
    const pl = $('people-list');
    if (pl) {
        pl.innerHTML = '';
        const sortedPeople = [...w.people].sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
        sortedPeople.forEach(p => {
            const kc = w.connections.filter(c => c.a === p.id || c.b === p.id).length;
            const gn = (p.groups||[]).map(gid => {
                const g = w.groups.find(x => x.id === gid);
                return g ? g.name : '';
            }).filter(Boolean).join(', ');
            const row = document.createElement('div'); row.className = 'person-row'; row.dataset.id = p.id;
            if (p.id === selectedPersonId) row.classList.add('sel');
            const ph = p.photo
                ? `<img src="${p.photo}">`
                : `<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
            row.innerHTML = `<div class="person-row-photo">${ph}</div><div class="person-row-info"><div class="person-row-name">${p.name}</div><div class="person-row-sub">${kc} beijo${kc!==1?'s':''}${gn?' · '+gn:''}</div></div><div class="person-row-del"><span class="material-symbols-outlined">close</span></div>`;
            row.querySelector('.person-row-del').onclick = e => { e.stopPropagation(); delPerson(p.id); };
            row.onclick = () => selPerson(p.id, true);
            row.addEventListener('contextmenu', e => { e.preventDefault(); showCtx(e, p.id); });

            let _rowLongPress = null;
            row.addEventListener('touchstart', e => {
                const touch = e.touches[0];
                _rowLongPress = setTimeout(() => {
                    if (navigator.vibrate) navigator.vibrate(40);
                    const fakeEvt = { clientX:touch.clientX, clientY:touch.clientY, stopPropagation:()=>{}, preventDefault:()=>{} };
                    e.preventDefault(); showCtx(fakeEvt, p.id);
                }, 500);
            }, { passive: true });
            row.addEventListener('touchmove',   () => clearTimeout(_rowLongPress));
            row.addEventListener('touchend',    () => clearTimeout(_rowLongPress));
            row.addEventListener('touchcancel', () => clearTimeout(_rowLongPress));

            pl.appendChild(row);
        });
    }
}

function connInGroup(w, gid) {
    const mem  = w.people.filter(p => p.groups && p.groups.includes(gid)).map(p => p.id);
    const seen = new Set();
    w.connections.forEach(c => {
        if (mem.includes(c.a)) seen.add(c.a);
        if (mem.includes(c.b)) seen.add(c.b);
    });
    return seen.size;
}

function renderGroupSelector(containerId, w, selectId) {
    const container = $(containerId), select = $(selectId); if (!container || !select) return;
    container.innerHTML = '';
    const selectedIds = [...select.selectedOptions].map(o => o.value);
    w.groups.forEach(g => {
        const isChecked = selectedIds.includes(g.id);
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'group-checkbox' + (isChecked ? ' checked' : '');
        if (isChecked) {
            button.style.borderColor = g.color; button.style.color = g.color;
            const rgb = parseInt(g.color.slice(1), 16);
            const r2 = (rgb>>16)&255, g2=(rgb>>8)&255, b2=rgb&255;
            button.style.backgroundColor = `rgba(${r2},${g2},${b2},0.1)`;
        }
        button.innerHTML = `<div class="group-checkbox-dot" style="background:${g.color}"></div><span>${g.name}</span>`;
        button.addEventListener('click', () => {
            const option = select.querySelector(`option[value="${g.id}"]`);
            const isNow  = option && option.selected;
            if (!isNow) {
                if (option) option.selected = true;
                button.classList.add('checked');
                button.style.borderColor = g.color; button.style.color = g.color;
                const rgb = parseInt(g.color.slice(1), 16);
                const r2=(rgb>>16)&255, g2=(rgb>>8)&255, b2=rgb&255;
                button.style.backgroundColor = `rgba(${r2},${g2},${b2},0.1)`;
            } else {
                if (option) option.selected = false;
                button.classList.remove('checked');
                button.style.borderColor = ''; button.style.color = ''; button.style.backgroundColor = '';
            }
        });
        container.appendChild(button);
    });
}

// ═══ EMPTY STATE ═════════════════════════════════════════════
function updateEmpty() {
    const w  = isShared ? sharedData : cw();
    const show = !w || !w.people.length;
    const el = $('empty-state');
    if (!el) return;
    el.style.opacity      = show ? '1' : '0';
    el.style.pointerEvents = show ? 'auto' : 'none';
}

// ═══ SELECIONAR PESSOA ════════════════════════════════════════
function selPerson(id, centerCanvas = false) {
    selectedPersonId = id;
    document.querySelectorAll('.person-row').forEach(r => r.classList.toggle('sel', r.dataset.id === id));
    const row = document.querySelector(`.person-row[data-id="${id}"]`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (centerCanvas) centerOnPerson(id);
    renderCanvas();
}

function centerOnPerson(id) {
    const w = cw(); const p = w && w.people.find(x => x.id === id);
    if (!p) return;
    vx = wrap.clientWidth  / 2 - p.x * vscale;
    vy = wrap.clientHeight / 2 - p.y * vscale;
    canvasEl.style.transform = `translate(${vx}px,${vy}px) scale(${vscale})`;
    renderLines(cw());
}

// ═══ BUSCA ════════════════════════════════════════════════════
function hideSearchModal()  { $('search-modal').classList.remove('v'); }
function closeSearchModal() { hideSearchModal(); }
function openSearchModal() {
    const w = cw(); if (!w) { showToast('nenhuma teia aberta.'); return; }
    $('search-input').value = '';
    $('search-modal').classList.add('v');
    renderSearchResults('');
    setTimeout(() => $('search-input').focus(), 80);
}
function renderSearchResults(q) {
    const w = cw(); if (!w) return;
    const list = $('search-results'); list.innerHTML = '';
    const nq = normText(q);
    if (!nq) return;
    const people = [...w.people]
        .filter(p => normText(p.name).startsWith(nq))
        .sort((a,b) => (a.name||'').localeCompare(b.name||'','pt-BR',{sensitivity:'base'}));
    if (!people.length) {
        list.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem;padding:12px 2px">nenhum resultado encontrado.</div>';
        return;
    }
    people.forEach((p, idx) => {
        const kc  = w.connections.filter(c => c.a === p.id || c.b === p.id).length;
        const row = document.createElement('button'); row.type = 'button';
        row.className = 'search-result' + (idx === 0 ? ' active' : '');
        const photo = p.photo
            ? `<img class="sr-photo" src="${p.photo}">`
            : `<div class="sr-photo"><span class="material-symbols-outlined">person</span></div>`;
        row.innerHTML = `${photo}<div class="sr-name">${p.name}</div><div class="sr-meta">${kc} beijo${kc!==1?'s':''}</div>`;
        row.onclick = () => { hideSearchModal(); selPerson(p.id, true); };
        list.appendChild(row);
    });
}
$('search-input')?.addEventListener('input', e => renderSearchResults(e.target.value));
$('search-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const first = $('search-results').querySelector('.search-result'); if (first) first.click(); }
    if (e.key === 'Escape') hideSearchModal();
});

// ═══ ADD / EDIT / DELETE ════════════════════════════════════

async function addPerson() {
    const w = cw(); if (!w) return;
    const name   = $('inp-name').value.trim();
    if (!name) { showToast('digite um nome!'); return; }
    const groups = [...$('inp-group').selectedOptions].map(o => o.value);
    const cx = (wrap.clientWidth  / 2 - vx) / vscale + (Math.random() - 0.5) * 130;
    const cy = (wrap.clientHeight / 2 - vy) / vscale + (Math.random() - 0.5) * 130;

    let person;
    if (S.currentUser && !S.currentUser.guest) {
        const { data, error } = await addPersonDB({ webId: w.id, name, gender: selGenderVal, photo: addPhoto || null, x: cx, y: cy, notes: '' });
        if (error) return;
        person = { ...data, groups };
        // Salvar grupos no banco
        for (const gid of groups) {
            await addPersonToGroupDB(person.id, gid);
        }
    } else {
        person = { id: uid(), name, gender: selGenderVal, photo: addPhoto || null, groups, x: cx, y: cy, notes: '', vx:0,vy:0,fx:0,fy:0 };
    }

    w.people.push(person);
    const el = makeNode(person);
    el.style.left = person.x + 'px'; el.style.top = person.y + 'px';
    canvasEl.appendChild(el); nodeEls[person.id] = el;

    // Animação de entrada
    el.style.opacity = '0'; el.style.transform = 'translate(-50%,-50%) scale(0.4)';
    requestAnimationFrame(() => {
        el.style.transition = 'opacity .2s,transform .28s cubic-bezier(.34,1.56,.64,1)';
        el.style.opacity = '1'; el.style.transform = 'translate(-50%,-50%) scale(1)';
        setTimeout(() => el.style.transition = '', 350);
    });

    renderLines(w); renderPanel(); updateEmpty();
    $('inp-name').value = ''; addPhoto = null;
    const inp = $('inp-photo'); if (inp) inp.value = '';
    const prevEl = $('pu-add-prev');
    if (prevEl) prevEl.innerHTML = `<div class="pu-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><div class="pu-label">clique para adicionar foto</div>`;
    renderGroupSelector('group-selector-add', w, 'inp-group');
    selGender('female');
    showToast(`${name} adicionado${selGenderVal === 'female' ? 'a' : ''}!`);
}

async function delPerson(id) {
    const w = cw(); const p = w && w.people.find(x => x.id === id); if (!p) return;
    showConfirm(`remover ${p.name} e todos os beijos?`, async () => {
        if (S.currentUser && !S.currentUser.guest) {
            const { error } = await deletePersonDB(id);
            if (error) return;
        }
        w.people      = w.people.filter(x => x.id !== id);
        w.connections = w.connections.filter(c => c.a !== id && c.b !== id);
        if (nodeEls[id]) { nodeEls[id].remove(); delete nodeEls[id]; }
        renderLines(w); renderPanel(); updateEmpty(); showToast('pessoa removida');
    });
}

async function addGroup() {
    const w = cw(); const name = $('inp-gname').value.trim(); if (!name) return;
    const color = $('inp-gcolor') ? $('inp-gcolor').value : '#4a90e2';
    let group;
    if (S.currentUser && !S.currentUser.guest) {
        const { data, error } = await addGroupDB(w.id, name, color);
        if (error) return;
        group = data;
    } else {
        group = { id: uid(), name, color };
    }
    w.groups.push(group);
    $('inp-gname').value = '';
    renderPanel();
    openGroupPicker(group.id);
    showToast(`grupo "${name}" criado!`);
}

function openEdit(id) {
    const w = cw(); const p = w && w.people.find(x => x.id === id); if (!p) return;
    editingId = id; editPhoto = p.photo || null;
    const prev = $('pu-edit-prev');
    if (p.photo) {
        prev.innerHTML = `<img class="pu-preview" src="${p.photo}"><div class="pu-label" style="font-size:.63rem">trocar foto</div>`;
    } else {
        prev.innerHTML = `<div class="pu-icon"><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><div class="pu-label">adicionar foto</div>`;
    }
    $('edit-name').value = p.name; selEditGender(p.gender);
    const sel = $('edit-groups'); sel.innerHTML = '';
    w.groups.forEach(g => {
        const o = document.createElement('option'); o.value = g.id; o.textContent = g.name;
        if (p.groups && p.groups.includes(g.id)) o.selected = true;
        sel.appendChild(o);
    });
    renderGroupSelector('group-selector-edit', w, 'edit-groups');
    const epInp = $('edit-photo-inp'); if (epInp) epInp.value = '';
    $('edit-modal').classList.add('v');
}

if ($('edit-save')) {
    $('edit-save').onclick = async () => {
        const w = cw(); const p = w && w.people.find(x => x.id === editingId); if (!p) return;
        const newName   = $('edit-name').value.trim() || p.name;
        const newGroups = [...$('edit-groups').selectedOptions].map(o => o.value);
        const oldGroups = p.groups || [];

        p.name   = newName;
        p.gender = editGenderVal;
        p.photo  = editPhoto;
        p.groups = newGroups;

        if (S.currentUser && !S.currentUser.guest) {
            const { error } = await updatePersonDB(p.id, { name: newName, gender: editGenderVal, photo: editPhoto, notes: p.notes || '' });
            if (error) return;
            // Sincroniza grupos: remove os que saíram, adiciona os novos
            const toRemove = oldGroups.filter(g => !newGroups.includes(g));
            const toAdd    = newGroups.filter(g => !oldGroups.includes(g));
            for (const gid of toRemove) await removePersonFromGroupDB(p.id, gid);
            for (const gid of toAdd)    await addPersonToGroupDB(p.id, gid);
        }

        if (nodeEls[p.id]) refreshNode(nodeEls[p.id], p);
        renderLines(w); renderPanel(); $('edit-modal').classList.remove('v'); showToast('salvo! ✓');
    };
}

// ═══ MENU DE CONTEXTO ════════════════════════════════════════
function showCtx(e, id) {
    ctxId = id; const m = $('ctx-menu'); m.classList.add('v');
    let x = e.clientX, y = e.clientY;
    if (x + 175 > window.innerWidth)  x = window.innerWidth  - 180;
    if (y + 150 > window.innerHeight) y = window.innerHeight - 155;
    m.style.left = x + 'px'; m.style.top = y + 'px'; e.stopPropagation();
}
function hideCtx() { $('ctx-menu').classList.remove('v'); ctxId = null; }
function showWebCtx(e, webId) {
    window._webCtxId = webId; const m = $('web-ctx-menu'); m.classList.add('v');
    let x = e.clientX, y = e.clientY;
    if (x + 155 > window.innerWidth)  x = window.innerWidth  - 160;
    if (y + 90  > window.innerHeight) y = window.innerHeight - 95;
    m.style.left = x + 'px'; m.style.top = y + 'px'; e.stopPropagation();
}
function hideWebCtx() { $('web-ctx-menu').classList.remove('v'); }

document.addEventListener('click', e => {
    if ($('ctx-menu')     && !$('ctx-menu').contains(e.target))     hideCtx();
    if ($('web-ctx-menu') && !$('web-ctx-menu').contains(e.target)) hideWebCtx();
    const em = $('export-menu'), eb = $('btn-export');
    if (em && eb && !eb.contains(e.target) && !em.contains(e.target)) em.classList.remove('v');
});
document.addEventListener('touchstart', e => {
    if ($('ctx-menu')     && !$('ctx-menu').contains(e.target))     hideCtx();
    if ($('web-ctx-menu') && !$('web-ctx-menu').contains(e.target)) hideWebCtx();
    const em = $('export-menu'), eb = $('btn-export');
    if (em && eb && !eb.contains(e.target) && !em.contains(e.target)) em.classList.remove('v');
}, { passive: true });

if ($('ctx-connect')) $('ctx-connect').onclick = () => { const id = ctxId; hideCtx(); if (id) startConn(id); };
if ($('ctx-edit'))    $('ctx-edit').onclick    = () => { const id = ctxId; hideCtx(); if (id) openEdit(id); };
if ($('ctx-delete'))  $('ctx-delete').onclick  = () => { const id = ctxId; hideCtx(); if (id) delPerson(id); };
if ($('web-ctx-rename')) {
    $('web-ctx-rename').onclick = () => {
        hideWebCtx();
        const w = S.webs.find(w => w.id === window._webCtxId);
        if (w) showInput('', w.name, async n => {
            if (n && n.trim()) {
                w.name = n.trim();
                if (S.currentUser && !S.currentUser.guest) await renameWebDB(w.id, w.name);
                renderTabs();
            }
        });
    };
}
if ($('web-ctx-delete')) $('web-ctx-delete').onclick = () => { hideWebCtx(); confirmDeleteWeb(window._webCtxId); };

// ═══ CRIAR / EXCLUIR TEIAS ═══════════════════════════════════
async function createWeb(name) {
    if (S.currentUser && !S.currentUser.guest) {
        const { data, error } = await createWebDB(S.currentUser.id, name);
        if (error) return null;
        S.webs.push(data); S.currentWebId = data.id; return data;
    } else {
        const w = { id: uid(), name, ownerId: 'guest', people: [], connections: [], groups: [] };
        S.webs.push(w); S.currentWebId = w.id; return w;
    }
}

function confirmDeleteWeb(webId) {
    const w = S.webs.find(w => w.id === webId); if (!w) return;
    showConfirm(`excluir a teia "${w.name}"? esta ação não pode ser desfeita.`, () => {
        showConfirm(`confirme: excluir "${w.name}" permanentemente?`, async () => {
            if (S.currentUser && !S.currentUser.guest) {
                const { error } = await deleteWebDB(webId);
                if (error) return;
            }
            const wasCurrent = S.currentWebId === webId;
            S.webs = S.webs.filter(w => w.id !== webId);
            if (wasCurrent) S.currentWebId = S.webs.length ? S.webs[0].id : null;
            renderTabs(); renderWebsTableView();
            if (!S.webs.length) { canvasEl.querySelectorAll('.person').forEach(e=>e.remove()); Object.keys(nodeEls).forEach(k=>delete nodeEls[k]); showNoWebsState(); }
            else if (S.currentWebId) switchWeb(S.currentWebId);
        });
    });
}

// ═══ CONEXÕES ════════════════════════════════════════════════
function startConn(fromId) {
    connectingFrom = fromId;
    if (nodeEls[fromId]) nodeEls[fromId].classList.add('cs');
    wrap.classList.add('conn');
    $('temp-svg').style.display = 'block';
    showToast('clique em outra pessoa para conectar');
}
function cancelConn() {
    if (connectingFrom && nodeEls[connectingFrom]) nodeEls[connectingFrom].classList.remove('cs');
    connectingFrom = null; wrap.classList.remove('conn');
    $('temp-svg').style.display = 'none';
}
async function finishConn(toId) {
    const w = cw(); const fromId = connectingFrom; cancelConn();
    if (!fromId || fromId === toId) return;
    if (w.connections.some(c => (c.a===fromId&&c.b===toId)||(c.a===toId&&c.b===fromId))) { showToast('já conectados!'); return; }

    let conn;
    if (S.currentUser && !S.currentUser.guest) {
        const { data, error } = await addConnectionDB(w.id, fromId, toId);
        if (error) return; conn = data;
    } else {
        conn = { id: uid(), a: fromId, b: toId };
    }
    w.connections.push(conn);
    renderCanvas(); renderPanel();
    const pa = w.people.find(p => p.id === fromId), pb = w.people.find(p => p.id === toId);
    if (pa && pb) showToast(`beijo entre ${pa.name} e ${pb.name}`);
}

document.addEventListener('mousemove', e => {
    if (!connectingFrom) return;
    const fe = nodeEls[connectingFrom]; if (!fe) return;
    const r = fe.getBoundingClientRect(); const tl = $('temp-line');
    if (!tl) return;
    tl.setAttribute('x1', r.left + r.width/2); tl.setAttribute('y1', r.top + r.height/2);
    tl.setAttribute('x2', e.clientX);           tl.setAttribute('y2', e.clientY);
});
document.addEventListener('touchmove', e => {
    if (!connectingFrom) return;
    const fe = nodeEls[connectingFrom]; if (!fe) return;
    const touch = e.touches[0]; const r = fe.getBoundingClientRect(); const tl = $('temp-line');
    if (!tl) return;
    tl.setAttribute('x1', r.left + r.width/2); tl.setAttribute('y1', r.top + r.height/2);
    tl.setAttribute('x2', touch.clientX);       tl.setAttribute('y2', touch.clientY);
}, { passive: true });

wrap.addEventListener('click', () => { if (connectingFrom) { cancelConn(); return; } selectedPersonId = null; renderCanvas(); });

// ═══ CANVAS PAN & ZOOM ════════════════════════════════════════
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
    const d = e.deltaY > 0 ? 0.9 : 1.11;
    const ns = Math.max(0.2, Math.min(3, vscale * d));
    const r  = wrap.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    vx = mx - (mx - vx) * (ns/vscale); vy = my - (my - vy) * (ns/vscale); vscale = ns;
    canvasEl.style.transform = `translate(${vx}px,${vy}px) scale(${vscale})`;
}, { passive: false });

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
        const dist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
        if (_lastDist) {
            const d = dist/_lastDist, ns = Math.max(0.2, Math.min(3, vscale*d));
            const mx = (e.touches[0].clientX+e.touches[1].clientX)/2;
            const my = (e.touches[0].clientY+e.touches[1].clientY)/2;
            vx = mx-(mx-vx)*(ns/vscale); vy = my-(my-vy)*(ns/vscale); vscale = ns;
            canvasEl.style.transform = `translate(${vx}px,${vy}px) scale(${vscale})`;
        }
        _lastDist = dist;
    }
}, { passive: false });
wrap.addEventListener('touchend', () => { isDC = false; _lastDist = 0; });

function applyZoom(d) {
    hideCtx(); hideWebCtx();
    const ns = Math.max(0.2, Math.min(3, vscale * d));
    const cx = wrap.clientWidth/2, cy = wrap.clientHeight/2;
    vx = cx-(cx-vx)*(ns/vscale); vy = cy-(cy-vy)*(ns/vscale); vscale = ns;
    canvasEl.style.transform = `translate(${vx}px,${vy}px) scale(${vscale})`;
}

function centerWeb() {
    const w = isShared ? sharedData : cw();
    if (!w || !w.people.length) {
        vx = 0; vy = 0; vscale = 1;
        canvasEl.style.transform = 'translate(0,0) scale(1)'; return;
    }
    const xs = w.people.map(p => p.x), ys = w.people.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const nm     = 100;
    const webW   = (maxX - minX) + nm*2, webH = (maxY - minY) + nm*2;
    const pad    = 40;
    const availW = wrap.clientWidth - pad, availH = wrap.clientHeight - pad;
    vscale = Math.max(0.15, Math.min(1, Math.min(availW/webW, availH/webH)));
    vx = wrap.clientWidth  / 2 - ((minX+maxX)/2) * vscale;
    vy = wrap.clientHeight / 2 - ((minY+maxY)/2) * vscale;
    canvasEl.style.transform = `translate(${vx}px,${vy}px) scale(${vscale})`;
    renderCanvas();
}

// ═══ PANEL TOGGLE ════════════════════════════════════════════
function isMobilePanelIcon() { return window.matchMedia('(max-width:640px)').matches; }
function updatePanelToggleIcon(isOpen) {
    const btnToggle = $('btn-toggle-panel'); if (!btnToggle) return;
    const iconSpan  = btnToggle.querySelector('.material-symbols-outlined'); if (!iconSpan) return;
    iconSpan.textContent = isMobilePanelIcon()
        ? (isOpen ? 'arrow_drop_down' : 'arrow_drop_up')
        : (isOpen ? 'arrow_menu_open' : 'arrow_menu_close');
}
function togglePanel() {
    const p = $('panel'); if (!p) return;
    p.classList.toggle('open');
    updatePanelToggleIcon(p.classList.contains('open'));
}
if ($('btn-toggle-panel')) $('btn-toggle-panel').onclick = togglePanel;
window.addEventListener('resize', () => {
    const p = $('panel');
    if (p) updatePanelToggleIcon(p.classList.contains('open'));
});

// ═══ TABLE VIEW ══════════════════════════════════════════════
function openTableView() {
    const w = cw(); if (!w) { showToast('nenhuma teia aberta.'); return; }
    $('table-modal').classList.add('v'); renderTableView(w);
}
function renderTableView(w) {
    if (!w) return;
    const tbody = $('tv-body'); tbody.innerHTML = '';
    const q = ($('tv-search') ? $('tv-search').value : '').toLowerCase();
    let people = [...w.people].filter(p => !q || p.name.toLowerCase().includes(q));
    people.sort((a,b) => {
        let va, vb;
        if (_tvSort.field === 'name')   { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
        else if (_tvSort.field === 'kisses') { va = w.connections.filter(c=>c.a===a.id||c.b===a.id).length; vb = w.connections.filter(c=>c.a===b.id||c.b===b.id).length; }
        else if (_tvSort.field === 'gender') { va = a.gender; vb = b.gender; }
        else { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
        return _tvSort.asc ? (va>vb?1:va<vb?-1:0) : (va<vb?1:va>vb?-1:0);
    });
    people.forEach(p => {
        const kc       = w.connections.filter(c=>c.a===p.id||c.b===p.id).length;
        const partners = w.connections.filter(c=>c.a===p.id||c.b===p.id)
            .map(c => { const oid = c.a===p.id?c.b:c.a; const found = w.people.find(x=>x.id===oid); return found ? found.name : '?'; }).join(', ');
        const gn = (p.groups||[]).map(gid => { const g = w.groups.find(x=>x.id===gid); return g ? g.name : ''; }).filter(Boolean).join(', ');
        const tr = document.createElement('tr'); tr.className = 'tv-row';
        const photoHtml = p.photo
            ? `<img src="${p.photo}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;vertical-align:middle">`
            : `<div style="width:32px;height:32px;border-radius:50%;background:${p.gender==='female'?'var(--female-light)':'var(--male-light)'};border:2px solid ${p.gender==='female'?'var(--female)':'var(--male)'};display:inline-flex;align-items:center;justify-content:center;font-size:.8rem;color:${p.gender==='female'?'var(--female)':'var(--male)'}">${p.gender==='female'?'♀':'♂'}</div>`;
        tr.innerHTML = `
            <td style="padding:8px">${photoHtml}</td>
            <td style="padding:8px;font-weight:600;font-size:.84rem;color:var(--text)">${p.name}</td>
            <td style="padding:8px"><span style="font-size:.78rem;padding:4px 10px;border-radius:20px;background:${p.gender==='female'?'var(--female-light)':'var(--male-light)'};color:${p.gender==='female'?'var(--female)':'var(--male)'};font-weight:600">${p.gender==='female'?'mulher':'homem'}</span></td>
            <td style="padding:8px;text-align:center;font-weight:700;font-size:1rem;color:var(--text)">${kc}</td>
            <td style="padding:8px;font-size:.75rem;color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${partners}">${partners||'—'}</td>
            <td style="padding:8px;font-size:.75rem;color:var(--text-muted)">${gn||'—'}</td>
            <td style="padding:8px"><div style="display:flex;gap:4px">
                <button onclick="event.stopPropagation();$('table-modal').classList.remove('v');openEdit('${p.id}')" style="background:none;border:none;cursor:pointer;color:var(--text);font-size:.72rem;padding:3px 8px;border-radius:6px" title="editar"><span class="material-symbols-outlined">edit_square</span></button>
                <button onclick="event.stopPropagation();delPerson('${p.id}');renderTableView(cw())" style="background:none;border:none;cursor:pointer;color:var(--accent);font-size:.8rem;padding:3px 7px;border-radius:6px" title="remover"><span class="material-symbols-outlined">delete</span></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
    const countEl = $('tv-count');
    if (countEl) countEl.textContent = `${people.length} / ${w.people.length} pessoa${w.people.length!==1?'s':''}`;
}
function sortTable(field) {
    if (_tvSort.field === field) _tvSort.asc = !_tvSort.asc;
    else { _tvSort.field = field; _tvSort.asc = field === 'name'; }
    const w = cw(); if (w) renderTableView(w);
}

// ═══ WEBS TABLE VIEW ═════════════════════════════════════════
let _websSort = { field: 'pessoas', asc: false };
function openWebsTableView() {
    if (!myWebs().length) { showToast('Nenhuma teia encontrada.'); return; }
    if ($('webs-tv-search')) $('webs-tv-search').value = '';
    $('webs-table-modal').classList.add('v');
    renderWebsTableView();
}
function renderWebsTableView() {
    const tbody = $('webs-tv-body'); if (!tbody) return;
    tbody.innerHTML = '';
    let websList = [...myWebs()];
    const q = ($('webs-tv-search') ? $('webs-tv-search').value : '').toLowerCase();
    if (q) websList = websList.filter(w => w.name.toLowerCase().includes(q));
    websList.sort((a,b) => {
        if (_websSort.field === 'name') {
            return _websSort.asc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        }
        const field = _websSort.field;
        const getVal = w => field==='pessoas'?(w.people||[]).length:field==='grupos'?(w.groups||[]).length:(w.connections||[]).length;
        return _websSort.asc ? getVal(a)-getVal(b) : getVal(b)-getVal(a);
    });
    websList.forEach(w => {
        const tr = document.createElement('tr'); tr.className = 'tv-row';
        const isCurrent = S.currentWebId === w.id;
        tr.innerHTML = `
            <td style="padding:8px;font-weight:600;font-size:.84rem;color:var(--text)">${w.name}${isCurrent?'<span style="font-size:0.7rem;color:var(--primary);font-weight:normal;margin-left:4px">(atual)</span>':''}</td>
            <td style="padding:8px;text-align:center;font-weight:700;color:var(--text)">${(w.people||[]).length}</td>
            <td style="padding:8px;text-align:center;font-size:.85rem;color:var(--text-muted)">${(w.groups||[]).length}</td>
            <td style="padding:8px;text-align:center;font-weight:700;color:var(--text)">${(w.connections||[]).length}</td>
            <td style="padding:8px"><div style="display:flex;gap:4px;justify-content:flex-end">
                <button onclick="event.stopPropagation();switchWeb('${w.id}');$('webs-table-modal').classList.remove('v')" style="background:none;border:none;cursor:pointer;color:var(--text);padding:3px 8px;border-radius:6px" title="abrir"><span class="material-symbols-outlined">visibility</span></button>
                <button onclick="event.stopPropagation();confirmDeleteWeb('${w.id}')" style="background:none;border:none;cursor:pointer;color:var(--accent);padding:3px 7px;border-radius:6px" title="excluir"><span class="material-symbols-outlined">delete</span></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
    const countEl = $('webs-tv-count');
    if (countEl) countEl.textContent = `${websList.length} / ${myWebs().length} teia${myWebs().length!==1?'s':''}`;
}
function sortWebsTable(field) {
    if (_websSort.field === field) _websSort.asc = !_websSort.asc;
    else { _websSort.field = field; _websSort.asc = field === 'name'; }
    renderWebsTableView();
}

// ═══ GROUP PICKER ════════════════════════════════════════════
function openGroupPicker(gid) {
    const w = cw(); if (!w) return;
    if (!w.people.length) { showToast('não há pessoas na teia ainda.'); return; }
    const g = w.groups.find(x => x.id === gid); if (!g) return;
    gpLimit = 20; gpQuery = '';
    $('gp-title').textContent = `adicionar pessoas ao grupo ${g.name}`;
    $('gp-gid').value = gid;
    renderGroupPicker(w, gid);
    $('group-picker-modal').classList.add('v');
}
function renderGroupPicker(w, gid) {
    const ul = $('gp-list'); ul.innerHTML = '';
    const g  = w.groups.find(x => x.id === gid); if (!g) return;
    let people = [...w.people]
        .filter(p => !gpQuery || normText(p.name).includes(normText(gpQuery)))
        .sort((a,b) => (a.name||'').localeCompare(b.name||'','pt-BR',{sensitivity:'base'}));
    const total = people.length; people = people.slice(0, gpLimit);
    if (!people.length) { ul.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem;text-align:center;padding:20px">nenhum resultado.</div>'; return; }
    people.forEach(p => {
        const inGroup = p.groups && p.groups.includes(gid);
        const li = document.createElement('div');
        li.style.cssText = `display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:10px;cursor:pointer;transition:all .12s;margin-bottom:6px;background:${inGroup?g.color+'22':'var(--bg)'};border:1.5px solid ${inGroup?g.color:'var(--border)'}`;
        const ph = p.photo
            ? `<img src="${p.photo}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0">`
            : `<div style="width:34px;height:34px;border-radius:50%;background:${p.gender==='female'?'var(--female-light)':'var(--male-light)'};border:2px solid ${p.gender==='female'?'var(--female)':'var(--male)'}"></div>`;
        li.innerHTML = `${ph}<span style="flex:1;font-size:.84rem;font-weight:600;color:var(--text)">${p.name}</span>`;
        li.onclick = async () => {
            if (!p.groups) p.groups = [];
            if (inGroup) {
                if (S.currentUser && !S.currentUser.guest) await removePersonFromGroupDB(p.id, gid);
                p.groups = p.groups.filter(x => x !== gid);
            } else {
                if (S.currentUser && !S.currentUser.guest) await addPersonToGroupDB(p.id, gid);
                p.groups.push(gid);
            }
            renderGroupPicker(w, gid); renderPanel();
        };
        ul.appendChild(li);
    });
    if (gpLimit < total) {
        const more = document.createElement('div');
        more.style.cssText = 'text-align:center;padding:10px;cursor:pointer;color:var(--accent);font-weight:600';
        more.innerHTML = '<span class="material-symbols-outlined" style="vertical-align:middle">refresh</span> carregar mais';
        more.onclick = () => { gpLimit += 20; renderGroupPicker(w, gid); };
        ul.appendChild(more);
    }
}

// ═══ EXPORT / IMPORT ═════════════════════════════════════════
function toggleExportMenu() { $('export-menu').classList.toggle('v'); }
function hideExportMenu()   { $('export-menu').classList.remove('v'); }
function toggleSoloExportMenu() { const m = $('solo-export-menu'); if(m) m.classList.toggle('v'); }
function hideSoloExportMenu()   { const m = $('solo-export-menu'); if(m) m.classList.remove('v'); }

async function exportWebAsImage() {
    const w = cw(); if (!w || !w.people.length) return;
    if (typeof html2canvas === 'undefined') { showAlert('Biblioteca html2canvas não carregada.'); return; }
    try {
        showToast('Preparando imagem...');
        const originalTransform = canvasEl.style.transform;
        const originalWidth     = canvasEl.style.width;
        const originalHeight    = canvasEl.style.height;
        let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        w.people.forEach(p => {
            const el = nodeEls[p.id];
            const nW = el ? el.offsetWidth : 80, nH = el ? el.offsetHeight : 120;
            minX=Math.min(minX,p.x-nW/2); minY=Math.min(minY,p.y-nH/2);
            maxX=Math.max(maxX,p.x+nW/2); maxY=Math.max(maxY,p.y+nH/2);
        });
        const padding=60, exportW=(maxX-minX)+padding*2, exportH=(maxY-minY)+padding*2;
        canvasEl.style.transform=  'none';
        canvasEl.style.width    =  exportW + 'px';
        canvasEl.style.height   =  exportH + 'px';
        const offX=-minX+padding, offY=-minY+padding;
        w.people.forEach(p => { const el=nodeEls[p.id]; if(el){el.style.left=(p.x+offX)+'px';el.style.top=(p.y+offY)+'px';} });
        renderLines({...w, people: w.people.map(p=>({...p,x:p.x+offX,y:p.y+offY}))});
        await new Promise(r => setTimeout(r, 200));
        const c = await html2canvas(canvasEl, { backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()||'#f7f5f2', scale:2, useCORS:true, logging:false, width:exportW, height:exportH });
        canvasEl.style.transform = originalTransform;
        canvasEl.style.width     = originalWidth;
        canvasEl.style.height    = originalHeight;
        renderCanvas();
        const a = document.createElement('a'); a.href = c.toDataURL('image/png');
        a.download = `kissweb-${w.name.replace(/\s+/g,'-').toLowerCase()}.png`; a.click();
        showToast('Imagem exportada!');
    } catch(e) { console.error(e); showToast('Erro ao exportar imagem.'); }
}
async function exportWebAsPDF() {
    const w = cw(); if (!w||!w.people.length) return;
    if (!window.jspdf) { showAlert('Biblioteca jsPDF não carregada.'); return; }
    try {
        showToast('Gerando PDF...');
        let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        w.people.forEach(p => { const el=nodeEls[p.id]; const nW=el?el.offsetWidth:80,nH=el?el.offsetHeight:120; minX=Math.min(minX,p.x-nW/2);minY=Math.min(minY,p.y-nH/2);maxX=Math.max(maxX,p.x+nW/2);maxY=Math.max(maxY,p.y+nH/2); });
        const padding=50, exportW=(maxX-minX)+padding*2, exportH=(maxY-minY)+padding*2;
        const originalTransform = canvasEl.style.transform;
        canvasEl.style.transform = 'none';
        const offX=-minX+padding, offY=-minY+padding;
        w.people.forEach(p => { const el=nodeEls[p.id]; if(el){el.style.left=(p.x+offX)+'px';el.style.top=(p.y+offY)+'px';} });
        renderLines({...w,people:w.people.map(p=>({...p,x:p.x+offX,y:p.y+offY}))});
        await new Promise(r=>setTimeout(r,200));
        const c = await html2canvas(canvasEl,{backgroundColor:'#ffffff',scale:2,width:exportW,height:exportH});
        canvasEl.style.transform = originalTransform; renderCanvas();
        const imgData = c.toDataURL('image/png');
        const pdf = new window.jspdf.jsPDF({orientation:exportW>exportH?'landscape':'portrait',unit:'px',format:[exportW,exportH]});
        pdf.addImage(imgData,'PNG',0,0,exportW,exportH);
        pdf.save(`kissweb-${w.name.replace(/\s+/g,'-').toLowerCase()}.pdf`);
        showToast('PDF pronto!');
    } catch(e) { console.error(e); showToast('Erro ao gerar PDF.'); }
}
function exportWebAsFile() {
    const w = cw(); if (!w) return;
    const blob = new Blob([JSON.stringify(w,null,2)],{type:'application/json'});
    downloadBlob(blob,`kissweb-${sanitizeFilename(w.name)}.kiss`); showToast('arquivo exportado!');
}
async function importWebData(data) {
    if (!data||!Array.isArray(data.people)||!Array.isArray(data.connections)||typeof data.name!=='string') { showToast('arquivo inválido.'); return; }
    let w;
    if (S.currentUser && !S.currentUser.guest) {
        // Cria a teia no banco e importa as pessoas
        const { data: newWeb, error } = await createWebDB(S.currentUser.id, data.name);
        if (error) return;
        // Importa pessoas uma a uma (preservando posições)
        const idMap = {};
        for (const p of data.people) {
            const { data: newP, error: pe } = await addPersonDB({ webId: newWeb.id, name: p.name, gender: p.gender, photo: p.photo||null, x: p.x, y: p.y, notes: p.notes||'' });
            if (!pe) idMap[p.id] = newP.id;
        }
        // Importa conexões com os novos IDs
        for (const c of data.connections) {
            const a = idMap[c.a], b = idMap[c.b];
            if (a && b) await addConnectionDB(newWeb.id, a, b);
        }
        // Recarrega do banco para ter o estado normalizado
        const { data: updatedWebs } = await fetchWebs(S.currentUser.id);
        if (updatedWebs) S.webs = updatedWebs;
        S.currentWebId = newWeb.id;
    } else {
        w = { ...data, id: uid(), ownerId: 'guest' };
        S.webs.push(w); S.currentWebId = w.id;
    }
    canvasEl.querySelectorAll('.person').forEach(e=>e.remove());
    Object.keys(nodeEls).forEach(k=>delete nodeEls[k]);
    hideNoWebsState(); showAppUI(); rebuildNodes(); render(); showToast('teia importada!');
}
function handleImportFile(evt) {
    const file = evt.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => { try { importWebData(JSON.parse(e.target.result)); } catch { showToast('falha ao ler o arquivo.'); } evt.target.value = ''; };
    reader.readAsText(file);
}
function downloadBlob(blob, filename) { const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); }
function sanitizeFilename(name) { return (name||'teia').replace(/[\\/:*?"<>|]/g,'_').trim().replace(/\s+/g,'-').toLowerCase(); }

// ═══ BOTÕES ═══════════════════════════════════════════════════
if ($('btn-add-person'))   $('btn-add-person').onclick   = addPerson;
if ($('inp-name'))         $('inp-name').addEventListener('keydown', e => { if (e.key==='Enter') addPerson(); });
if ($('btn-add-group'))    $('btn-add-group').onclick    = addGroup;
if ($('inp-gname'))        $('inp-gname').addEventListener('keydown', e => { if(e.key==='Enter') addGroup(); });
if ($('btn-table-view'))   $('btn-table-view').onclick   = openTableView;
if ($('btn-manage-webs'))  $('btn-manage-webs').onclick  = openWebsTableView;
if ($('btn-theme'))        $('btn-theme').onclick        = toggleTheme;
if ($('btn-account'))      $('btn-account').onclick      = () => { if(typeof openAccountModal==='function') openAccountModal(); };
if ($('btn-center'))       $('btn-center').onclick       = centerWeb;
if ($('zoom-in'))          $('zoom-in').onclick          = () => applyZoom(1.2);
if ($('zoom-out'))         $('zoom-out').onclick         = () => applyZoom(0.8);
if ($('search-open'))      $('search-open').onclick      = openSearchModal;
if ($('btn-export'))       $('btn-export').onclick       = toggleExportMenu;
if ($('export-img'))       $('export-img').onclick       = () => { hideExportMenu(); exportWebAsImage(); };
if ($('export-pdf'))       $('export-pdf').onclick       = () => { hideExportMenu(); exportWebAsPDF(); };
if ($('export-file'))      $('export-file').onclick      = () => { hideExportMenu(); exportWebAsFile(); };

const triggerImport = () => { if(typeof hideExportMenu==='function') hideExportMenu(); $('import-file').click(); };
if ($('import-file-btn'))       $('import-file-btn').onclick       = triggerImport;
if ($('import-first-file-btn')) $('import-first-file-btn').onclick = triggerImport;
if ($('import-file'))           $('import-file').addEventListener('change', handleImportFile);

if ($('btn-new-web'))         $('btn-new-web').onclick         = () => { $('new-web-name').value=''; $('new-web-modal').classList.add('v'); setTimeout(()=>$('new-web-name').focus(),80); };
if ($('btn-create-first-web'))$('btn-create-first-web').onclick = () => { $('new-web-name').value=''; $('new-web-modal').classList.add('v'); setTimeout(()=>$('new-web-name').focus(),80); };
if ($('new-web-create')) {
    $('new-web-create').onclick = async () => {
        const name = $('new-web-name').value.trim() || 'nova teia';
        const w = await createWeb(name);
        if (!w) return;
        $('new-web-modal').classList.remove('v');
        canvasEl.querySelectorAll('.person').forEach(e=>e.remove());
        Object.keys(nodeEls).forEach(k=>delete nodeEls[k]);
        hideNoWebsState(); showAppUI(); render(); showToast(`teia "${name}" criada!`);
    };
}
if ($('new-web-name')) $('new-web-name').addEventListener('keydown', e => { if(e.key==='Enter') $('new-web-create').click(); });

// Mobile menu
if ($('btn-mobile-menu'))       $('btn-mobile-menu').onclick       = () => { $('mobile-menu').classList.toggle('v'); $('mobile-menu-backdrop').classList.toggle('v'); };
if ($('btn-mobile-menu-close')) $('btn-mobile-menu-close').onclick = () => { $('mobile-menu').classList.remove('v'); $('mobile-menu-backdrop').classList.remove('v'); };
if ($('mobile-menu-backdrop'))  $('mobile-menu-backdrop').onclick  = () => { $('mobile-menu').classList.remove('v'); $('mobile-menu-backdrop').classList.remove('v'); };
if ($('mobile-table-view'))     $('mobile-table-view').onclick     = () => { $('mobile-menu').classList.remove('v'); $('mobile-menu-backdrop').classList.remove('v'); openTableView(); };
if ($('mobile-export'))         $('mobile-export').onclick         = () => { $('mobile-menu').classList.remove('v'); $('mobile-menu-backdrop').classList.remove('v'); toggleExportMenu(); };
if ($('mobile-theme'))          $('mobile-theme').onclick          = () => { $('mobile-menu').classList.remove('v'); $('mobile-menu-backdrop').classList.remove('v'); toggleTheme(); };
if ($('mobile-account'))        $('mobile-account').onclick        = () => { $('mobile-menu').classList.remove('v'); $('mobile-menu-backdrop').classList.remove('v'); if(typeof openAccountModal==='function') openAccountModal(); };

// Fechar modais ao clicar fora
['edit-modal','new-web-modal','user-modal','alert-modal','confirm-modal',
 'input-modal','search-modal','group-picker-modal','account-modal'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('v'); });
});

document.addEventListener('keydown', e => {
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='f') { e.preventDefault(); openSearchModal(); return; }
    if (e.key === 'Escape') {
        cancelConn(); hideCtx(); hideWebCtx(); hideSearchModal(); hideSoloExportMenu();
        document.querySelectorAll('.modal-overlay.v').forEach(m => m.classList.remove('v'));
    }
});

// ═══ INICIALIZAÇÃO ════════════════════════════════════════════
async function enterApp(user) {
    const overlay = $('auth-overlay');
    if (overlay) overlay.classList.add('hidden');

    if (user) {
        // Usuário autenticado
        S.currentUser = {
            id:    user.id,
            email: user.email,
            name:  user.user_metadata && user.user_metadata.name ? user.user_metadata.name : user.email
        };
        await loadUserData(user);
    }
    // Se user === null, S.currentUser já foi definido como guest em doGuest()

    showAppUI();
    if (!myWebs().length) { showNoWebsState(); return; }
    if (!S.currentWebId || !myWebs().find(w => w.id === S.currentWebId)) {
        S.currentWebId = myWebs()[0].id;
    }
    canvasEl.querySelectorAll('.person').forEach(e => e.remove());
    Object.keys(nodeEls).forEach(k => delete nodeEls[k]);
    rebuildNodes(); render(); updatePanelToggleIcon(false);
}

async function init() {
    // Tema (preferência de UI: OK ficar no localStorage)
    const savedTheme = localStorage.getItem('kw_theme');
    applyTheme(savedTheme && THEMES[savedTheme] ? savedTheme : 'claro');

    // Verifica se existe sessão Supabase ativa
    const user = await checkSession();

    if (user) {
        // Sessão válida: entra direto no app
        await enterApp(user);
    } else {
        // Sem sessão: mostra tela de auth
        const overlay = $('auth-overlay');
        if (overlay) overlay.classList.remove('hidden');
    }
}

init();
