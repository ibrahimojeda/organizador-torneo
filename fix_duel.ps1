$file = 'c:\Users\venta\Desktop\Organizador de Torneo\views\public.html'
$content = [System.IO.File]::ReadAllText($file)

$oldStart = '           // --- KATA POR DUELOS: dos contendientes con sus notas de jueces ---'
$oldEnd = '              </div>;'
$idxStart = $content.IndexOf($oldStart)
$idxEnd = $content.IndexOf($oldEnd, $idxStart + 1)

Write-Host "Start: $idxStart, End: $idxEnd"

if ($idxStart -ge 0 -and $idxEnd -ge 0) {
  $idxEnd = $idxEnd + $oldEnd.Length
  $oldBlock = $content.Substring($idxStart, $idxEnd - $idxStart)
  Write-Host "Old block length: $($oldBlock.Length)"
} else {
  Write-Host "Could not find markers"
}
