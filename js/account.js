// ═══════════════════════════════════════════════════════
// account.js — versão simplificada (kissweb)
// ═══════════════════════════════════════════════════════

async function openAccountModal() {
    const modal = document.getElementById('account-modal');
    if (!modal) return;

    // Sempre busca a sessão atual diretamente do Supabase
    // Evita condição de corrida com S.currentUser
    const { data, error } = await window.db.auth.getSession();
    if (error) {
        console.error('Erro ao buscar sessão:', error);
        return;
    }

    const user = data?.session?.user;
    if (!user) {
        console.log('Nenhum usuário logado');
        return;
    }

    const title = document.getElementById('acc-title');
    if (title) title.textContent = `olá, ${user.user_metadata?.name || 'usuário'}!`;

    console.log('current user:', user.email);

    const nameEl = document.getElementById('acc-name');
    if (nameEl) nameEl.value = user.user_metadata?.name || '';

    const emailEl = document.getElementById('acc-email-display');
    if (emailEl) emailEl.textContent = user.email || '';

    clearAccMsg();
    modal.classList.add('v');
}

function closeAccountModal() {
    const modal = document.getElementById('account-modal');
    if (modal) modal.classList.remove('v');
}

function showAccMsg(msg, isError = true) {
    const el = document.getElementById('acc-msg');
    if (!el) return;

    el.textContent = msg;
    el.style.display = 'block';
    el.style.color = isError ? 'var(--accent)' : 'var(--female)';
}

function clearAccMsg() {
    const el = document.getElementById('acc-msg');
    if (!el) return;

    el.textContent = '';
    el.style.display = 'none';
}

async function saveAccountName() {
    // Busca a sessão atual diretamente
    const { data, error: sessionError } = await window.db.auth.getSession();
    if (sessionError || !data?.session?.user) {
        return showAccMsg('erro: sessão inválida.');
    }

    const user = data.session.user;
    const name = document.getElementById('acc-name')?.value.trim();

    if (!name) return showAccMsg('nome inválido.');

    clearAccMsg();

    const { error: dbErr } = await updateProfileName(user.id, name);
    if (dbErr) return showAccMsg(dbErr.message);

    const { error: authErr } = await window.db.auth.updateUser({
        data: { name }
    });

    if (authErr) return showAccMsg(authErr.message);

    // Atualiza S.currentUser se existir (para consistência)
    if (typeof S !== 'undefined' && S.currentUser) {
        S.currentUser.name = name;
    }

    showAccMsg('nome atualizado!', false);

    // atualiza título
    const title = document.getElementById('acc-title');
    if (title) title.textContent = `olá, ${name}!`;
}

async function requestPasswordReset() {
    // Busca a sessão atual diretamente
    const { data, error: sessionError } = await window.db.auth.getSession();
    if (sessionError || !data?.session?.user) {
        return showAccMsg('erro: sessão inválida.');
    }

    const user = data.session.user;
    clearAccMsg();

    const { error } = await sendPasswordReset(user.email);

    if (error) {
        return showAccMsg('erro: ' + error.message);
    }

    showAccMsg('e-mail de recuperação enviado!', false);
}

// ── Detectar redirecionamento de recuperação de senha ─────────
// Quando o usuário clica no link do e-mail de reset, ele é
// redirecionado de volta ao app com event = PASSWORD_RECOVERY.
// Usamos o onAuthStateChange para detectar isso e abrir o modal
// de troca de senha automaticamente.
window.db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
        // Mostra automaticamente o modal de conta na aba de senha
        const overlay = document.getElementById('auth-overlay');
        if (overlay) overlay.classList.add('hidden');

        if (typeof showAppUI === 'function') showAppUI();

        // Pequeno delay para o DOM estar pronto
        setTimeout(() => {
            openAccountModal();
            const msg = document.getElementById('acc-msg');
            if (msg) {
                msg.textContent = 'você pode definir sua nova senha abaixo.';
                msg.style.color = 'var(--female)';
                msg.classList.add('v');
            }
        }, 300);
    }
});

async function logoutAccount() {
    try {
        // logout supabase
        await window.db.auth.signOut();

        // limpa estado local
        localStorage.clear(); // ou removeItem específico se quiser mais seguro

        // opcional: limpar memória da app
        if (typeof S !== 'undefined') {
            S.currentUser = null;
        }

        // redireciona
        window.location.href = 'index.html';

    } catch (err) {
        console.error(err);
        alert('erro ao sair da conta');
    }
}