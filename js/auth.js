// ═══════════════════════════════════════════════════════════════
// js/auth.js — Autenticação (login, cadastro, logout, guest)
// Carregado APÓS supabase.js e ANTES de db.js / script.js
// ═══════════════════════════════════════════════════════════════

// ── Helpers de mensagem de erro na tela ───────────────────────
function showAuthErr(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.add('v');
}
function hideAuthErr(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('v');
}

// ── Troca de aba (Login ↔ Cadastro) ──────────────────────────
function switchTab(tab) {
    const isLogin = tab === 'login';
    document.querySelectorAll('.auth-tab').forEach((btn, i) => {
        btn.classList.toggle('active', i === (isLogin ? 0 : 1));
    });
    const loginForm    = document.getElementById('form-login');
    const registerForm = document.getElementById('form-register');
    if (loginForm)    loginForm.style.display    = isLogin ? 'flex' : 'none';
    if (registerForm) registerForm.style.display = isLogin ? 'none' : 'flex';
}

// ── Cadastro ──────────────────────────────────────────────────
// Cria o usuário no Supabase Auth.
// O trigger no banco (handle_new_user) cria automaticamente o perfil.
async function doRegister() {
    const nameEl  = document.getElementById('r-name');
    const emailEl = document.getElementById('r-email');
    const pwEl    = document.getElementById('r-pw');

    const name  = nameEl  ? nameEl.value.trim()              : '';
    const email = emailEl ? emailEl.value.trim().toLowerCase() : '';
    const pw    = pwEl    ? pwEl.value                        : '';

    // Validação básica no frontend
    if (!name || !email || !pw) {
        showAuthErr('r-err', 'preencha todos os campos.');
        return;
    }
    if (pw.length < 6) {
        showAuthErr('r-err', 'senha precisa ter pelo menos 6 caracteres.');
        return;
    }

    hideAuthErr('r-err');

    const { data, error } = await window.db.auth.signUp({
        email,
        password: pw,
        options: {
            // O campo "name" fica em user_metadata e é usado pelo trigger
            data: { name }
        }
    });

    if (error) {
        // Traduz as mensagens mais comuns do Supabase
        const msgs = {
            'User already registered':                   'e-mail já cadastrado.',
            'Password should be at least 6 characters': 'senha muito curta (mín. 6 caracteres).',
            'Invalid email':                             'formato de e-mail inválido.',
        };
        const msg = msgs[error.message] || error.message;
        console.error('[auth.js] doRegister error:', error.message, error.details || '');
        showAuthErr('r-err', msg);
        return;
    }

    // Se confirmação de e-mail estiver ativada, data.session será null.
    // O usuário precisa clicar no link antes de conseguir fazer login.
    if (data.user && !data.session) {
        showAuthErr('r-err', '');
        alert('Conta criada! Verifique seu e-mail e clique no link de confirmação antes de entrar.');
        switchTab('login');
        return;
    }

    // Confirmação desativada: entra direto
    if (data.user) {
        if (typeof enterApp === 'function') {
            await enterApp(data.user);
        } else {
            window.location.href = 'index.html';
        }
    }
}

// ── Login ──────────────────────────────────────────────────────
async function doLogin() {
    const emailEl = document.getElementById('l-email');
    const pwEl    = document.getElementById('l-pw');

    const email = emailEl ? emailEl.value.trim().toLowerCase() : '';
    const pw    = pwEl    ? pwEl.value                         : '';

    hideAuthErr('l-err');

    const { data, error } = await window.db.auth.signInWithPassword({ email, password: pw });

    if (error) {
        const msgs = {
            'Invalid login credentials': 'e-mail ou senha incorretos.',
            'Email not confirmed':       'confirme seu e-mail antes de entrar.',
        };
        const msg = msgs[error.message] || error.message;
        console.error('[auth.js] doLogin error:', error.message, error.details || '');
        showAuthErr('l-err', msg);
        return;
    }

    if (data.user) {
        if (typeof enterApp === 'function') {
            await enterApp(data.user);
        } else {
            window.location.href = 'index.html';
        }
    }
}

// ── Logout ────────────────────────────────────────────────────
async function doLogout() {
    // showConfirm é definido em script.js (que é carregado depois)
    if (typeof showConfirm === 'function') {
        showConfirm('tem certeza que deseja sair da conta?', async () => {
            await _performLogout();
        });
    } else {
        if (confirm('tem certeza que deseja sair da conta?')) {
            await _performLogout();
        }
    }
}

async function _performLogout() {
    const { error } = await window.db.auth.signOut();
    if (error) {
        console.error('[auth.js] doLogout error:', error.message);
    }

    // Limpa o estado em memória (S é definido em script.js)
    if (typeof S !== 'undefined') {
        S.webs        = [];
        S.currentWebId = null;
        S.currentUser  = null;
    }
    if (typeof nodeEls !== 'undefined') {
        // Remove nós do canvas
        Object.values(nodeEls).forEach(el => el.remove());
        // Não podemos fazer nodeEls = {} por ser const em outro escopo,
        // então esvaziamos o objeto:
        Object.keys(nodeEls).forEach(k => delete nodeEls[k]);
    }

    const userModal = document.getElementById('user-modal');
    if (userModal) userModal.classList.remove('v');

    if (typeof hideAppUI === 'function') hideAppUI();

    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

// ── Modo Visitante ────────────────────────────────────────────
// Sem conta: dados apenas em memória, sem persistência no banco.
function doGuest() {
    if (typeof S !== 'undefined') {
        S.currentUser = { guest: true, name: 'visitante' };
    }
    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.classList.add('hidden');
    if (typeof enterApp === 'function') {
        enterApp(null); // null = modo guest
    }
}

// ── Verificar sessão existente ────────────────────────────────
// Chamada em init() para restaurar sessão ao recarregar a página.
async function checkSession() {
    const { data, error } = await window.db.auth.getSession();
    if (error) {
        console.error('[auth.js] checkSession error:', error.message);
        return null;
    }
    return (data && data.session) ? data.session.user : null;
}

// ── Listener de mudança de sessão ────────────────────────────
// Detecta login via link de confirmação, token externo, etc.
window.db.auth.onAuthStateChange(async (event, session) => {
    console.log('[auth.js] onAuthStateChange:', event);

    if (event === 'SIGNED_IN' && session && session.user) {
        const overlay = document.getElementById('auth-overlay');
        // Só executa o enterApp se o overlay ainda está visível
        // (evita double-call quando o usuário já estava logado)
        if (overlay && !overlay.classList.contains('hidden')) {
            overlay.classList.add('hidden');
            if (typeof enterApp === 'function') {
                await enterApp(session.user);
            }
        }
    }

    if (event === 'SIGNED_OUT') {
        const overlay = document.getElementById('auth-overlay');
        if (overlay) overlay.classList.remove('hidden');
    }
});