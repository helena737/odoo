const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const xmlrpc = require('xmlrpc');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.options('*', cors());
app.use(express.json({ limit: '50mb' }));

function xmlrpcAuth(url, db, user, apikey) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const client = u.protocol === 'https:'
      ? xmlrpc.createSecureClient({ host: u.hostname, port: 443, path: '/xmlrpc/2/common' })
      : xmlrpc.createClient({ host: u.hostname, port: 80, path: '/xmlrpc/2/common' });
    client.methodCall('authenticate', [db, user, apikey, {}], (err, uid) => {
      if (err) return reject(err);
      if (!uid) return reject(new Error('Credenciales incorrectas'));
      resolve(uid);
    });
  });
}

function xmlrpcCall(url, db, apikey, uid, model, method, args, kwargs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const client = u.protocol === 'https:'
      ? xmlrpc.createSecureClient({ host: u.hostname, port: 443, path: '/xmlrpc/2/object' })
      : xmlrpc.createClient({ host: u.hostname, port: 80, path: '/xmlrpc/2/object' });
    client.methodCall('execute_kw', [db, uid, apikey, model, method, args, kwargs || {}], (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

app.post('/odoo/auth', async (req, res) => {
  const { url, db, user, apikey } = req.body;
  try {
    const uid = await xmlrpcAuth(url, db, user, apikey);
    res.json({ uid });
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

app.post('/odoo/call', async (req, res) => {
  const { url, db, user, apikey, uid, model, method, args, kwargs } = req.body;
  try {
    const result = await xmlrpcCall(url, db, apikey, uid, model, method, args || [], kwargs || {});
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/claude', async (req, res) => {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.json({ status: 'OK', service: 'OdooAI Proxy v2' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy corriendo en puerto ${PORT}`));
