// ═══════════════════════════════════════════════════════════════
// js/supabase.js — Inicialização do cliente Supabase
// DEVE ser o PRIMEIRO script carregado (antes de auth.js, db.js e script.js)
// Expõe window.db para todos os outros arquivos.
// ═══════════════════════════════════════════════════════════════

// Substitua pelos valores do seu projeto:
// Supabase Dashboard → Settings → API
const SUPABASE_URL     = 'https://egbtpkskxgeemlqhdumc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_r02WCcbv_raGKbPdcOYn_A_ELeokwwo';

// O CDN do Supabase já expõe window.supabase (UMD build).
// Criamos o cliente e o disponibilizamos globalmente como window.db.
window.db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession:      true,   // Sessão salva no localStorage pelo próprio SDK
        detectSessionInUrl:  true,   // Detecta token de confirmação de e-mail na URL
        autoRefreshToken:    true,   // Renova JWT automaticamente antes de expirar
    }
});
