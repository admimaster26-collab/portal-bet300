/**
 * BET300 · Vercel Function: /api/save-subscription
 * Guarda o actualiza la push subscription de un usuario.
 * POST { usuario, pc_codigo, subscription }
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

  const { usuario, pc_codigo, subscription, renovacion } = req.body || {};
  if (!usuario || !subscription) {
    return res.status(400).json({ error: 'usuario y subscription requeridos' });
  }

  const sb = createClient(SB_URL, SB_KEY);

  const endpoint = typeof subscription === 'string'
    ? JSON.parse(subscription).endpoint
    : subscription.endpoint;

  const { error } = await sb.from('push_subscriptions').upsert({
    usuario:      String(usuario).trim().toLowerCase(),
    pc_codigo:    pc_codigo || 'P1',
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
