/**
 * BET300 · Vercel Function: /api/send-push
 * Envía Web Push a uno o varios usuarios.
 * POST { usuario?, usuarios?, title, body, url, tag, secret }
 */
const webpush   = require('web-push');
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-push-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // ── VAPID (leído dentro del handler para asegurar que las env vars estén disponibles)
  const VAPID_PUB  = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIV = process.env.VAPID_PRIVATE_KEY;
  const VAPID_MAIL = process.env.VAPID_EMAIL || 'mailto:admi.master.26@gmail.com';
  const SB_URL     = process.env.SUPABASE_URL;
  const SB_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const PUSH_SEC   = process.env.PUSH_SECRET;

  if (!VAPID_PUB || !VAPID_PRIV) {
    return res.status(500).json({ error: 'VAPID keys no configuradas en Vercel env vars' });
  }
  webpush.setVapidDetails(VAPID_MAIL, VAPID_PUB, VAPID_PRIV);

  // ── Auth ──────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || req.headers['x-push-secret'] || '';
  const bodySecret = req.body?.secret || '';
  const token = authHeader.replace(/^Bearer\s+/i, '') || bodySecret;
  if (PUSH_SEC && token !== PUSH_SEC) return res.status(401).json({ error: 'No autorizado' });

  const { title, body, url, tag, usuario, usuarios, pc_codigo } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title requerido' });

  const sb = createClient(SB_URL, SB_KEY);

  // ── Buscar suscripciones ──────────────────────────────────
  let query = sb.from('push_subscriptions').select('usuario, subscription').eq('activa', true);

  if (usuario)         query = query.eq('usuario', usuario);
  else if (usuarios?.length) query = query.in('usuario', usuarios);
  else if (pc_codigo)  query = query.eq('pc_codigo', pc_codigo);
  // Si no hay filtro → envía a TODOS (campañas masivas)

  const { data: subs, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  if (!subs?.length) return res.status(200).json({ ok: true, sent: 0, reason: 'sin_suscripciones' });

  const payload = JSON.stringify({
    title,
    body:  body || '',
    url:   url  || '/',
    tag:   tag  || 'bet300',
    icon:  '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
  });

  let sent = 0, failed = 0, expired = 0;
  const errors = [];
  const expiredEndpoints = [];

  for (const row of subs) {
    try {
      const sub = typeof row.subscription === 'string'
        ? JSON.parse(row.subscription)
        : row.subscription;
      await webpush.sendNotification(sub, payload);
      sent++;
    } catch (err) {
      failed++;
      errors.push({ status: err.statusCode, body: err.body, message: err.message });
      if (err.statusCode === 410 || err.statusCode === 404) {
        expired++;
        expiredEndpoints.push(row.subscription?.endpoint || '');
      }
    }
  }

  // Desactivar suscripciones vencidas
  if (expiredEndpoints.length) {
    for (const ep of expiredEndpoints) {
      await sb.from('push_subscriptions').update({ activa: false })
        .contains('subscription', JSON.stringify({ endpoint: ep }));
    }
  }

  return res.status(200).json({ ok: true, sent, failed, expired, errors });
};
