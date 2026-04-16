// ═══════════════════════════════════════════════════════════════
// js/db.js — Camada de acesso ao banco de dados (Supabase)
// Carregado APÓS supabase.js e auth.js, ANTES de script.js
// Todas as funções retornam { data, error } no padrão Supabase.
// ═══════════════════════════════════════════════════════════════

// ── Log padronizado de erros do banco ─────────────────────────
function logDbError(fn, error) {
    console.error(
        `[db.js] Erro em ${fn}:\n`,
        '  message:', error.message || '(sem mensagem)',
        '\n  details:', error.details || '(sem detalhes)',
        '\n  hint:',    error.hint    || '(sem hint)',
        '\n  code:',    error.code    || '(sem code)'
    );
    if (typeof showToast === 'function') showToast('Erro ao salvar. Verifique o console.');
}

// ────────────────────────────────────────────────────────────────
// PERFIL DO USUÁRIO
// ────────────────────────────────────────────────────────────────

async function getProfile(userId) {
    const { data, error } = await window.db
        .from('profiles')
        .select('id, name, updated_at')
        .eq('id', userId)
        .single();

    if (error) { logDbError('getProfile', error); return { data: null, error }; }
    return { data, error: null };
}

async function updateProfileName(userId, newName) {
    const { data, error } = await window.db
        .from('profiles')
        .update({ name: newName, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select()
        .single();

    if (error) { logDbError('updateProfileName', error); return { data: null, error }; }
    return { data, error: null };
}

// ────────────────────────────────────────────────────────────────
// GERENCIAMENTO DE CONTA
// ────────────────────────────────────────────────────────────────

/**
 * Altera a senha do usuário logado.
 * Requer que o usuário já esteja autenticado com sessão ativa.
 */
async function updatePassword(newPassword) {
    const { data, error } = await window.db.auth.updateUser({ password: newPassword });
    if (error) { logDbError('updatePassword', error); return { data: null, error }; }
    return { data, error: null };
}

/**
 * Envia e-mail de redefinição de senha para o endereço informado.
 * O Supabase cuida de gerar e enviar o link com o token.
 */
async function sendPasswordReset(email) {
    const { data, error } = await window.db.auth.resetPasswordForEmail(email, {
        // URL para onde o usuário será redirecionado após clicar no link.
        // Você precisa lidar com o evento PASSWORD_RECOVERY no onAuthStateChange.
        redirectTo: window.location.origin + '/index.html'
    });
    if (error) { logDbError('sendPasswordReset', error); return { data: null, error }; }
    return { data, error: null };
}

// ────────────────────────────────────────────────────────────────
// TEIAS (webs)
// ────────────────────────────────────────────────────────────────

/**
 * Busca TODAS as teias do usuário com dados aninhados em uma só query.
 * O PostgREST (usado pelo Supabase) suporta seleção de relações.
 */
async function fetchWebs(userId) {
    const { data, error } = await window.db
        .from('webs')
        .select(`
            id,
            name,
            owner_id,
            created_at,
            people (
                id, web_id, name, gender, photo, x, y, notes,
                people_groups ( group_id )
            ),
            connections ( id, web_id, person_a_id, person_b_id ),
            groups ( id, web_id, name, color )
        `)
        .eq('owner_id', userId)
        .order('created_at', { ascending: true });

    if (error) {
        logDbError('fetchWebs', error);
        return { data: null, error };
    }

    // Normaliza do formato do banco para o formato interno do kissweb
    const webs = (data || []).map(w => ({
        id:      w.id,
        name:    w.name,
        ownerId: w.owner_id,

        people: (w.people || []).map(p => ({
            id:     p.id,
            name:   p.name,
            gender: p.gender,
            photo:  p.photo || null,
            x:      p.x,
            y:      p.y,
            notes:  p.notes || '',
            // people_groups é array de { group_id } — extraímos só os IDs
            groups: (p.people_groups || []).map(pg => pg.group_id)
        })),

        connections: (w.connections || []).map(c => ({
            id: c.id,
            a:  c.person_a_id,
            b:  c.person_b_id
        })),

        groups: (w.groups || []).map(g => ({
            id:    g.id,
            name:  g.name,
            color: g.color
        }))
    }));

    return { data: webs, error: null };
}

async function createWebDB(userId, name) {
    const { data, error } = await window.db
        .from('webs')
        .insert({ name, owner_id: userId })
        .select('id, name, owner_id')
        .single();

    if (error) { logDbError('createWebDB', error); return { data: null, error }; }

    return {
        data: {
            id:          data.id,
            name:        data.name,
            ownerId:     data.owner_id,
            people:      [],
            connections: [],
            groups:      []
        },
        error: null
    };
}

async function renameWebDB(webId, newName) {
    const { error } = await window.db
        .from('webs')
        .update({ name: newName })
        .eq('id', webId);

    if (error) { logDbError('renameWebDB', error); return { error }; }
    return { error: null };
}

/**
 * Exclui uma teia. O CASCADE no banco remove pessoas, conexões e grupos.
 */
async function deleteWebDB(webId) {
    const { error } = await window.db
        .from('webs')
        .delete()
        .eq('id', webId);

    if (error) { logDbError('deleteWebDB', error); return { error }; }
    return { error: null };
}

// ────────────────────────────────────────────────────────────────
// PESSOAS (people)
// ────────────────────────────────────────────────────────────────

async function addPersonDB({ webId, name, gender, photo, x, y, notes }) {
    const { data, error } = await window.db
        .from('people')
        .insert({
            web_id: webId,
            name,
            gender,
            photo:  photo || null,
            x,
            y,
            notes:  notes || ''
        })
        .select('id, name, gender, photo, x, y, notes')
        .single();

    if (error) { logDbError('addPersonDB', error); return { data: null, error }; }
    return { data: { ...data, groups: [] }, error: null };
}

async function updatePersonDB(personId, updates) {
    // Mapeia do formato interno para os nomes das colunas do banco
    const row = {};
    if (updates.name   !== undefined) row.name   = updates.name;
    if (updates.gender !== undefined) row.gender = updates.gender;
    if (updates.photo  !== undefined) row.photo  = updates.photo;
    if (updates.notes  !== undefined) row.notes  = updates.notes;
    if (updates.x      !== undefined) row.x      = updates.x;
    if (updates.y      !== undefined) row.y      = updates.y;

    const { error } = await window.db
        .from('people')
        .update(row)
        .eq('id', personId);

    if (error) { logDbError('updatePersonDB', error); return { error }; }
    return { error: null };
}

/**
 * Exclui uma pessoa. O CASCADE remove as conexões onde ela aparece.
 */
async function deletePersonDB(personId) {
    const { error } = await window.db
        .from('people')
        .delete()
        .eq('id', personId);

    if (error) { logDbError('deletePersonDB', error); return { error }; }
    return { error: null };
}

/**
 * Salva a posição (x, y) de uma pessoa no canvas.
 * Chamada com debounce durante o drag para não sobrecarregar o banco.
 */
async function movePersonDB(personId, x, y) {
    const { error } = await window.db
        .from('people')
        .update({ x, y })
        .eq('id', personId);

    if (error) { logDbError('movePersonDB', error); return { error }; }
    return { error: null };
}

// ────────────────────────────────────────────────────────────────
// CONEXÕES (connections / "beijos")
// ────────────────────────────────────────────────────────────────

async function addConnectionDB(webId, personAId, personBId) {
    const { data, error } = await window.db
        .from('connections')
        .insert({ web_id: webId, person_a_id: personAId, person_b_id: personBId })
        .select('id, person_a_id, person_b_id')
        .single();

    if (error) { logDbError('addConnectionDB', error); return { data: null, error }; }
    return { data: { id: data.id, a: data.person_a_id, b: data.person_b_id }, error: null };
}

async function deleteConnectionDB(connectionId) {
    const { error } = await window.db
        .from('connections')
        .delete()
        .eq('id', connectionId);

    if (error) { logDbError('deleteConnectionDB', error); return { error }; }
    return { error: null };
}

// ────────────────────────────────────────────────────────────────
// GRUPOS (groups)
// ────────────────────────────────────────────────────────────────

async function addGroupDB(webId, name, color) {
    const { data, error } = await window.db
        .from('groups')
        .insert({ web_id: webId, name, color })
        .select('id, name, color')
        .single();

    if (error) { logDbError('addGroupDB', error); return { data: null, error }; }
    return { data, error: null };
}

async function renameGroupDB(groupId, newName) {
    const { error } = await window.db
        .from('groups')
        .update({ name: newName })
        .eq('id', groupId);

    if (error) { logDbError('renameGroupDB', error); return { error }; }
    return { error: null };
}

async function deleteGroupDB(groupId) {
    const { error } = await window.db
        .from('groups')
        .delete()
        .eq('id', groupId);

    if (error) { logDbError('deleteGroupDB', error); return { error }; }
    return { error: null };
}

// ────────────────────────────────────────────────────────────────
// MEMBROS DE GRUPO (people_groups)
// ────────────────────────────────────────────────────────────────

async function addPersonToGroupDB(personId, groupId) {
    const { error } = await window.db
        .from('people_groups')
        .insert({ person_id: personId, group_id: groupId });

    if (error) {
        // Código 23505 = unique_violation: a pessoa já está no grupo
        if (error.code === '23505') return { error: null };
        logDbError('addPersonToGroupDB', error);
        return { error };
    }
    return { error: null };
}

async function removePersonFromGroupDB(personId, groupId) {
    const { error } = await window.db
        .from('people_groups')
        .delete()
        .eq('person_id', personId)
        .eq('group_id', groupId);

    if (error) { logDbError('removePersonFromGroupDB', error); return { error }; }
    return { error: null };
}
