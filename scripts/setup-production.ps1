[CmdletBinding()]
param(
  [string]$AppOrigin = "",
  [string]$SmtpEmail = "",
  [string]$AffiliateId = "",
  [string]$AdminEmail = "",
  [string]$AdminFullName = "Quản trị ShopTik"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"

function Read-RequiredValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Prompt
  )

  do {
    $value = (Read-Host $Prompt).Trim()
  } while ([string]::IsNullOrWhiteSpace($value))
  return $value
}

function Read-SecretValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Prompt
  )

  $secureValue = Read-Host $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function New-RandomBytes {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Count
  )

  $bytes = New-Object byte[] $Count
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
    return $bytes
  }
  finally {
    $generator.Dispose()
  }
}

function New-HexSecret {
  $bytes = New-RandomBytes -Count 32
  return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function New-Base64Secret {
  return [Convert]::ToBase64String((New-RandomBytes -Count 32))
}

function Assert-LastCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Step
  )

  if ($LASTEXITCODE -ne 0) {
    throw "$Step thất bại (mã lỗi $LASTEXITCODE)."
  }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Chưa tìm thấy Docker Desktop. Hãy cài và mở Docker Desktop trước khi chạy script."
}

& docker compose version | Out-Host
Assert-LastCommand -Step "Kiểm tra Docker Compose"

if ([string]::IsNullOrWhiteSpace($AppOrigin)) {
  $AppOrigin = Read-RequiredValue -Prompt "Domain HTTPS của ứng dụng (ví dụ https://aff.tenmien.com)"
}
$AppOrigin = $AppOrigin.Trim().TrimEnd("/")

$originUri = $null
if (
  -not [Uri]::TryCreate($AppOrigin, [UriKind]::Absolute, [ref]$originUri) -or
  $originUri.Scheme -ne "https" -or
  [string]::IsNullOrWhiteSpace($originUri.Host)
) {
  throw "APP_ORIGIN phải là URL HTTPS hợp lệ, ví dụ https://aff.tenmien.com."
}
if ($originUri.Host -in @("localhost", "127.0.0.1", "::1")) {
  throw "Production không dùng localhost. Hãy nhập domain HTTPS thật đã trỏ qua reverse proxy hoặc Cloudflare Tunnel."
}
if ($originUri.AbsolutePath -ne "/") {
  throw "APP_ORIGIN chỉ được chứa domain, không thêm đường dẫn phía sau."
}

if ([string]::IsNullOrWhiteSpace($SmtpEmail)) {
  $SmtpEmail = Read-RequiredValue -Prompt "Gmail dùng để gửi OTP"
}
$SmtpEmail = $SmtpEmail.Trim().ToLowerInvariant()
if ($SmtpEmail -notmatch "^[^@\s]+@[^@\s]+\.[^@\s]+$") {
  throw "Email SMTP không hợp lệ."
}

$smtpPassword = (Read-SecretValue -Prompt "App Password Gmail 16 ký tự (không dùng mật khẩu Gmail)") -replace "\s", ""
if ($smtpPassword.Length -lt 16) {
  throw "App Password Gmail không hợp lệ. Hãy tạo App Password sau khi bật xác minh 2 bước."
}

if ([string]::IsNullOrWhiteSpace($AffiliateId)) {
  $AffiliateId = (Read-Host "Shopee Affiliate ID (có thể để trống ở giai đoạn chuẩn bị)").Trim()
}

if ([string]::IsNullOrWhiteSpace($AdminEmail)) {
  $AdminEmail = Read-RequiredValue -Prompt "Email tài khoản quản trị đầu tiên"
}
$AdminEmail = $AdminEmail.Trim().ToLowerInvariant()
if ($AdminEmail -notmatch "^[^@\s]+@[^@\s]+\.[^@\s]+$") {
  throw "Email quản trị không hợp lệ."
}

$adminPassword = Read-SecretValue -Prompt "Mật khẩu quản trị (ít nhất 10 ký tự, có chữ hoa, chữ thường và số)"
$adminPasswordConfirm = Read-SecretValue -Prompt "Nhập lại mật khẩu quản trị"
if ($adminPassword -cne $adminPasswordConfirm) {
  throw "Hai lần nhập mật khẩu quản trị không giống nhau."
}
if (
  $adminPassword.Length -lt 10 -or
  $adminPassword -cnotmatch "[a-z]" -or
  $adminPassword -cnotmatch "[A-Z]" -or
  $adminPassword -notmatch "[0-9]"
) {
  throw "Mật khẩu quản trị phải có ít nhất 10 ký tự, gồm chữ hoa, chữ thường và số."
}

$postgresPassword = New-HexSecret
$redisPassword = New-HexSecret
$appSecret = New-HexSecret
$otpPepper = New-HexSecret
$ipHashPepper = New-HexSecret
$fieldEncryptionKey = New-Base64Secret
$policyVersion = Get-Date -Format "yyyy-MM-dd"

$envContent = @"
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
APP_ORIGIN=$AppOrigin
APP_NAME="ShopTik"
TRUST_PROXY=true

POSTGRES_PASSWORD=$postgresPassword
DATABASE_URL=postgresql://aff_user:$postgresPassword@postgres:5432/aff_cashback
DATABASE_SSL=false
DATABASE_POOL_MAX=10

REDIS_PASSWORD=$redisPassword
REDIS_URL=redis://:$redisPassword@redis:6379/0

APP_SECRET=$appSecret
OTP_PEPPER=$otpPepper
IP_HASH_PEPPER=$ipHashPepper
FIELD_ENCRYPTION_KEY=$fieldEncryptionKey

SESSION_TTL_HOURS=168
OTP_TTL_MINUTES=10
OTP_MAX_ATTEMPTS=5
OTP_MAX_SENDS_PER_HOUR=5

EMAIL_MODE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=$SmtpEmail
SMTP_PASS=$smtpPassword
SMTP_FROM_NAME="ShopTik"
SMTP_FROM_EMAIL=$SmtpEmail

SHOPEE_AFFILIATE_ID=$AffiliateId
SHOPEE_PRODUCT_API_URL=
SHOPEE_PRODUCT_API_TOKEN=
SHOPEE_DEFAULT_COMMISSION_RATE_BPS=0
SHOPEE_AFFILIATE_REDIRECT_HOSTS=

TIKTOK_AFFILIATE_ID=
TIKTOK_PRODUCT_API_URL=
TIKTOK_PRODUCT_API_TOKEN=
TIKTOK_DEFAULT_COMMISSION_RATE_BPS=0
TIKTOK_AFFILIATE_REDIRECT_HOSTS=
TIKTOK_OPEN_API_APP_KEY=
TIKTOK_OPEN_API_APP_SECRET=
TIKTOK_OPEN_API_ACCESS_TOKEN=
TIKTOK_AFFILIATE_CAMPAIGN_ID=

LAZADA_AFFILIATE_ID=
LAZADA_AFFILIATE_MASTER_LINK=
LAZADA_PRODUCT_API_URL=
LAZADA_PRODUCT_API_TOKEN=
LAZADA_DEFAULT_COMMISSION_RATE_BPS=0
LAZADA_AFFILIATE_REDIRECT_HOSTS=
LAZADA_OPEN_API_APP_KEY=
LAZADA_OPEN_API_APP_SECRET=
LAZADA_OPEN_API_ACCESS_TOKEN=

SHOPEE_PRODUCT_LOOKUP_TIMEOUT_MS=8000

MIN_WITHDRAWAL_VND=50000
MAX_WITHDRAWAL_VND=20000000

TERMS_VERSION=$policyVersion
PRIVACY_VERSION=$policyVersion
"@

if (Test-Path $envPath) {
  $backupName = ".env.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -LiteralPath $envPath -Destination (Join-Path $projectRoot $backupName)
  Write-Host "Đã sao lưu .env cũ thành $backupName."
}

[IO.File]::WriteAllText(
  $envPath,
  $envContent.TrimStart(),
  [Text.UTF8Encoding]::new($false)
)

try {
  Push-Location $projectRoot

  & docker compose config --quiet
  Assert-LastCommand -Step "Kiểm tra cấu hình production"

  Write-Host "Đang build và khởi động PostgreSQL, Redis, migration và web..."
  & docker compose up -d --build web
  Assert-LastCommand -Step "Khởi động production"

  & docker compose run --rm web node dist/scripts/seed.js
  Assert-LastCommand -Step "Tạo dữ liệu nền"

  $env:ADMIN_INITIAL_PASSWORD = $adminPassword
  $env:ADMIN_FULL_NAME = $AdminFullName
  try {
    & docker compose run --rm -e ADMIN_INITIAL_PASSWORD -e ADMIN_FULL_NAME web node dist/scripts/create-admin.js $AdminEmail
    Assert-LastCommand -Step "Tạo tài khoản quản trị"
  }
  finally {
    Remove-Item Env:ADMIN_INITIAL_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:ADMIN_FULL_NAME -ErrorAction SilentlyContinue
  }

  $ready = $false
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri "http://127.0.0.1:3000/-/ready" -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        $ready = $true
        break
      }
    }
    catch {
      Start-Sleep -Seconds 2
    }
  }

  & docker compose ps | Out-Host
  if (-not $ready) {
    throw "Máy chủ chưa sẵn sàng sau 60 giây. Chạy 'docker compose logs web' để xem lỗi."
  }

  Write-Host ""
  Write-Host "Production đã chạy thành công."
  Write-Host "Địa chỉ công khai: $AppOrigin"
  Write-Host "Kiểm tra nội bộ: http://127.0.0.1:3000/-/ready"
  Write-Host "Quản trị: $AppOrigin/backoffice"
}
finally {
  $smtpPassword = $null
  $adminPassword = $null
  $adminPasswordConfirm = $null
  Pop-Location -ErrorAction SilentlyContinue
}
