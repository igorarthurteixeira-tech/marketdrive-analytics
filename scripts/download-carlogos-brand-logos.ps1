param(
  [string]$IndexUrl = "https://www.carlogos.org/car-brands-a-z/",
  [string]$OutputDir = "public/brands",
  [switch]$Overwrite,
  [int]$Limit = 0,
  [int]$DelayMs = 120
)

$ErrorActionPreference = "Stop"

function Get-NormalizedSlug {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }

  $text = $Value.Trim().ToLowerInvariant()
  $text = [regex]::Replace($text, "-logo\.html$", "")
  $text = [regex]::Replace($text, "[^a-z0-9\-]+", "-")
  $text = [regex]::Replace($text, "-{2,}", "-")
  $text = $text.Trim("-")
  return $text
}

function To-AbsoluteUrl {
  param(
    [string]$Url,
    [string]$BaseUrl
  )

  if ([string]::IsNullOrWhiteSpace($Url)) { return $null }
  if ($Url.StartsWith("http://") -or $Url.StartsWith("https://")) { return $Url }

  $base = [System.Uri]::new($BaseUrl)
  $full = [System.Uri]::new($base, $Url)
  return $full.AbsoluteUri
}

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

Write-Output "Lendo indice: $IndexUrl"
$indexResponse = Invoke-WebRequest -Uri $IndexUrl -UseBasicParsing
$indexHtml = $indexResponse.Content

# Exemplo:
# <dd><a href="/car-brands/mercedes-benz-logo.html" title="Mercedes Logo">Mercedes-Benz</a></dd>
$entryPattern = '<dd><a href="(/car-brands/([^"]+))" title="[^"]+">([^<]+)</a></dd>'
$entryMatches = [regex]::Matches(
  $indexHtml,
  $entryPattern,
  [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

if ($entryMatches.Count -eq 0) {
  throw "Nenhuma marca encontrada na pagina de indice."
}

$entries = @()
foreach ($m in $entryMatches) {
  $relativePage = $m.Groups[1].Value.Trim()
  $pageFile = $m.Groups[2].Value.Trim()
  $brandName = [System.Net.WebUtility]::HtmlDecode($m.Groups[3].Value.Trim())
  $slug = Get-NormalizedSlug -Value $pageFile

  if ([string]::IsNullOrWhiteSpace($relativePage) -or [string]::IsNullOrWhiteSpace($slug)) {
    continue
  }

  $entries += [pscustomobject]@{
    BrandName = $brandName
    Slug = $slug
    PageUrl = To-AbsoluteUrl -Url $relativePage -BaseUrl $IndexUrl
  }
}

# Remove duplicados por slug
$entries = $entries |
  Group-Object Slug |
  ForEach-Object { $_.Group[0] } |
  Sort-Object Slug

if ($Limit -gt 0) {
  $entries = $entries | Select-Object -First $Limit
}

Write-Output "Marcas para processar: $($entries.Count)"

$downloaded = 0
$skipped = 0
$failed = 0

foreach ($entry in $entries) {
  try {
    $pageResponse = Invoke-WebRequest -Uri $entry.PageUrl -UseBasicParsing
    $pageHtml = $pageResponse.Content

    # Primeiro tenta OpenGraph image
    $ogMatch = [regex]::Match(
      $pageHtml,
      '<meta\s+property="og:image"\s+content="([^"]+)"',
      [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    $imageUrl = $null
    if ($ogMatch.Success) {
      $imageUrl = $ogMatch.Groups[1].Value.Trim()
    } else {
      # Fallback: primeira imagem do conteudo principal
      $imgMatch = [regex]::Match(
        $pageHtml,
        '<img[^>]+src="([^"]+)"[^>]*>',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
      )
      if ($imgMatch.Success) {
        $imageUrl = $imgMatch.Groups[1].Value.Trim()
      }
    }

    if ([string]::IsNullOrWhiteSpace($imageUrl)) {
      Write-Output "Sem imagem: $($entry.BrandName) ($($entry.PageUrl))"
      $failed++
      continue
    }

    $imageUrl = To-AbsoluteUrl -Url $imageUrl -BaseUrl $entry.PageUrl
    if ([string]::IsNullOrWhiteSpace($imageUrl)) {
      Write-Output "URL de imagem invalida: $($entry.BrandName)"
      $failed++
      continue
    }

    $cleanImageUrl = $imageUrl.Split("?")[0]
    $extension = [System.IO.Path]::GetExtension($cleanImageUrl)
    if ([string]::IsNullOrWhiteSpace($extension)) {
      $extension = ".png"
    }

    $targetPath = Join-Path $OutputDir ($entry.Slug + $extension)
    if ((Test-Path $targetPath) -and -not $Overwrite.IsPresent) {
      $skipped++
      continue
    }

    Invoke-WebRequest -Uri $imageUrl -OutFile $targetPath -UseBasicParsing
    $downloaded++

    if ($DelayMs -gt 0) {
      Start-Sleep -Milliseconds $DelayMs
    }
  } catch {
    Write-Output "Falha ao baixar $($entry.BrandName): $($_.Exception.Message)"
    $failed++
  }
}

Write-Output "Baixados: $downloaded"
Write-Output "Ignorados (ja existentes): $skipped"
Write-Output "Falhas: $failed"
Write-Output "Destino: $OutputDir"

