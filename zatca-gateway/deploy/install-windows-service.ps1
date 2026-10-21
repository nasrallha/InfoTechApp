# ============================================================
# تثبيت ZATCA Gateway كـ Windows Service (شغّل PowerShell كـ Administrator)
#   .\deploy\install-windows-service.ps1 -ApiKey "نفس-ZATCA_GATEWAY_KEY"
# ============================================================
param(
    [Parameter(Mandatory = $true)][string]$ApiKey,
    [string]$InstallDir = "C:\ZatcaGateway"
)
$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "..\ZatcaGateway.csproj"

dotnet publish $project -c Release -o $InstallDir

# المفتاح في ملف إعدادات محلي جنب البرنامج
@{ Gateway = @{ ApiKey = $ApiKey } } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $InstallDir "appsettings.Local.json")

if (Get-Service ZatcaGateway -ErrorAction SilentlyContinue) {
    Stop-Service ZatcaGateway
    sc.exe delete ZatcaGateway | Out-Null
    Start-Sleep -Seconds 2
}
sc.exe create ZatcaGateway binPath= "`"$InstallDir\ZatcaGateway.exe`"" start= auto DisplayName= "ZATCA Gateway" | Out-Null
sc.exe failure ZatcaGateway reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null
Start-Service ZatcaGateway
Write-Host "ZatcaGateway installed and started ($InstallDir)"
