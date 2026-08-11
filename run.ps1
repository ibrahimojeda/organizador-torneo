param([int]$Port=3000)
$env:PORT = $Port
Write-Host "Starting server (node server.js) on port $Port..."
# Start node in a new process so this script can continue and open the browser
Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory (Get-Location)
Start-Sleep -Milliseconds 600
try { Start-Process "http://localhost:$Port" } catch { }
