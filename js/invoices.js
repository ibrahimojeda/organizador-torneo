/* INVOICES.JS — Facturación básica (cliente Supabase)
   Funciones:
   - createInvoice({ dojoId, issuedBy, dueAt, items: [{registration_id, competitor_name, category_name, unit_price, qty}] , notes })
   - getInvoiceByCode(code)
   - markInvoicePaid(code, { amount, method, reference })
*/

const Invoices = (() => {
  async function _ensureClient() {
    if (typeof supabase !== 'undefined' && supabase && typeof supabase.from === 'function') return true;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
    try {
      window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return true;
    } catch (_) { return false; }
  }

  function _generateCode() {
    const a = Date.now().toString(36).toUpperCase();
    const b = Math.random().toString(36).slice(2,8).toUpperCase();
    return `INV-${a.slice(-6)}-${b}`;
  }

  async function createInvoice({ dojoId = null, issuedBy = null, dueAt = null, items = [], notes = null } = {}) {
    if (!await _ensureClient()) throw new Error('Supabase no configurado');
    if (!Array.isArray(items) || !items.length) throw new Error('Items de la factura vacíos');

    const calcTotal = (items || []).reduce((sum, it) => {
      const u = Number(it.unit_price || 0);
      const q = Number(it.qty || 1);
      return sum + (isNaN(u) ? 0 : u * (isNaN(q) ? 1 : q));
    }, 0);

    const code = _generateCode();
    const invoicePayload = {
      code,
      dojo_id: dojoId,
      issued_by: issuedBy,
      due_at: dueAt || null,
      total: Number(calcTotal.toFixed(2)),
      status: 'pending',
      notes: notes ? notes : null,
    };

    const { data: invData, error: invErr } = await supabase.from('invoices').insert(invoicePayload).select().maybeSingle();
    if (invErr) throw invErr;
    const invoice = invData || null;
    if (!invoice || !invoice.id) throw new Error('No se pudo crear la factura');

    const itemsPayload = (items || []).map(it => ({
      invoice_id: invoice.id,
      registration_id: it.registration_id || null,
      competitor_name: it.competitor_name || null,
      category_name: it.category_name || null,
      unit_price: Number((it.unit_price || 0)),
      qty: Number(it.qty || 1),
      total: Number(((it.unit_price || 0) * (it.qty || 1)).toFixed(2)),
    }));

    const { data: itemsData, error: itemsErr } = await supabase.from('invoice_items').insert(itemsPayload).select();
    if (itemsErr) throw itemsErr;

    // Return invoice with items
    return { invoice: invoice, items: itemsData };
  }

  async function getInvoiceByCode(code) {
    if (!code) throw new Error('Código requerido');
    if (!await _ensureClient()) throw new Error('Supabase no configurado');
    const { data, error } = await supabase.from('invoices').select('*, invoice_items(*)').eq('code', code).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function markInvoicePaid(code, { amount = null, method = 'manual', reference = null } = {}) {
    if (!code) throw new Error('Código requerido');
    if (!await _ensureClient()) throw new Error('Supabase no configurado');

    const invoice = await getInvoiceByCode(code);
    if (!invoice || !invoice.id) throw new Error('Factura no encontrada');

    // Register payment
    const payPayload = { invoice_id: invoice.id, amount: amount || invoice.total || 0, method, reference };
    const { data: payData, error: payErr } = await supabase.from('invoice_payments').insert(payPayload).select().maybeSingle();
    if (payErr) throw payErr;

    // Update invoice status
    const { data: updated, error: updErr } = await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoice.id).select().maybeSingle();
    if (updErr) throw updErr;

    // Optionally mark linked registrations as paid/approved
    try {
      const items = Array.isArray(invoice.invoice_items) ? invoice.invoice_items : [];
      for (const it of items) {
        if (it.registration_id) {
          await supabase.from('registrations').update({ paid: true }).eq('id', it.registration_id);
        }
      }
    } catch (_) {}

    return { invoice: updated, payment: payData };
  }

  return {
    createInvoice,
    getInvoiceByCode,
    markInvoicePaid,
  };
})();

// Expose globally
window.Invoices = Invoices;
