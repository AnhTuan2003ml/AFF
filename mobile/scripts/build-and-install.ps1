<#
.SYNOPSIS
  Build APK (EAS, hồ sơ preview) rồi cài thẳng lên điện thoại đang cắm adb.

.DESCRIPTION
  Chạy từ bất kỳ đâu — script tự cd về thư mục mobile. Các bước:
    1. Kiểm tra có thiết bị adb chưa (cắm dây + bật USB debugging).
    2. npm run build:android (eas build --profile preview --platform android)
       ở chế độ --json --non-interactive để lấy được link APK khi xong.
    3. Tải APK về thư mục build-output\ (tên theo build id).
    4. adb install -r <apk>  (giữ dữ liệu/đăng nhập cũ).
    5. Mở app.

  EAS đóng gói từ GIT (bản đã commit). Muốn gói cả thay đổi chưa commit thì
  thêm -NoVcs (đặt EAS_NO_VCS=1).

.EXAMPLE
  npm run build:install
  .\scripts\build-and-install.ps1 -NoVcs
  .\scripts\build-and-install.ps1 -Profile production   # ra .aab, KHÔNG cài được
#>
[CmdletBinding()]
param(
  [string]$Profile = "preview",
  [switch]$NoVcs,
  [string]$Serial = ""          # adb -s <serial> khi cắm nhiều máy
)

$ErrorActionPreference = "Stop"
$mobileDir = Split-Path -Parent $PSScriptRoot
Set-Location $mobileDir
Write-Host "==> Thư mục: $mobileDir"

# 1) adb + thiết bị
$adb = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adb) { throw "Không tìm thấy adb trong PATH. Cài Android platform-tools rồi thêm vào PATH." }
$adbArgs = @()
if ($Serial) { $adbArgs = @("-s", $Serial) }
$devices = & adb @adbArgs devices | Select-String "`tdevice$"
if (-not $devices) {
  throw "Chưa thấy điện thoại nào ở trạng thái 'device' (adb devices). Cắm dây, bật USB debugging và chấp nhận hộp thoại trên máy."
}
Write-Host "==> Thiết bị adb: $($devices -join ', ')"

# 2) Build
if ($NoVcs) { $env:EAS_NO_VCS = "1"; Write-Host "==> EAS_NO_VCS=1: đóng gói từ thư mục làm việc (kể cả chưa commit)" }
$outDir = Join-Path $mobileDir "build-output"
New-Item -ItemType Directory -Force $outDir | Out-Null
$jsonPath = Join-Path $outDir "last-build.json"
Write-Host "==> Đang build EAS (profile=$Profile, android). Thường 15–30 phút..."
# --json in JSON ra stdout khi build xong; log tiến độ ra stderr nên vẫn thấy trên màn hình.
& npx eas-cli@latest build --profile $Profile --platform android --non-interactive --json |
  Out-File -Encoding utf8 $jsonPath
if ($LASTEXITCODE -ne 0) { throw "eas build thất bại (exit $LASTEXITCODE). Xem log ở trên." }

$build = Get-Content $jsonPath -Raw | ConvertFrom-Json
if ($build -is [array]) { $build = $build[0] }
$url = $build.artifacts.buildUrl
if (-not $url) { $url = $build.artifacts.applicationArchiveUrl }
if (-not $url) { throw "Không lấy được link APK từ kết quả build ($jsonPath)." }
Write-Host "==> Build $($build.id) $($build.status): $url"
if ($url -notmatch "\.apk(\?|$)") {
  throw "File build không phải .apk (hồ sơ '$Profile' ra .aab?). Dùng -Profile preview để cài thẳng."
}

# 3) Tải APK
$apkPath = Join-Path $outDir ("shoptik-" + $build.id.Substring(0, 8) + ".apk")
Write-Host "==> Tải APK về $apkPath"
Invoke-WebRequest -Uri $url -OutFile $apkPath
$sizeMb = [math]::Round((Get-Item $apkPath).Length / 1MB, 1)
Write-Host "==> Đã tải ($sizeMb MB)"

# 4) Cài
Write-Host "==> adb install -r ..."
& adb @adbArgs install -r $apkPath
if ($LASTEXITCODE -ne 0) { throw "adb install thất bại (exit $LASTEXITCODE)." }

# 5) Mở app
& adb @adbArgs shell monkey -p vn.shoptik.app -c android.intent.category.LAUNCHER 1 | Out-Null
Write-Host "==> Xong! Đã cài và mở ShopTik trên máy."
