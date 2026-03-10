param(
  [string]$SourceUrl = "https://jornaldocarro.estadao.com.br/marcas/",
  [string]$OutputDir = "public/brands",
  [switch]$Overwrite
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$response = Invoke-WebRequest -Uri $SourceUrl -UseBasicParsing
$html = $response.Content

# Cada card tem:
# <a href=".../marcas/<slug>/"> ... style="background-image: url('<logo-url>');"
$cardPattern = '<a\s+href="https?://[^"]*/marcas/([^"/]+)/"[^>]*>[\s\S]*?background-image:\s*url\(''([^'']+)'''
$matches = [regex]::Matches($html, $cardPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

if ($matches.Count -eq 0) {
  throw "Nenhum logo encontrado no HTML. Verifique se a estrutura da página mudou."
}

$downloaded = 0
$skipped = 0

foreach ($m in $matches) {
  $slug = $m.Groups[1].Value.Trim().ToLowerInvariant()
  $logoUrl = $m.Groups[2].Value.Trim()

  if ([string]::IsNullOrWhiteSpace($slug) -or [string]::IsNullOrWhiteSpace($logoUrl)) {
    continue
  }

  # Remove querystring para descobrir extensão real
  $logoUrlNoQuery = $logoUrl.Split("?")[0]
  $ext = [System.IO.Path]::GetExtension($logoUrlNoQuery)
  if ([string]::IsNullOrWhiteSpace($ext)) {
    $ext = ".png"
  }

  $filename = "$slug$ext"
  $targetPath = Join-Path $OutputDir $filename

  if ((Test-Path $targetPath) -and -not $Overwrite.IsPresent) {
    $skipped++
    continue
  }

  Invoke-WebRequest -Uri $logoUrl -OutFile $targetPath -UseBasicParsing
  $downloaded++
}

Write-Output "Logos baixados: $downloaded"
Write-Output "Logos ignorados (ja existentes): $skipped"
Write-Output "Pasta de destino: $OutputDir"

