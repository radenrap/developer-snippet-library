#Requires -Version 5.1
<#
.SYNOPSIS
  Smoke test end-to-end untuk @snippets/api (PowerShell 5.1+, Windows).

.DESCRIPTION
  Menjalankan 16 pemeriksaan terhadap API: health, envelope sukses/error,
  full-text search + rank, filter tag OR, validasi zod (400 + details),
  judul duplikat (409), 404, regex tester, dan CRUD lengkap.
  Data yang dibuat dihapus kembali di akhir (kecuali -KeepData).

  Semua request memakai curl.exe -- BUKAN `curl`, karena di PowerShell 5.1
  `curl` adalah alias Invoke-WebRequest yang tidak mengenal -X/-H/-d.
  Body JSON dikirim lewat file sementara agar kutip tidak dirusak PowerShell.

.EXAMPLE
  pnpm test:api
  ./scripts/api-smoke-test.ps1
  ./scripts/api-smoke-test.ps1 -BaseUrl http://localhost:3100 -KeepData
#>
[CmdletBinding()]
param(
  [string]$BaseUrl = 'http://localhost:3000',
  [switch]$KeepData
)

$ErrorActionPreference = 'Stop'

$script:Pass = 0
$script:Fail = 0
$script:Failures = [System.Collections.Generic.List[string]]::new()

function Write-Section {
  param([string]$Title)
  Write-Host ''
  Write-Host "== $Title" -ForegroundColor Cyan
}

function Write-Result {
  param([bool]$Ok, [string]$Label, [string]$Detail = '')

  if ($Ok) {
    $script:Pass++
    Write-Host "  [PASS] $Label" -ForegroundColor Green
    if ($Detail) { Write-Host "         $Detail" -ForegroundColor DarkGray }
  }
  else {
    $script:Fail++
    $script:Failures.Add($Label)
    Write-Host "  [FAIL] $Label" -ForegroundColor Red
    if ($Detail) { Write-Host "         $Detail" -ForegroundColor Yellow }
  }
}

function Invoke-Api {
  param(
    [Parameter(Mandatory)][string]$Method,
    [Parameter(Mandatory)][string]$Path,
    [string]$Body
  )

  $url = "$BaseUrl$Path"
  $curlArgs = @('-s', '-w', "`n%{http_code}", '-X', $Method)
  $tmp = $null

  # Body ditulis ke file lalu dikirim dengan --data-binary "@file".
  # Ini menghindari masalah kutip PowerShell 5.1 saat meneruskan JSON ke exe.
  if ($Body) {
    $tmp = [System.IO.Path]::GetTempFileName()
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tmp, $Body, $utf8NoBom)
    $curlArgs += @('-H', 'Content-Type: application/json', '--data-binary', "@$tmp")
  }

  $curlArgs += $url

  try {
    $raw = (& curl.exe @curlArgs | Out-String)
  }
  finally {
    if ($tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
  }

  $lines = $raw -split "`r?`n"
  $lastIdx = -1
  for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    if ($lines[$i].Trim() -ne '') { $lastIdx = $i; break }
  }

  $status = 0
  if ($lastIdx -ge 0) { [void][int]::TryParse($lines[$lastIdx].Trim(), [ref]$status) }

  $bodyText = ''
  if ($lastIdx -gt 0) { $bodyText = ($lines[0..($lastIdx - 1)] -join "`n").Trim() }

  $json = $null
  if ($bodyText) {
    try { $json = $bodyText | ConvertFrom-Json } catch { $json = $null }
  }

  return [pscustomobject]@{ Status = $status; Text = $bodyText; Json = $json }
}

function Get-ErrorMessage {
  param($Response)
  if ($Response.Json -and $Response.Json.error) {
    $msg = $Response.Json.error.message
    if ($Response.Json.error.details) {
      $fields = ($Response.Json.error.details | ForEach-Object { $_.field }) -join ', '
      return "$msg [details: $fields]"
    }
    return $msg
  }
  if ($Response.Text) { return $Response.Text.Substring(0, [Math]::Min(160, $Response.Text.Length)) }
  return '(body kosong)'
}

function Test-PortOpen {
  param([int]$Port)
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $client.Connect('127.0.0.1', $Port)
    $client.Close()
    return $true
  }
  catch { return $false }
}

# ---------------------------------------------------------------- preflight
Write-Host ''
Write-Host 'Smoke test @snippets/api' -ForegroundColor White
Write-Host "Target: $BaseUrl" -ForegroundColor DarkGray

Write-Section 'Preflight'

if (-not (Test-PortOpen 5432)) {
  Write-Host '  [BLOCKED] PostgreSQL tidak listening di 5432.' -ForegroundColor Red
  Write-Host '            Jalankan dulu: pnpm db:up   (butuh Docker Desktop aktif)' -ForegroundColor Yellow
  exit 2
}
Write-Host '  [OK] PostgreSQL listening di 5432' -ForegroundColor DarkGray

$probe = Invoke-Api -Method GET -Path '/health'
if ($probe.Status -ne 200) {
  Write-Host "  [BLOCKED] API tidak menjawab di $BaseUrl (status $($probe.Status))." -ForegroundColor Red
  Write-Host '            Jalankan di terminal lain: pnpm dev:api' -ForegroundColor Yellow
  Write-Host '            Catatan: filter turbo harus @snippets/api, bukan "api".' -ForegroundColor Yellow
  exit 2
}
Write-Host "  [OK] API menjawab: $($BaseUrl)/health" -ForegroundColor DarkGray

# ------------------------------------------------------------------ fixtures
$stamp = Get-Date -Format 'HHmmss'
$title = "Smoke test $stamp"
$editedTitle = "Smoke test $stamp edited"

# Pakai tag yang sudah ada bila tersedia, supaya tidak meninggalkan tag yatim.
$existingTags = Invoke-Api -Method GET -Path '/api/tags'
$tagNames = @()
if ($existingTags.Json -and $existingTags.Json.data) {
  $tagNames = @($existingTags.Json.data | Select-Object -First 2 -ExpandProperty name)
}
if ($tagNames.Count -lt 2) { $tagNames = @('smoke-a', 'smoke-b') }
$tagA = $tagNames[0]
$tagB = $tagNames[1]

$createBody = @{
  title    = $title
  code     = "export const smoke$stamp = true;"
  language = 'typescript'
  description = 'Dibuat otomatis oleh scripts/api-smoke-test.ps1 untuk verifikasi FTS.'
  tags     = @($tagA, $tagB)
} | ConvertTo-Json -Compress

# ------------------------------------------------------------------- 1. health
Write-Section 'Health & envelope'

$r = Invoke-Api -Method GET -Path '/health'
Write-Result ($r.Status -eq 200 -and $r.Json.success -eq $true -and $r.Json.data.status -eq 'ok') `
  'GET /health -> 200 { success:true, data.status:"ok" }' "status=$($r.Status)"

$r = Invoke-Api -Method GET -Path '/health/db'
Write-Result ($r.Status -eq 200 -and $r.Json.data.status -eq 'ok') `
  'GET /health/db -> 200 (koneksi database hidup)' (Get-ErrorMessage $r)

$r = Invoke-Api -Method GET -Path '/api/tags'
Write-Result ($r.Status -eq 200 -and $null -ne $r.Json.data) `
  'GET /api/tags -> 200 + envelope' "jumlah tag = $(@($r.Json.data).Count)"

# --------------------------------------------------------------- 2. create/read
Write-Section 'Create & read'

$r = Invoke-Api -Method POST -Path '/api/snippets' -Body $createBody
$createdId = $null
if ($r.Json -and $r.Json.data) { $createdId = $r.Json.data.id }

Write-Result ($r.Status -eq 201 -and $r.Json.success -eq $true -and $createdId) `
  'POST /api/snippets -> 201 + { success:true, data.id }' "id=$createdId"

Write-Result (@($r.Json.data.tags).Count -eq 2) `
  'POST menyimpan 2 tag (relasi many-to-many)' "tags=$(@($r.Json.data.tags) -join ', ')"

Write-Result ($r.Json.data.embeddingStatus -eq 'pending') `
  'Kolom embedding masih pending (pgvector disiapkan, belum diisi)' ''

if ($createdId) {
  $r = Invoke-Api -Method GET -Path "/api/snippets/$createdId"
  Write-Result ($r.Status -eq 200 -and $r.Json.data.title -eq $title) `
    'GET /api/snippets/:id -> 200 + data lengkap' "title=$($r.Json.data.title)"
}

# ------------------------------------------------------------------- 3. FTS
Write-Section 'Full-text search (tsvector + bobot A/B/C)'

$r = Invoke-Api -Method GET -Path '/api/snippets?q=smoke&pageSize=50'
$hit = $null
if ($r.Json -and $r.Json.data) { $hit = @($r.Json.data | Where-Object { $_.id -eq $createdId }) }

Write-Result ($r.Status -eq 200 -and $hit) `
  'GET /api/snippets?q=smoke menemukan snippet yang baru dibuat' "total=$($r.Json.meta.total)"

$rank = if ($hit) { $hit[0].rank } else { 0 }
Write-Result ($rank -gt 0) `
  'Rank ts_rank_cd > 0 (bobot A karena "smoke" ada di judul)' "rank=$rank"

Write-Result ($r.Json.meta.query -eq 'smoke') `
  'meta.query menggemakan query FTS' "query=$($r.Json.meta.query)"

# ---------------------------------------------------------------- 4. filter tag
Write-Section 'Filter tag (semantik OR) & kombinasi'

$r = Invoke-Api -Method GET -Path "/api/snippets?tags=$tagA,$tagB&pageSize=50"
$found = $false
if ($r.Json -and $r.Json.data) { $found = [bool]@($r.Json.data | Where-Object { $_.id -eq $createdId }) }
Write-Result ($r.Status -eq 200 -and $found) `
  "GET /api/snippets?tags=$tagA,$tagB -> snippet ikut terjaring (OR)" "total=$($r.Json.meta.total)"

$r = Invoke-Api -Method GET -Path "/api/snippets?tags=$tagA&language=typescript&pageSize=50"
Write-Result ($r.Status -eq 200) `
  'Kombinasi tags + language diterima' "total=$($r.Json.meta.total)"

$r = Invoke-Api -Method GET -Path "/api/snippets?q=smoke&tags=$tagA&pageSize=50"
Write-Result ($r.Status -eq 200) `
  'Kombinasi q (FTS) + tags diterima' "total=$($r.Json.meta.total)"

# --------------------------------------------------------------- 5. error 4xx
Write-Section 'Kontrak error: 409 / 400 / 404'

$dupBody = @{ title = $title; code = 'x'; language = 'go' } | ConvertTo-Json -Compress
$r = Invoke-Api -Method POST -Path '/api/snippets' -Body $dupBody
Write-Result ($r.Status -eq 409 -and $r.Json.error.code -eq 'CONFLICT') `
  'POST judul duplikat -> 409 CONFLICT' (Get-ErrorMessage $r)

$r = Invoke-Api -Method POST -Path '/api/snippets' -Body '{"title":"","code":""}'
$fields = @()
if ($r.Json -and $r.Json.error -and $r.Json.error.details) {
  $fields = @($r.Json.error.details | ForEach-Object { $_.field })
}
Write-Result ($r.Status -eq 400 -and $r.Json.error.code -eq 'VALIDATION_ERROR' -and $fields.Count -ge 2) `
  'POST body tidak valid -> 400 + details per-field' (Get-ErrorMessage $r)

$r = Invoke-Api -Method GET -Path '/api/snippets/00000000-0000-4000-8000-000000000009'
Write-Result ($r.Status -eq 404 -and $r.Json.error.code -eq 'NOT_FOUND') `
  'GET id yang tidak ada -> 404 NOT_FOUND' (Get-ErrorMessage $r)

$r = Invoke-Api -Method GET -Path '/api/snippets/bukan-uuid'
Write-Result ($r.Status -eq 400 -and $r.Json.error.code -eq 'VALIDATION_ERROR') `
  'GET id bukan UUID -> 400 (params ikut tervalidasi)' (Get-ErrorMessage $r)

$r = Invoke-Api -Method GET -Path '/api/route-tidak-ada'
Write-Result ($r.Status -eq 404 -and $r.Json.success -eq $false) `
  'Route tak dikenal -> 404 ber-envelope' (Get-ErrorMessage $r)

# ----------------------------------------------------------------- 6. regex
Write-Section 'Regex tester'

$regexBody = '{"pattern":"\\d+","flags":["g"],"subject":"a1b22c333"}'
$r = Invoke-Api -Method POST -Path '/api/regex/test' -Body $regexBody
Write-Result ($r.Status -eq 200 -and $r.Json.data.matchCount -eq 3) `
  'POST /api/regex/test -> 3 kecocokan (1, 22, 333)' "matchCount=$($r.Json.data.matchCount)"

$r = Invoke-Api -Method POST -Path '/api/regex/test' -Body '{"pattern":"([","flags":[],"subject":"x"}'
Write-Result ($r.Status -eq 200 -and $r.Json.data.valid -eq $false) `
  'Pattern tidak valid -> valid:false + message (bukan 500)' (Get-ErrorMessage $r)

# ------------------------------------------------------------ 7. update/delete
Write-Section 'Update & delete'

if ($createdId) {
  $patchBody = @{ title = $editedTitle } | ConvertTo-Json -Compress
  $r = Invoke-Api -Method PATCH -Path "/api/snippets/$createdId" -Body $patchBody
  Write-Result ($r.Status -eq 200 -and $r.Json.data.title -eq $editedTitle) `
    'PATCH judul -> 200 + data baru' "title=$($r.Json.data.title)"

  $r = Invoke-Api -Method PATCH -Path "/api/snippets/$createdId" -Body '{}'
  Write-Result ($r.Status -eq 400) `
    'PATCH tanpa field -> 400' (Get-ErrorMessage $r)

  # Regression guard: PATCH kosong tidak boleh menghapus tag yang sudah ada.
  # (Dulu `.partial()` menyuntik default `tags: []` sehingga tag ikut terhapus.)
  $r = Invoke-Api -Method GET -Path "/api/snippets/$createdId"
  Write-Result (@($r.Json.data.tags).Count -eq 2) `
    'Tag tetap utuh setelah PATCH kosong' "tags=$(@($r.Json.data.tags) -join ', ')"

  # Query FTS wajib di-encode: judul mengandung spasi.
  $encodedTitle = [uri]::EscapeDataString($editedTitle)
  $r = Invoke-Api -Method GET -Path "/api/snippets?q=$encodedTitle&pageSize=5"
  $stillFound = $false
  if ($r.Json -and $r.Json.data) {
    $stillFound = [bool]@($r.Json.data | Where-Object { $_.id -eq $createdId })
  }
  Write-Result ($r.Status -eq 200 -and $stillFound) `
    'FTS mengikuti perubahan judul (trigger UPDATE)' "total=$($r.Json.meta.total) found=$stillFound"

  if ($KeepData) {
    Write-Host "  [SKIP] Delete dilewati karena -KeepData (id=$createdId)" -ForegroundColor DarkGray
  }
  else {
    $r = Invoke-Api -Method DELETE -Path "/api/snippets/$createdId"
    Write-Result ($r.Status -eq 200 -and $r.Json.success -eq $true -and $r.Json.data.id -eq $createdId) `
      'DELETE -> 200 + { success:true, data.id }' "status=$($r.Status)"

    $r = Invoke-Api -Method GET -Path "/api/snippets/$createdId"
    Write-Result ($r.Status -eq 404) `
      'GET setelah DELETE -> 404 (data benar-benar hilang)' (Get-ErrorMessage $r)
  }
}

# ------------------------------------------------------------------ summary
Write-Host ''
Write-Host '---------------------------------------------' -ForegroundColor DarkGray
$total = $script:Pass + $script:Fail
if ($script:Fail -eq 0) {
  Write-Host "SEMUA LOLOS: $script:Pass/$total pemeriksaan" -ForegroundColor Green
  exit 0
}

Write-Host "GAGAL: $($script:Fail) dari $total pemeriksaan" -ForegroundColor Red
foreach ($f in $script:Failures) { Write-Host "  - $f" -ForegroundColor Yellow }
exit 1
