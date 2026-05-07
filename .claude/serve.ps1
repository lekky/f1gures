param([int]$Port = 8080)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$mime = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8';
  '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8';
  '.jsx'='application/javascript; charset=utf-8'; '.json'='application/json; charset=utf-8';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.gif'='image/gif';
  '.svg'='image/svg+xml'; '.ico'='image/x-icon'; '.woff'='font/woff'; '.woff2'='font/woff2';
  '.ttf'='font/ttf'; '.map'='application/json'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$Port/"
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request; $res = $ctx.Response
    try {
      $relRaw = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($relRaw)) { $relRaw = 'index.html' }
      $rel = $relRaw -replace '/', '\'
      $path = Join-Path $root $rel
      $full = [System.IO.Path]::GetFullPath($path)
      if (-not $full.StartsWith([System.IO.Path]::GetFullPath($root))) {
        $res.StatusCode = 403
      } elseif (Test-Path -LiteralPath $full -PathType Container) {
        $idx = Join-Path $full 'index.html'
        if (Test-Path -LiteralPath $idx) { $full = $idx } else { $res.StatusCode = 404 }
      }
      if ($res.StatusCode -eq 200 -and (Test-Path -LiteralPath $full -PathType Leaf)) {
        $ext = [System.IO.Path]::GetExtension($full).ToLower()
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } elseif ($res.StatusCode -eq 200) {
        $res.StatusCode = 404
      }
      Write-Host "$($req.HttpMethod) $($req.Url.AbsolutePath) -> $($res.StatusCode)"
    } catch {
      $res.StatusCode = 500
      Write-Host "ERR $($req.Url.AbsolutePath): $_"
    } finally { $res.OutputStream.Close() }
  }
} finally { $listener.Stop() }
