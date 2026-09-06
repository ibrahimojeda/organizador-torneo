$file = 'c:\Users\venta\Desktop\Organizador de Torneo\views\public.html'
$content = Get-Content $file -Raw

$oldBlock = '           // --- KATA POR DUELOS: marcador con tabla de puntuaciones estilo WKF 2026 ---
          const isDuel = !!projectionLive?.kataDuel || !!liveMatch?.competitor_b_id;
          if (isDuel) {
            const duelSummary = Matches.getKataDuelSummary(liveMatch);
            const judgesSeats = Array.isArray(duelSummary.summaryA?.judges) 
              ? duelSummary.summaryA.judges.map(j => j.seat) 
              : ['"'"'J1'"'"','"'"'J2'"'"','"'"'J3'"'"','"'"'J4'"'"','"'"'J5'"'"'];
            const judgeCount = judgesSeats.length;
            const winnerLabel = duelSummary.winner ? (duelSummary.winner === '"'"'a'"'"' ? '"'"'AO'"'"' : '"'"'AKA'"'"') : null;
            const scoresRowA = judgesSeats.map(seat => {
              const j = duelSummary.summaryA?.judges?.find(jj => jj.seat === seat);
              return Number.isFinite(Number(j?.score)) ? Number(j.score).toFixed(2) : '"'"'—'"'"';
            });
            const scoresRowB = judgesSeats.map(seat => {
              const j = duelSummary.summaryB?.judges?.find(jj => jj.seat === seat);
              return Number.isFinite(Number(j?.score)) ? Number(j.score).toFixed(2) : '"'"'—'"'"';
            });
            const judgeDecisions = judgesSeats.map(seat => {
              const r = duelSummary.judgeResults?.find(jr => jr.seat === seat);
              if (!r || !r.winner) return '"'"'pending'"'"';
              return r.winner;
            });
            const totalA = duelSummary.summaryA?.total != null ? Number(duelSummary.summaryA.total).toFixed(2) : '"'"'—'"'"';
            const totalB = duelSummary.summaryB?.total != null ? Number(duelSummary.summaryB.total).toFixed(2) : '"'"'—'"'"';
            content.innerHTML = "'"'"''"'"";
            const winnerBar = winnerLabel
              ? `"'"'<div style=\\"margin-top:1rem;padding:.85rem 1.5rem;border-radius:14px;background:linear-gradient(135deg,#1d4ed8,#0f3ea8);text-align:center;font-size:clamp(1.4rem,2.5vw,2.2rem);font-weight:900;color:#fff;letter-spacing:.03em;box-shadow:0 8px 30px rgba(29,78,216,.35);\\">
                  \\U0001F3C6 WINNER: ${winnerLabel === '"'"'AO'"'"' ? nameA : nameB} (${winnerLabel}) ${duelSummary.scoreA} - ${duelSummary.scoreB}
                 </div>"'"'`
              : `"'"'<div style=\\"margin-top:1rem;padding:.85rem 1.5rem;border-radius:14px;background:rgba(255,255,255,.08);border:1px dashed rgba(255,255,255,.2);text-align:center;font-size:1.1rem;font-weight:700;opacity:.7;\\">
                  \\u23F3 Esperando notas de ambos contendientes...
                 </div>"'"'`;
            const tableCols = judgeCount;'

Write-Host "Old block length: $($oldBlock.Length)"

if ($content.Contains($oldBlock)) {
  Write-Host "FOUND! Replacing..."
} else {
  Write-Host "NOT FOUND - trying search"
  $idx = $content.IndexOf('const duelSummary = Matches.getKataDuelSummary')
  if ($idx -ge 0) {
    Write-Host "Found at index $idx"
    Write-Host "Context: " $content.Substring($idx, 200)
  }
}
