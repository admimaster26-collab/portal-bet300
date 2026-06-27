/**
 * BET300 · Vercel Function: /api/save-subscription
 * Guarda o actualiza la push subscription de un usuario.
 * POST { usuario, public_code, telefono, subscription }
 * El pc_codigo se RESUELVE en el server (no se confía en el cliente) y se valida
 * el vínculo usuario+teléfono antes de guardar (anti-hijack de notificaciones).
 */
const { createClient } = require('@supabase/supabase-js');

const SB_URL  = process.env.SUPABASE_URL;
const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { usuario, public_code, telefono, subscription, renovacion } = req.body || {};
  if (!usuario || !subscription) {
    return res.status(400).json({ error: 'usuario y subscription requeridos' });
  }

  const sb = createClient(SB_URL, SB_KEY);
  const user = String(usuario).trim().toLowerCase();

  // 1) Resolver pc_codigo en el SERVER desde el public_code (no confiar en el cliente).
  let pc_codigo = null;
  try {
    if (public_code) {
      const { data } = await sb.rpc('landing_portal_v16_pc_from_code', { p_public_code: public_code });
      pc_codigo = (typeof data === 'string') ? data : (data && (data.pc_codigo || data.pc)) || null;
    }
  } catch (e) { /* sin pc_codigo no bloqueamos, pero lo dejamos null */ }

  // 2) Validar el vínculo usuario+teléfono. Si el verdict es de bloqueo, NO guardamos.
  try {
    if (pc_codigo) {
      const { data: v } = await sb.rpc('landing_portal_resolver_vinculo', {
        p_pc_codigo: pc_codigo, p_usuario: user, p_telefono: telefono || ''
      });
      const obj = (typeof v === 'string') ? JSON.parse(v) : v;
      const verdict = String((obj && obj.verdict) || '').toUpperCase();
      if (verdict && !['ACCESO', 'NUEVO', 'PENDIENTE'].includes(verdict)) {
        return res.status(403).json({ error: 'vinculo_no_valido', verdict });
      }
    }
  } catch (e) { /* error transitorio de validación: no bloqueamos el push */ }

  const endpoint = typeof subscription === 'string'
    ? JSON.parse(subscription).endpoint
    : subscription.endpoint;

  const { error } = await sb.from('push_subscriptions').upsert({
    usuario:      user,
    pc_codigo:    pc_codigo || null,
    subscription: typeof subscription === 'string' ? subscription : JSON.stringify(subscription),
    endpoint,
    activa:       true,
    updated_at:   new Date().toISOString(),
  }, { onConflict: 'endpoint' });

  if (error) {
    console.error('[save-subscription]', error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ ok: true, renovacion: !!renovacion });
};
