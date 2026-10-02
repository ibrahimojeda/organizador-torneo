param([int]$Port=3000)
$env:PORT = $Port
Write-Host "Starting server (node server.js) on port $Port..."
# Start node in a new process so this script can continue and open the browser
$serverProcess = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory (Get-Location) -PassThru
$deadline = [DateTime]::UtcNow.AddSeconds(30)
$ready = $false
while ([DateTime]::UtcNow -lt $deadline) {
	$serverProcess.Refresh()
	if ($serverProcess.HasExited) {
		throw "The server process exited before becoming ready (exit code $($serverProcess.ExitCode))."
	}
	try {
		$response = Invoke-WebRequest -Uri "http://localhost:$Port/" -TimeoutSec 2
		if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { $ready = $true; break }
	} catch { }
	Start-Sleep -Milliseconds 250
}
if (-not $ready) { throw "The server did not become ready on port $Port within 30 seconds." }
try { Start-Process "http://localhost:$Port" } catch { }
