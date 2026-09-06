$file = 'c:\Users\venta\Desktop\Organizador de Torneo\views\public.html'
$content = [System.IO.File]::ReadAllText($file)

# Remove the heading redefinition (lines 1239-1241)
$old1 = "            const heading = (clockText = _projectionClockText()) => state.displayMode
              ? `$" + "{`$" + "{heading()}}"
$old1 = $old1.Substring(0, 20)

# Actually, let's just search for key text and replace line by line
$lines = $content -split "`r`n"
$newLines = @()
$inHeading = $false
foreach ($line in $lines) {
  if ($line -match '^\s+const heading = \(clockText = _projectionClockText') {
    $inHeading = $true
    $newLines += $line -replace 'const heading = \(clockText = _projectionClockText\).*', ''
    # Skip the continuation line too
    continue
  }
  if ($inHeading) {
    if ($line -match "^\s+: '';\s*$" -or $line -match "^\s+: ''") {
      $inHeading = $false
      # Don't add the empty line - heading redefinition removed
      continue
    }
    # Still inside heading - skip
    continue
  }
  $newLines += $line
}

# Now add nameA2, clubA2 etc after const totalB line
$temp = $newLines -join "`r`n"
$marker = "const totalB = duelSummary.summaryB?.total != null ? Number(duelSummary.summaryB.total).toFixed(2) : '—';"
$varsToAdd = @"
            const nameA2 = nameA;
            const nameB2 = nameB;
            const clubA2 = clubA;
            const clubB2 = projectionLive?.clubB || liveMatch.competitor_b?.competitors?.club || liveMatch.competitor_b?.club || '';
            const judgesA = Array.isArray(duelSummary.summaryA?.judges) ? duelSummary.summaryA.judges : [];
            const judgesB = Array.isArray(duelSummary.summaryB?.judges) ? duelSummary.summaryB.judges : [];
"@
$temp = $temp.Replace($marker, $marker + "`r`n" + $varsToAdd)

[System.IO.File]::WriteAllText($file, $temp)
Write-Host "Done!"