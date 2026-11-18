param([Parameter(Mandatory=$true)][string]$InstallRoot)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $InstallRoot).Path
$destination = Join-Path $root 'speech/piper'
if (Test-Path -LiteralPath $destination) {
    throw "Une installation Piper existe déjà dans $destination. Déplace-la avant de relancer ce script."
}
& py.exe -3.12 -c 'import struct,sys; sys.exit(0 if struct.calcsize("P")==8 else 1)'
if ($LASTEXITCODE) { throw 'Python 3.12 x64 est nécessaire pour cette voix facultative.' }

$parent = Split-Path -Parent $destination
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$stage = Join-Path $parent ('piper-install-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
$pipArgs = @('-3.12','-m','pip','install','--disable-pip-version-check','--no-cache-dir',
    '--only-binary',':all:','--target',(Join-Path $stage 'python'),
    'piper-tts==1.8.0','onnxruntime==1.32.0','numpy==2.5.5','packaging==26.3',
    'pathvalidate==3.3.1','protobuf==7.36.2','flatbuffers==25.12.19')
& py.exe @pipArgs
if ($LASTEXITCODE) { throw "Installation Piper incomplète : $stage" }
$modelURL = 'https://huggingface.co/rhasspy/piper-voices/resolve/cf910fb/fr/fr_FR/siwis/medium'
$digests = @{
    'fr_FR-siwis-medium.onnx' = 'B1D946FD68D0347155FA59BCE0A018924ABBEF3C1561181DB45CA463D83963EF'
    'fr_FR-siwis-medium.onnx.json' = 'DF814AA3DFEDD00510A07144442CC0A220FF21E43D03C3B078444FC0BE68FC37'
    'MODEL_CARD' = 'F75D76EC577B5E7A49A7462883D31EF65383022387818A9A0B75BDAF90B9010C'
}
foreach ($name in $digests.Keys) {
    $file = Join-Path $stage $name
    Invoke-WebRequest -Uri "$modelURL/$name" -OutFile $file
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $digests[$name]) {
        throw "Empreinte incorrecte pour $name : $stage"
    }
}
Move-Item -LiteralPath $stage -Destination $destination
Write-Host "Voix française SIWIS installée dans $destination"
