param(
  [string]$DatasetDir = "temp_carlogos_repo_2",
  [string]$SourceSubdir = "logos/optimized",
  [string]$TargetDir = "public/brands",
  [switch]$Overwrite
)

$ErrorActionPreference = "Stop"

function Ensure-Dir([string]$path) {
  if (-not (Test-Path $path)) {
    New-Item -Path $path -ItemType Directory | Out-Null
  }
}

Ensure-Dir $TargetDir

$sourceDir = Join-Path $DatasetDir $SourceSubdir
if (-not (Test-Path $sourceDir)) {
  throw "Pasta de origem nao encontrada: $sourceDir"
}

$sourceFiles = Get-ChildItem -Path $sourceDir -File
if (-not $sourceFiles.Count) {
  throw "Nenhum logo encontrado em $sourceDir"
}

$sourceByBaseName = @{}
foreach ($file in $sourceFiles) {
  $base = [System.IO.Path]::GetFileNameWithoutExtension($file.Name).ToLowerInvariant()
  if (-not $sourceByBaseName.ContainsKey($base)) {
    $sourceByBaseName[$base] = $file.FullName
  }
}

# Mapeamentos de slugs da sua base para slugs do dataset
$aliases = @{
  "citroen" = @("citroen")
  "jac-motors" = @("jac")
  "great-wall-motor-gwm" = @("great-wall")
  "lucid-motors" = @("lucid")
  "lynk-co" = @("lynk-and-co")
  "ssangyong-kg-mobility" = @("ssangyong")
  "saic" = @("saic-motor")
  "tata-motors" = @("tata")
  "range-rover" = @("land-rover")
  "ds-automobiles" = @("ds")
}

$targetFiles = Get-ChildItem -Path $TargetDir -File
$copied = 0
$skippedExisting = 0
$notFound = New-Object System.Collections.Generic.List[string]

foreach ($target in $targetFiles) {
  $targetBase = [System.IO.Path]::GetFileNameWithoutExtension($target.Name).ToLowerInvariant()
  $targetExt = $target.Extension
  if ([string]::IsNullOrWhiteSpace($targetExt)) { $targetExt = ".png" }

  # Mantem o nome do arquivo de destino como ja existe em public/brands
  if ((Test-Path $target.FullName) -and -not $Overwrite.IsPresent) {
    $skippedExisting++
    continue
  }

  $candidates = New-Object System.Collections.Generic.List[string]
  [void]$candidates.Add($targetBase)

  if ($aliases.ContainsKey($targetBase)) {
    foreach ($alias in $aliases[$targetBase]) { [void]$candidates.Add($alias) }
  }

  $sourcePath = $null
  foreach ($candidate in $candidates) {
    if ($sourceByBaseName.ContainsKey($candidate)) {
      $sourcePath = $sourceByBaseName[$candidate]
      break
    }
  }

  if (-not $sourcePath) {
    $notFound.Add($target.Name)
    continue
  }

  Copy-Item -Path $sourcePath -Destination $target.FullName -Force
  $copied++
}

Write-Output "Copiados: $copied"
Write-Output "Ignorados (existentes sem -Overwrite): $skippedExisting"
Write-Output "Sem correspondencia no dataset: $($notFound.Count)"

if ($notFound.Count -gt 0) {
  Write-Output "Arquivos sem correspondencia:"
  $notFound | Sort-Object | ForEach-Object { Write-Output "- $_" }
}

