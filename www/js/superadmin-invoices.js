(function () {
  const panel = document.getElementById('panel-invoices');
  if (!panel) return;
  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof supabase.from !== 'function') {
    window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  async function init() {
    await loadDojos();
    attachEvents();
  }

  async function loadDojos() {
    const sel = document.getElementById('invoice-dojo');
    if (!sel) return;
    sel.innerHTML = '<option value="">Cargando...</option>';
    try {
      const { data, error } = await supabase.from('associations').select('id, name').order('name');
      if (error) throw error;
      const rows = data || [];
      sel.innerHTML = '<option value="">Seleccionar Dojo</option>' + rows.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    } catch (e) {
      sel.innerHTML = '<option value="">Error cargando dojos</option>';
    }
  }

  function attachEvents() {
    const loadBtn = document.getElementById('btn-load-dojo-registrations');
    if (loadBtn) loadBtn.onclick = loadRegistrationsForDojo;
    const createBtn = document.getElementById('btn-create-invoice');
    if (createBtn) createBtn.onclick = createInvoiceFromSelection;
    const previewBtn = document.getElementById('btn-preview-invoice');
    if (previewBtn) previewBtn.onclick = previewInvoice;
    const validateBtn = document.getElementById('btn-validate-code');
    if (validateBtn) validateBtn.onclick = validateCode;
    const markPaidBtn = document.getElementById('btn-mark-paid');
    if (markPaidBtn) markPaidBtn.onclick = markCurrentPaid;
    const printBtn = document.getElementById('btn-print-invoice');
    if (printBtn) printBtn.onclick = printInvoice;
  }

  async function loadRegistrationsForDojo() {
    const dojoId = document.getElementById('invoice-dojo')?.value;
    if (!dojoId) { Display.toast('Selecciona un Dojo', 'warning'); return; }
    const listWrap = document.getElementById('invoice-registrations');
    const listEl = document.getElementById('invoice-registrations-list');
    listWrap.style.display = 'block';
    listEl.innerHTML = '<div class="text-center"><span class="spinner"></span> Cargando inscripciones...</div>';
    try {
      const { data, error } = await supabase.from('registrations').select('id, competitors(id, full_name), category_id, category:categories(name)').eq('dojo_id', dojoId).order('created_at');
      if (error) throw error;
      const regs = data || [];
      if (!regs.length) { listEl.innerHTML = '<div class="text-sm text-muted">No hay inscripciones para este Dojo.</div>'; return; }
      listEl.innerHTML = regs.map(r => `
        <label style="display:block;padding:6px;border-bottom:1px solid #eee;">
          <input type="checkbox" data-reg="${r.id}" /> ${escapeHtml(r.competitors?.full_name || 'Sin nombre')} · ${escapeHtml((r.category && r.category.name) || '')}
          <input type="number" data-price="${r.id}" value="20" style="width:90px;float:right;" />
        </label>
      `).join('');
    } catch (e) {
      listEl.innerHTML = '<div class="text-sm text-danger">Error cargando inscripciones.</div>';
    }
  }

  function collectSelectedItems() {
    const listEl = document.getElementById('invoice-registrations-list');
    if (!listEl) return [];
    const checks = Array.from(listEl.querySelectorAll('input[type="checkbox"][data-reg]'));
    const items = [];
    for (const ch of checks) {
      if (!ch.checked) continue;
      const regId = ch.dataset.reg;
      const priceEl = listEl.querySelector(`input[data-price="${regId}"]`);
      const price = Number(priceEl?.value || 0);
      const label = ch.parentElement ? ch.parentElement.textContent.trim() : regId;
      items.push({ registration_id: regId, competitor_name: label, category_name: '', unit_price: price, qty: 1 });
    }
    return items;
  }

  async function createInvoiceFromSelection() {
    const dojoId = document.getElementById('invoice-dojo')?.value;
    if (!dojoId) { Display.toast('Selecciona un Dojo', 'warning'); return; }
    const items = collectSelectedItems();
    if (!items.length) { Display.toast('Selecciona al menos un participante', 'warning'); return; }
    const due = document.getElementById('invoice-due')?.value || null;
    const notes = document.getElementById('invoice-notes')?.value || null;
    try {
      const res = await Invoices.createInvoice({ dojoId, issuedBy: Auth.getSession()?.userId, dueAt: due, items, notes });
      Display.toast('Factura creada', 'success');
      showInvoiceResult(res.invoice, res.items);
    } catch (e) {
      Display.toast(e.message || 'Error creando factura', 'error');
    }
  }

  function previewInvoice() {
    const items = collectSelectedItems();
    if (!items.length) { Display.toast('Selecciona al menos un participante', 'warning'); return; }
    const html = `
      <div style="padding:12px;background:#fff;color:#000;">
        <h3>Preview de factura</h3>
        <ul>${items.map(it => `<li>${escapeHtml(it.competitor_name)} — ${money(it.unit_price)}</li>`).join('')}</ul>
        <div><strong>Total:</strong> ${money(items.reduce((s,i)=>s+(i.unit_price||0),0))}</div>
      </div>
    `;
    const win = window.open('', '_blank', 'width=600,height=600');
    if (!win) return; win.document.write(html); win.document.close();
  }

  let lastInvoice = null;
  async function showInvoiceResult(invoice, items) {
    lastInvoice = invoice;
    const info = document.getElementById('invoice-info');
    const canvas = document.getElementById('invoice-qr');
    const wrap = document.getElementById('invoice-result');
    info.innerHTML = `<div><strong>Código:</strong> ${escapeHtml(invoice.code)} · <strong>Total:</strong> ${money(invoice.total)}</div>`;
    // generate QR
    try {
      if (typeof QRious !== 'undefined') {
        const qr = new QRious({ element: canvas, value: invoice.code, size: 200 });
      } else if (typeof qrious !== 'undefined') {
        const qr = new qrious.QRious({ element: canvas, value: invoice.code, size: 200 });
      }
    } catch (_) {}
    wrap.style.display = 'block';
  }

  async function validateCode() {
    const code = document.getElementById('validate-code')?.value?.trim();
    const out = document.getElementById('validate-result');
    out.textContent = '';
    if (!code) { Display.toast('Ingresa un código', 'warning'); return; }
    try {
      const inv = await Invoices.getInvoiceByCode(code);
      if (!inv || !inv.id) { out.textContent = 'Código no encontrado'; return; }
      out.textContent = `Factura ${inv.code} · ${inv.status} · Total: ${money(inv.total)}`;
    } catch (e) {
      out.textContent = 'Error al validar código';
    }
  }

  async function markCurrentPaid() {
    if (!lastInvoice || !lastInvoice.code) return Display.toast('No hay factura seleccionada', 'warning');
    try {
      await Invoices.markInvoicePaid(lastInvoice.code, { amount: lastInvoice.total, method: 'manual' });
      Display.toast('Factura marcada como pagada', 'success');
      document.getElementById('validate-result').textContent = `Factura ${lastInvoice.code} · paid`;
      // Update registration list UI to reflect paid status
      try {
        const inv = await Invoices.getInvoiceByCode(lastInvoice.code);
        const items = Array.isArray(inv?.invoice_items) ? inv.invoice_items : [];
        for (const it of items) {
          if (!it.registration_id) continue;
          const ch = document.querySelector(`#invoice-registrations-list input[type=checkbox][data-reg="${it.registration_id}"]`);
          if (ch) {
            ch.checked = true; ch.disabled = true;
            const lab = ch.parentElement; if (lab) {
              let badge = lab.querySelector('.paid-badge');
              if (!badge) {
                badge = document.createElement('span'); badge.className = 'paid-badge';
                badge.style.marginLeft = '8px'; badge.style.color = '#059669'; badge.textContent = 'Pagado';
                lab.appendChild(badge);
              }
            }
          }
        }
      } catch (_) {}
    } catch (e) { Display.toast(e.message || 'Error marcando pago', 'error'); }
  }

  function printInvoice() {
    if (!lastInvoice) return Display.toast('No hay factura para imprimir', 'warning');
    const html = `<div style="padding:18px;color:#000;font-family:Arial,Helvetica,sans-serif;"><h2>Recibo ${escapeHtml(lastInvoice.code)}</h2><div>Total: ${money(lastInvoice.total)}</div></div>`;
    const w = window.open('', '_blank', 'width=700,height=800'); if (!w) return; w.document.write(html); w.document.close(); w.print();
  }

  function money(v) { return '$' + Number(v || 0).toFixed(2); }
  function escapeHtml(s) { return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;', '"':'&quot;'}[c])); }

  init();
})();
