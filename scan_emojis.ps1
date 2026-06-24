$files = Get-ChildItem -Path . -File -Recurse | Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\\.git\\' -and $_.FullName -notmatch '\\dist\\' -and $_.FullName -match '\.(ts|tsx|js|jsx|md|html)$' }
foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw
    if ($content -match '[\uD800-\uDBFF][\uDC00-\uDFFF]') {
        Write-Host "Emoji found in: $($file.FullName)"
    }
}
Write-Host "Scan complete."
