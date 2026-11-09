# Draws the app icons (no external assets). Usage: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
Add-Type -AssemblyName System.Drawing
$out = Join-Path (Split-Path -Parent $PSScriptRoot) 'www\icons'
New-Item -ItemType Directory -Force $out | Out-Null

function Color($hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }

function Draw([int]$size, [string]$name) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $u = $size / 100.0
  $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
  $sky = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, (Color '#1f78ea'), (Color '#bfe8ff'), 90
  $g.FillRectangle($sky, $rect)

  # lava band
  $g.FillRectangle((New-Object System.Drawing.SolidBrush (Color '#ff7a1f')), 0, [int](84 * $u), $size, [int](17 * $u))
  $g.FillRectangle((New-Object System.Drawing.SolidBrush (Color '#ffc93c')), 0, [int](90 * $u), $size, [int](11 * $u))

  # tower
  $g.FillRectangle((New-Object System.Drawing.SolidBrush (Color '#d9c6a5')), [single](36 * $u), 0, [single](28 * $u), [single](90 * $u))

  # platforms: brown body with a green top
  $plat = {
    param($x, $y, $w)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush (Color '#a06f49')), [single]($x * $u), [single](($y + 3) * $u), [single]($w * $u), [single](6 * $u))
    $g.FillRectangle((New-Object System.Drawing.SolidBrush (Color '#7ed957')), [single]($x * $u), [single]($y * $u), [single]($w * $u), [single](4 * $u))
  }
  & $plat 56 22 34
  & $plat 10 44 34
  & $plat 28 73 44

  # character
  $g.FillEllipse((New-Object System.Drawing.SolidBrush (Color '#ffc93c')), [single](34 * $u), [single](44 * $u), [single](32 * $u), [single](30 * $u))
  $g.FillEllipse((New-Object System.Drawing.SolidBrush (Color '#fff0b8')), [single](41 * $u), [single](57 * $u), [single](18 * $u), [single](14 * $u))
  $ink = New-Object System.Drawing.SolidBrush (Color '#1c2033')
  $g.FillEllipse($ink, [single](42 * $u), [single](50 * $u), [single](5 * $u), [single](7 * $u))
  $g.FillEllipse($ink, [single](53 * $u), [single](50 * $u), [single](5 * $u), [single](7 * $u))

  $g.Dispose()
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
Draw 180 'icon-180.png'
Draw 192 'icon-192.png'
Draw 512 'icon-512.png'
Write-Host "Wrote icons to $out"
