param(
    [string]$Dotnet = 'dotnet',
    [string]$Node = 'node',
    [string]$Esbuild = '',
    [string]$Iscc = 'C:\Program Files (x86)\Inno Setup 7\ISCC.exe',
    [string]$Catalog = 'dist/desktop-tools/cards.json'
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Push-Location (Join-Path $PSScriptRoot '..')
try {
    $root = (Get-Location).Path
    $version = ([xml](Get-Content 'desktop/RiftboundCompanion.csproj' -Raw)).Project.PropertyGroup.Version
    $catalogSha = 'A39950789F184CC5A53698C2D921891B5331EE9C0E82017E616A054864854E20'
    $catalogUrl = 'https://huggingface.co/datasets/Wysme/riftbound-cards/resolve/c9cbe8af31527ad87c613c33c2942726b4c217e0/cards.json'
    $bootstrapper = 'dist/desktop-tools/MicrosoftEdgeWebview2Setup.exe'
    $tunnel = 'dist/cloudflared.exe'
    $tunnelSha = '2493DBC168923BB3E59E5E7716F71DECED92992EEA9ACD6E9D74F84AC7751343'
    New-Item -ItemType Directory -Force 'dist/desktop-tools', 'dist/desktop-publish/engine' | Out-Null
    if (!(Test-Path -LiteralPath $Catalog)) {
        curl.exe -fLsS --retry 3 $catalogUrl -o $Catalog
    }
    if ((Get-FileHash -LiteralPath $Catalog).Hash -ne $catalogSha) {
        throw 'The offline catalog does not match its pinned SHA-256.'
    }
    if (!(Test-Path -LiteralPath $bootstrapper)) {
        curl.exe -fLsS --retry 3 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -o $bootstrapper
    }
    $signature = Get-AuthenticodeSignature $bootstrapper
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notlike '*Microsoft Corporation*') {
        throw 'The WebView2 bootstrapper signature is invalid.'
    }
    if (!(Test-Path -LiteralPath $tunnel)) {
        curl.exe -fLsS --retry 3 'https://github.com/cloudflare/cloudflared/releases/download/2026.10.7/cloudflared-windows-amd64.exe' -o $tunnel
    }
    if ((Get-FileHash -LiteralPath $tunnel).Hash -ne $tunnelSha) {
        throw 'The agent tunnel does not match its pinned SHA-256.'
    }
    if (!$Esbuild -or !(Test-Path dist/companion.ico)) {
        npm.cmd install --prefix dist/desktop-tools --no-save --no-package-lock --no-audit --no-fund 'esbuild@0.25.12' '@resvg/resvg-js@2.6.2'
        if (!$Esbuild) { $Esbuild = Join-Path $root 'dist/desktop-tools/node_modules/@esbuild/win32-x64/esbuild.exe' }
    }
    if (!(Test-Path dist/companion.ico)) {
        $env:RIFTBOUND_ICON_TOOLS = Join-Path $root 'dist/desktop-tools/node_modules'
        & $Node scripts/apply-icon.mjs --icon-only
    }
    $versionDefine = '--define:RIFTBOUND_DESKTOP_VERSION=' + (ConvertTo-Json -InputObject ([string]$version) -Compress)
    & $Esbuild server.mjs --bundle --platform=node --format=cjs --target=node26 --define:RIFTBOUND_DESKTOP_BUNDLE=true $versionDefine --outfile=dist/desktop-engine.cjs --log-level=warning
    & $Node scripts/build-sea.mjs --desktop
    & $Node --build-sea dist/desktop-sea-config.json
    & (Resolve-Path 'dist/desktop-publish/engine/RiftboundEngine.exe').Path --verify-bundle
    Copy-Item -LiteralPath $Catalog -Destination 'dist/desktop-publish/engine/cards.json' -Force
    & $Dotnet publish desktop/RiftboundCompanion.csproj -c Release -o dist/desktop-publish
    & $Iscc '/Q' "/DAppVersion=$version" desktop/installer.iss
    $installer = Get-Item "dist/RiftboundCompanion-$version-x64-Setup.exe"
    $hash = (Get-FileHash -LiteralPath $installer.FullName).Hash.ToLowerInvariant()
    "$hash  $($installer.Name)" | Set-Content -LiteralPath "$($installer.FullName).sha256" -Encoding ascii
    $installer
} finally {
    Pop-Location
}
