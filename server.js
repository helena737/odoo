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

// ── Documentación técnica Odoo embebida ──────────────────────────────────────
const ODOO_DOCS = {
  models: {
    "res.partner": {
      desc: "Contactos, clientes y proveedores",
      fields: { name:"Char(required)", email:"Char", phone:"Char", mobile:"Char", street:"Char", city:"Char", zip:"Char", country_id:"Many2one(res.country)", state_id:"Many2one(res.country.state)", is_company:"Boolean", customer_rank:"Integer", supplier_rank:"Integer", vat:"Char(NIF/CIF)", lang:"Selection", active:"Boolean", comment:"Html", category_id:"Many2many(res.partner.category)" },
      methods: ["create","write","unlink","search_read","read","search","fields_get"]
    },
    "product.template": {
      desc: "Plantillas de productos",
      fields: { name:"Char(required)", list_price:"Float(precio venta)", standard_price:"Float(coste)", type:"Selection(consu/service/product)", sale_ok:"Boolean", purchase_ok:"Boolean", active:"Boolean", categ_id:"Many2one(product.category)", uom_id:"Many2one(uom.uom)", description_sale:"Text", taxes_id:"Many2many(account.tax)", image_1920:"Binary" },
      methods: ["create","write","unlink","search_read"]
    },
    "product.product": {
      desc: "Variantes de productos",
      fields: { product_tmpl_id:"Many2one(product.template)", default_code:"Char(referencia)", barcode:"Char", combination_indices:"Char", qty_available:"Float(stock)", virtual_available:"Float(stock previsto)" },
      methods: ["search_read","read"]
    },
    "sale.order": {
      desc: "Pedidos de venta",
      fields: { name:"Char(referencia)", partner_id:"Many2one(res.partner,required)", state:"Selection(draft/sent/sale/done/cancel)", date_order:"Datetime", amount_total:"Float", amount_untaxed:"Float", order_line:"One2many(sale.order.line)", user_id:"Many2one(res.users)", team_id:"Many2one(crm.team)", note:"Html", validity_date:"Date" },
      methods: ["create","write","action_confirm","action_cancel","search_read"]
    },
    "sale.order.line": {
      desc: "Líneas de pedido de venta",
      fields: { order_id:"Many2one(sale.order,required)", product_id:"Many2one(product.product)", name:"Text", product_uom_qty:"Float", price_unit:"Float", discount:"Float", tax_id:"Many2many(account.tax)", price_subtotal:"Float" },
      methods: ["create","write","unlink"]
    },
    "account.move": {
      desc: "Facturas y asientos contables",
      fields: { name:"Char", move_type:"Selection(out_invoice/in_invoice/out_refund/in_refund/entry)", partner_id:"Many2one(res.partner)", invoice_date:"Date", invoice_date_due:"Date", amount_total:"Float", amount_residual:"Float", state:"Selection(draft/posted/cancel)", payment_state:"Selection(not_paid/partial/paid/reversed)", invoice_line_ids:"One2many(account.move.line)", journal_id:"Many2one(account.journal)", currency_id:"Many2one(res.currency)" },
      methods: ["create","write","action_post","button_draft","search_read"]
    },
    "crm.lead": {
      desc: "Oportunidades y leads del CRM",
      fields: { name:"Char(required)", partner_id:"Many2one(res.partner)", email_from:"Char", phone:"Char", stage_id:"Many2one(crm.stage)", user_id:"Many2one(res.users)", team_id:"Many2one(crm.team)", expected_revenue:"Float", probability:"Float", date_deadline:"Date", priority:"Selection(0/1/2/3)", active:"Boolean", description:"Html", tag_ids:"Many2many(crm.tag)" },
      methods: ["create","write","action_set_won","action_set_lost","search_read"]
    },
    "project.project": {
      desc: "Proyectos",
      fields: { name:"Char(required)", user_id:"Many2one(res.users)", partner_id:"Many2one(res.partner)", date_start:"Date", date:"Date(fecha fin)", stage_id:"Many2one(project.project.stage)", active:"Boolean", privacy_visibility:"Selection", task_ids:"One2many(project.task)" },
      methods: ["create","write","search_read"]
    },
    "project.task": {
      desc: "Tareas de proyectos",
      fields: { name:"Char(required)", project_id:"Many2one(project.project)", user_ids:"Many2many(res.users)", stage_id:"Many2one(project.task.type)", date_deadline:"Datetime", priority:"Selection(0/1)", description:"Html", tag_ids:"Many2many(project.tags)", active:"Boolean", partner_id:"Many2one(res.partner)" },
      methods: ["create","write","unlink","search_read"]
    },
    "hr.employee": {
      desc: "Empleados",
      fields: { name:"Char(required)", job_title:"Char", department_id:"Many2one(hr.department)", user_id:"Many2one(res.users)", parent_id:"Many2one(hr.employee,manager)", work_email:"Char", work_phone:"Char", active:"Boolean", company_id:"Many2one(res.company)" },
      methods: ["create","write","search_read"]
    },
    "res.users": {
      desc: "Usuarios del sistema",
      fields: { name:"Char(required)", login:"Char(required)", email:"Char", active:"Boolean", groups_id:"Many2many(res.groups)", company_id:"Many2one(res.company)", partner_id:"Many2one(res.partner)" },
      methods: ["create","write","search_read"]
    },
    "ir.cron": {
      desc: "Acciones planificadas",
      fields: { name:"Char(required)", model_id:"Many2one(ir.model,required)", state:"Selection(code/object_write/object_create/multi)", code:"Text(Python)", active:"Boolean", interval_number:"Integer", interval_type:"Selection(minutes/hours/days/weeks/months)", nextcall:"Datetime", numbercall:"Integer(-1=infinito)" },
      methods: ["create","write","method_direct_trigger","search_read"]
    },
    "ir.actions.server": {
      desc: "Acciones de servidor",
      fields: { name:"Char(required)", model_id:"Many2one(ir.model,required)", state:"Selection(code/object_write/object_create/multi/email/sms)", code:"Text(Python)", active:"Boolean" },
      methods: ["create","write","run","search_read"]
    },
    "mail.template": {
      desc: "Plantillas de correo",
      fields: { name:"Char(required)", model_id:"Many2one(ir.model)", subject:"Char(Jinja2)", body_html:"Html(Jinja2)", email_to:"Char", email_from:"Char", lang:"Char" },
      methods: ["create","write","send_mail","search_read"]
    },
    "stock.picking": {
      desc: "Albaranes y transferencias",
      fields: { name:"Char", partner_id:"Many2one(res.partner)", picking_type_id:"Many2one(stock.picking.type,required)", state:"Selection(draft/waiting/confirmed/assigned/done/cancel)", scheduled_date:"Datetime", move_ids:"One2many(stock.move)" },
      methods: ["action_confirm","action_assign","button_validate","search_read"]
    },
    "purchase.order": {
      desc: "Pedidos de compra",
      fields: { name:"Char", partner_id:"Many2one(res.partner,required)", state:"Selection(draft/sent/purchase/done/cancel)", date_order:"Datetime", amount_total:"Float", order_line:"One2many(purchase.order.line)", user_id:"Many2one(res.users)" },
      methods: ["button_confirm","button_cancel","search_read"]
    }
  },
  xmlrpc: {
    auth: "uid = common.authenticate(db, username, api_key, {})",
    search_read: "models.execute_kw(db, uid, api_key, 'model', 'search_read', [[domain]], {'fields': ['f1','f2'], 'limit': 10})",
    create: "id = models.execute_kw(db, uid, api_key, 'model', 'create', [{'field': 'value'}])",
    write: "models.execute_kw(db, uid, api_key, 'model', 'write', [[id], {'field': 'value'}])",
    unlink: "models.execute_kw(db, uid, api_key, 'model', 'unlink', [[id]])",
    fields_get: "models.execute_kw(db, uid, api_key, 'model', 'fields_get', [], {'attributes': ['string','type','required']})"
  },
  domains: {
    syntax: "[['field', 'operator', 'value']]",
    operators: ["=","!=",">",">=","<","<=","like","ilike","in","not in","=like","=ilike","child_of"],
    logical: ["'&'(AND default)","'|'(OR)","'!'(NOT)"],
    examples: {
      "contactos empresa": "[['is_company','=',True]]",
      "facturas pendientes": "[['state','=','posted'],['payment_state','!=','paid']]",
      "productos activos": "[['active','=',True]]",
      "leads este mes": "[['create_date','>=','2025-01-01']]"
    }
  },
  studio: {
    field_types: { Char:"texto corto", Text:"texto largo", Integer:"número entero", Float:"número decimal", Monetary:"importe con divisa", Boolean:"checkbox sí/no", Date:"fecha", Datetime:"fecha y hora", Selection:"lista desplegable fija", Many2one:"relación a otro registro", One2many:"lista de registros hijos", Many2many:"relación múltiple", Binary:"archivo/imagen", Html:"texto enriquecido" },
    naming: "Prefix: x_nombrecliente_ (ej: x_devstuidos_campo)",
    automation_triggers: ["Al crear","Al actualizar","Al crear o actualizar","Planificado","Manual"],
    automation_actions: ["Actualizar el registro","Crear un registro","Enviar email","Ejecutar código Python","Enviar notificación","Llamar a un método"],
    limits: ["Studio requiere plan Custom/Enterprise","No usar para lógica Python compleja (usar módulo custom)","Campos con datos no se pueden eliminar fácilmente","Exportar módulo Studio antes de migrar versión"]
  }
};

app.get('/docs', (req, res) => res.json(ODOO_DOCS));
