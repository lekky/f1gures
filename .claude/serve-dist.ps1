param([int]$Port = 4321)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$root = Join-Path $repoRoot 'dist'
if (-not (Test-Path $root)) {
  Write-Host "ERROR: $root doesn't exist. Run 'npm run build' first, or pull a commit that includes a built dist/." -ForegroundColor Red
  exit 1
}
$mime = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8';
  '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8';
  '.mjs'='application/javascript; charset=utf-8';
  '.json'='application/json; charset=utf-8'; '.xml'='application/xml; charset=utf-8';
  '.txt'='text/plain; charset=utf-8'; '.webmanifest'='application/manifest+json';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.gif'='image/gif';
  '.webp'='image/webp'; '.svg'='image/svg+xml'; '.ico'='image/x-icon';
  '.woff'='font/woff'; '.woff2'='font/woff2'; '.ttf'='font/ttf'; '.map'='application/json'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving Astro dist/ from $root on http://localhost:$Port/" -ForegroundColor Green
Write-Host "Pages: / /calendar/ /circuits/ /standings-drivers/ /standings-constructors/" -ForegroundColor Cyan
Write-Host "Ctrl+C to stop." -ForegroundColor DarkGray
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
        # Astro emits dir/index.html for trailingSlash 'always'. Map /foo/ → /foo/index.html.
        $idx = Join-Path $full 'index.html'
        if (Test-Path -LiteralPath $idx) { $full = $idx } else { $res.StatusCode = 404 }
      } elseif (-not (Test-Path -LiteralPath $full)) {
        # Try /foo → /foo/index.html (no trailing slash)
        $alt = Join-Path $full 'index.html'
        if (Test-Path -LiteralPath $alt) { $full = $alt } else { $res.StatusCode = 404 }
      }
      if ($res.StatusCode -eq 200) {
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $msg = [System.Text.Encoding]::UTF8.GetBytes("Not found: $relRaw")
        $res.ContentLength64 = $msg.Length
        $res.OutputStream.Write($msg, 0, $msg.Length)
      }
    } catch {
      $res.StatusCode = 500
      $msg = [System.Text.Encoding]::UTF8.GetBytes("500: $($_.Exception.Message)")
      $res.OutputStream.Write($msg, 0, $msg.Length)
    } finally {
      $res.Close()
    }
  }
} finally {
  $listener.Stop()
}
