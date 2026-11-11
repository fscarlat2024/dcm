// Palmiye <-> TheMarketer: trimite din simularea dcm comenzi, abonați și statusuri
// în contul TheMarketer, fără să pună cheia REST în pagina publică.
// Secrete: MKTR_REST_KEY, MKTR_CUSTOMER_ID.

const API = 'https://t.themarketer.com/api/v1/';
const ORIGINS = ['https://fscarlat2024.github.io'];

function cors(origin) {
  const ok = ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
  return {
    'Access-Control-Allow-Origin': ok ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

// Construiește query string în stil PHP: products[0][product_id]=...
function qs(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') qs(v, key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return out.join('&');
}

async function call(env, path, method, params) {
  const auth = { k: (env.MKTR_REST_KEY || '').trim(), u: (env.MKTR_CUSTOMER_ID || '').trim() };
  const url = API + path + '?' + qs({ ...auth, ...params });
  const r = await fetch(url, { method });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 500); }
  return { ok: r.ok, status: r.status, data };
}

const str = (v, n = 120) => String(v ?? '').trim().slice(0, n);
const num = (v) => (Number.isFinite(+v) ? Math.round(+v * 100) / 100 : 0);
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e);

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin');
    const h = { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: h });
    const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: h });

    const { pathname, searchParams } = new URL(req.url);
    if (pathname === '/') return reply({ ok: true, service: 'palmiye-marketer', keys: !!env.MKTR_REST_KEY });

    let body = {};
    if (req.method === 'POST') {
      const raw = await req.text();
      if (raw.length > 8000) return reply({ error: 'Cerere prea mare' }, 413);
      try { body = JSON.parse(raw || '{}'); } catch { return reply({ error: 'JSON invalid' }, 400); }
    }

    // Abonare la newsletter (TheMarketer trimite emailul de confirmare)
    if (pathname === '/abonare' && req.method === 'POST') {
      const email = str(body.email);
      if (!emailOk(email)) return reply({ error: 'Email invalid' }, 400);
      return reply(await call(env, 'add_subscriber', 'POST', {
        email, phone: str(body.phone, 20), firstname: str(body.firstname, 40), lastname: str(body.lastname, 40),
        add_tags: 'aplicatie-palmiye,test',
      }));
    }

    // Comandă plătită în aplicație
    if (pathname === '/comanda' && req.method === 'POST') {
      const email = str(body.email);
      if (!emailOk(email)) return reply({ error: 'Email invalid' }, 400);
      const products = (Array.isArray(body.products) ? body.products : []).slice(0, 30).map((p) => ({
        product_id: str(p.product_id, 40), price: num(p.price), quantity: Math.max(1, Math.round(+p.quantity || 1)),
        variation_sku: str(p.variation_sku || p.product_id, 40),
      }));
      if (!products.length) return reply({ error: 'Comanda nu are produse' }, 400);
      return reply(await call(env, 'save_order', 'POST', {
        number: str(body.number, 30), email_address: email, phone: str(body.phone, 20),
        firstname: str(body.firstname, 40), lastname: str(body.lastname, 40),
        city: str(body.city || 'București', 40), county: str(body.county || 'București', 40), address: str(body.address, 160),
        discount_value: num(body.discount_value), discount_code: str(body.discount_code, 30),
        shipping: num(body.shipping), tax: num(body.tax), total_value: num(body.total_value), products,
      }));
    }

    // Schimbare de status (În lucru, Pe drum, Livrată)
    if (pathname === '/status' && req.method === 'POST') {
      return reply(await call(env, 'update_order_status', 'GET', {
        order_number: str(body.number, 30), order_status: str(body.status, 30),
      }));
    }

    // Punctele de fidelitate ale unui client
    if (pathname === '/puncte' && req.method === 'GET') {
      const email = str(searchParams.get('email'));
      if (!emailOk(email)) return reply({ error: 'Email invalid' }, 400);
      return reply(await call(env, 'loyalty_info', 'GET', { email }));
    }

    return reply({ error: 'Nu există' }, 404);
  },
};
