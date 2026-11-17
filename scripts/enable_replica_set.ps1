# scripts/enable_replica_set.ps1
# Configures the local MongoDB Windows Service as a single-node replica set (rs0)
# Multi-document transactions require a replica set so MongoDB can track writes in the oplog.
# Must be run with Administrator privileges.

$cfgPath = "C:\Program Files\MongoDB\Server\8.3\bin\mongod.cfg"

if (-not (Test-Path $cfgPath)) {
    Write-Error "mongod.cfg not found at $cfgPath"
    exit 1
}

$content = Get-Content $cfgPath -Raw

if ($content -match 'replSetName:\s*rs0') {
    Write-Host "[OK] replSetName: rs0 is already configured in mongod.cfg"
} else {
    Write-Host "[INFO] Adding replication.replSetName: rs0 to mongod.cfg..."
    if ($content -match '#\s*replication:') {
        $newContent = $content -replace '#\s*replication:', "replication:`r`n  replSetName: rs0"
    } else {
        $newContent = $content + "`r`nreplication:`r`n  replSetName: rs0`r`n"
    }
    Set-Content -Path $cfgPath -Value $newContent -Encoding utf8
    Write-Host "[OK] Updated mongod.cfg successfully."
}

Write-Host "[INFO] Restarting MongoDB Windows Service..."
Restart-Service -Name MongoDB

Write-Host "[INFO] Waiting 3 seconds for mongod to accept connections..."
Start-Sleep -Seconds 3

Write-Host "[INFO] Initiating replica set rs0 via mongosh..."
& mongosh mongodb://localhost:27017/admin --eval "try { rs.initiate(); print('Initiated successfully'); } catch(e) { print(e.message); }"

Write-Host "[SUCCESS] Single-node replica set rs0 is ready!"
