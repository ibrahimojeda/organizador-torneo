// superadmin-payments.js — Calculadora/tabulador de pagos

(function () {
  const paymentsCalc = document.getElementById('payments-calc');
  if (!paymentsCalc) return;
  let tarifas = [
    { concepto: 'Inscripción general', monto: 20 },
    { concepto: 'Categoría extra', monto: 10 },
    { concepto: 'Descuento club', monto: -5 }
  ];
  let participantes = 100;
  render();

  function render() {
    paymentsCalc.innerHTML = `
      <h3>Tarifas de Evento</h3>
      <table class="table table-sm" style="max-width:400px">
        <thead><tr><th>Concepto</th><th>Monto ($)</th><th></th></tr></thead>
        <tbody>
          ${tarifas.map((t,i) => `<tr><td><input class="form-control tarifa-concepto" data-i="${i}" value="${t.concepto}"></td><td><input class="form-control tarifa-monto" data-i="${i}" type="number" value="${t.monto}"></td><td><button class="btn btn-xs btn-danger tarifa-del" data-i="${i}">✕</button></td></tr>`).join('')}
        </tbody>
      </table>
      <button class="btn btn-xs btn-outline" id="add-tarifa">+ Agregar tarifa</button>
      <hr>
      <h3>Simulador de Ingresos</h3>
      <label>Participantes: <input id="sim-participantes" class="form-control" style="width:80px;display:inline" type="number" value="${participantes}"></label>
      <div id="sim-resultado" style="margin-top:8px;font-weight:bold"></div>
      <button class="btn btn-xs btn-outline" id="export-tarifas">Exportar tarifas</button>
    `;
    attachEvents();
    simular();
  }
  function attachEvents() {
    document.getElementById('add-tarifa').onclick = () => {
      tarifas.push({ concepto: '', monto: 0 });
      render();
    };
    document.querySelectorAll('.tarifa-concepto').forEach(inp => {
      inp.oninput = e => { tarifas[+inp.dataset.i].concepto = inp.value; };
    });
    document.querySelectorAll('.tarifa-monto').forEach(inp => {
      inp.oninput = e => { tarifas[+inp.dataset.i].monto = +inp.value; simular(); };
    });
    document.querySelectorAll('.tarifa-del').forEach(btn => {
      btn.onclick = () => { tarifas.splice(+btn.dataset.i,1); render(); };
    });
    document.getElementById('sim-participantes').oninput = e => {
      participantes = +e.target.value;
      simular();
    };
    document.getElementById('export-tarifas').onclick = () => {
      const csv = 'Concepto,Monto\n' + tarifas.map(t => `${t.concepto},${t.monto}`).join('\n');
      const blob = new Blob([csv], {type:'text/csv'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tarifas_evento.csv';
      a.click();
    };
  }
  function simular() {
    const total = tarifas.reduce((acc,t) => acc + t.monto,0) * participantes;
    document.getElementById('sim-resultado').textContent = `Ingreso estimado: $${total}`;
  }
})();
// superadmin-payments.js — Calculadora/tabulador de pagos editable

function renderPaymentsCalculator() {
  const calc = document.getElementById('payments-calc');
  calc.innerHTML = `<div>
    <label>Tarifa por inscripción: <input type='number' id='fee-inscription' value='1000' min='0' step='100'> $</label><br>
    <label>Descuento por club: <input type='number' id='discount-club' value='0' min='0' step='100'> $</label><br>
    <button onclick='calculatePayments()'>Calcular</button>
    <div id='payments-result'></div>
  </div>`;
}

window.calculatePayments = function() {
  const fee = parseInt(document.getElementById('fee-inscription').value, 10) || 0;
  const discount = parseInt(document.getElementById('discount-club').value, 10) || 0;
  const result = document.getElementById('payments-result');
  result.innerHTML = `<b>Total estimado:</b> $${fee - discount}`;
};
