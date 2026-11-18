param([Parameter(Mandatory)][string]$Installer)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$setup = (Resolve-Path -LiteralPath $Installer).Path
$dist = (Resolve-Path 'dist').Path
$target = Join-Path $dist ("installed-smoke-" + [guid]::NewGuid().ToString('N'))
$defaultData = Join-Path $env:LOCALAPPDATA 'Nitarii/Riftbound Companion'
if (Test-Path -LiteralPath $defaultData) { throw 'Installer smoke test requires a fresh Windows profile for Riftbound.' }
$save = Join-Path $defaultData '.riftbound-local-state.json'
$marker = Join-Path $target 'personal-file.txt'
$app = Join-Path $target 'RiftboundCompanion.exe'

function Run-Setup([string]$arguments) {
    $process = Start-Process -FilePath $setup -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
    if ($process.ExitCode -ne 0) { throw "Setup returned $($process.ExitCode)" }
}

try {
    Run-Setup ('/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR="' + $target + '"')
    if (!(Test-Path -LiteralPath $app)) { throw 'The selected installation directory was ignored.' }
    Set-Content -LiteralPath $marker -Value 'personal'
    New-Item -ItemType Directory -Path $defaultData, (Join-Path $defaultData 'speech') | Out-Null
    Set-Content -LiteralPath $save -Value 'preserve'
    Set-Content -LiteralPath (Join-Path $defaultData 'speech/test-module.bin') -Value 'remove'

    node scripts/windows-desktop-smoke.mjs $app
    Remove-Item -LiteralPath (Join-Path $target 'engine/RiftboundEngine.exe')
    Run-Setup '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART'
    if (!(Test-Path -LiteralPath (Join-Path $target 'engine/RiftboundEngine.exe'))) { throw 'Repair failed to restore the engine in the original directory.' }
    if ((Get-Content -LiteralPath $save) -ne 'preserve') { throw 'Repair changed the recorded save.' }
} finally {
    $uninstaller = Get-ChildItem -LiteralPath $target -Filter 'unins*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($uninstaller) {
        $p = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART' -Wait -PassThru -WindowStyle Hidden
        if ($p.ExitCode -ne 0) { throw "Uninstall returned $($p.ExitCode)" }
        if ((Test-Path -LiteralPath $app) -or (Test-Path -LiteralPath (Join-Path $defaultData 'speech'))) { throw 'Uninstall left the application or module behind.' }
        if ((Get-Content -LiteralPath $save) -ne 'preserve' -or (Get-Content -LiteralPath $marker) -ne 'personal') { throw 'Uninstall removed personal files.' }
    }
    if (Test-Path -LiteralPath $save) { Remove-Item -LiteralPath $save }
    if ((Test-Path -LiteralPath $defaultData) -and !(Get-ChildItem -LiteralPath $defaultData -Force)) {
        Remove-Item -LiteralPath $defaultData
    }
}
Write-Host 'PASS: custom install directory, repair, preservation of saves and clean uninstall.'
