param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [string]$Bucket = $(if ($env:NOTO_DOWNLOAD_BUCKET) { $env:NOTO_DOWNLOAD_BUCKET } else { "noto-downloads" }),
    [string]$ObjectPath = $(if ($env:NOTO_DOWNLOAD_OBJECT_PATH) { $env:NOTO_DOWNLOAD_OBJECT_PATH } else { "windows/Noto-Setup-x64.exe" })
)

$projectUrl = $env:SUPABASE_URL
$serviceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $projectUrl) {
    throw "Set SUPABASE_URL before running this script."
}

if (-not $serviceRoleKey) {
    throw "Set SUPABASE_SERVICE_ROLE_KEY before running this script."
}

$resolvedFile = (Resolve-Path -LiteralPath $FilePath).Path
$uploadUrl = "$projectUrl/storage/v1/object/$Bucket/$ObjectPath"

$headers = @{
    Authorization = "Bearer $serviceRoleKey"
    apikey        = $serviceRoleKey
    "Content-Type" = "application/octet-stream"
    "x-upsert"    = "true"
}

Invoke-RestMethod `
    -Method Post `
    -Uri $uploadUrl `
    -Headers $headers `
    -InFile $resolvedFile `
    -TimeoutSec 1800 | Out-Null

Write-Host "Uploaded installer to $Bucket/$ObjectPath"
