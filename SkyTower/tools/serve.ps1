# Minimal static file server for local testing (no Node required).
# Usage: powershell -ExecutionPolicy Bypass -File tools\serve.ps1 [-Port 8790]
param([int]$Port = 8790)
$root = Split-Path -Parent $PSScriptRoot
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
           '.png'='image/png'; '.json'='application/json'; '.webmanifest'='application/manifest+json'; '.svg'='image/svg+xml' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Serving $root at http://localhost:$Port/www/"
while ($l.IsListening) {
  $c = $l.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $c.Response.Redirect('/www/'); $c.Response.Close(); continue }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if ((Test-Path $path -PathType Container)) { $path = Join-Path $path 'index.html' }
    if ($path.StartsWith($root) -and (Test-Path $path -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($path)
      $ext = [IO.Path]::GetExtension($path).ToLower()
      if ($mime.ContainsKey($ext)) { $c.Response.ContentType = $mime[$ext] }
      $c.Response.Headers.Add('Cache-Control', 'no-store')
      $c.Response.ContentLength64 = $bytes.Length
      $c.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $c.Response.StatusCode = 404 }
  } catch { try { $c.Response.StatusCode = 500 } catch {} }
  finally { try { $c.Response.Close() } catch {} }
}
