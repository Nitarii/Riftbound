#ifndef AppVersion
  #error Supply AppVersion from the desktop project.
#endif

[Setup]
AppId={{B363C4C7-862D-4F20-9AB4-83CD923BDD9B}
AppName=Riftbound Companion
AppVersion={#AppVersion}
AppPublisher=Nitarii
AppPublisherURL=https://github.com/Nitarii/Riftbound
DefaultDirName={localappdata}\Programs\Riftbound Companion
DefaultGroupName=Riftbound Companion
DisableDirPage=no
DisableProgramGroupPage=yes
DisableStartupPrompt=yes
UninstallDisplayIcon={app}\RiftboundCompanion.exe
SetupIconFile=..\dist\companion.ico
OutputDir=..\dist
OutputBaseFilename=RiftboundCompanion-{#AppVersion}-x64-Setup
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041
PrivilegesRequired=lowest
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
CloseApplications=no

[Languages]
Name: "fr"; MessagesFile: "compiler:Languages\French.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
fr.WebViewError=Microsoft Edge WebView2 est requis. Connectez-vous à Internet et relancez l’installation.
en.WebViewError=Microsoft Edge WebView2 is required. Connect to the Internet and run Setup again.
fr.Running=Fermez Riftbound Companion puis relancez l’opération.
en.Running=Close Riftbound Companion and run Setup again.
fr.RemoveSaves=Supprimer également les parties, les sauvegardes et les réglages personnels de Riftbound Companion ?
en.RemoveSaves=Also remove Riftbound Companion games, backups and personal settings?
fr.StartApp=Lancer Riftbound Companion
en.StartApp=Launch Riftbound Companion

[Files]
Source: "..\dist\desktop-publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pdb,Microsoft.Web.WebView2.Wpf.dll"
Source: "..\dist\desktop-tools\MicrosoftEdgeWebview2Setup.exe"; Flags: dontcopy

[Icons]
Name: "{autoprograms}\Riftbound Companion"; Filename: "{app}\RiftboundCompanion.exe"

[Run]
Filename: "{app}\RiftboundCompanion.exe"; Description: "{cm:StartApp}"; Flags: postinstall nowait skipifsilent
Filename: "{app}\RiftboundCompanion.exe"; Flags: nowait skipifnotsilent; Check: IsUpdate

[Code]
const
  HostMutex = 'Local\Nitarii.RiftboundCompanion.Desktop';
  WebViewClient = 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function OpenProcess(Access: LongWord; Inherit: LongBool; Pid: LongWord): THandle;
  external 'OpenProcess@kernel32.dll stdcall';
function WaitForSingleObject(Handle: THandle; Milliseconds: LongWord): LongWord;
  external 'WaitForSingleObject@kernel32.dll stdcall';
function CloseHandle(Handle: THandle): LongBool;
  external 'CloseHandle@kernel32.dll stdcall';

function IsUpdate: Boolean;
begin
  Result := ExpandConstant('{param:WAITPID|}') <> '';
end;

function InitializeSetup: Boolean;
var
  Pid: Integer;
  Handle: THandle;
begin
  if IsUpdate then begin
    Pid := StrToIntDef(ExpandConstant('{param:WAITPID|0}'), 0);
    if Pid > 0 then begin
      Handle := OpenProcess($100000, False, Pid);
      if Handle <> 0 then begin
        WaitForSingleObject(Handle, 15000);
        CloseHandle(Handle);
      end;
    end;
  end;
  Result := not CheckForMutexes(HostMutex);
  if not Result then SuppressibleMsgBox(CustomMessage('Running'), mbError, MB_OK, IDOK);
end;

function HasWebView: Boolean;
var
  Version: String;
begin
  Result := ((RegQueryStringValue(HKLM32, WebViewClient, 'pv', Version) or
    RegQueryStringValue(HKCU, WebViewClient, 'pv', Version)) and
    (Version <> '') and (Version <> '0.0.0.0'));
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExitCode: Integer;
begin
  Result := '';
  if HasWebView then exit;
  ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
  if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'), '/silent /install', '',
      SW_HIDE, ewWaitUntilTerminated, ExitCode) or (ExitCode <> 0) or not HasWebView then
    Result := CustomMessage('WebViewError');
end;

function InitializeUninstall: Boolean;
begin
  Result := not CheckForMutexes(HostMutex);
  if not Result then SuppressibleMsgBox(CustomMessage('Running'), mbError, MB_OK, IDOK);
end;

procedure CurUninstallStepChanged(Step: TUninstallStep);
var
  Data: String;
begin
  if Step <> usPostUninstall then exit;
  Data := ExpandConstant('{localappdata}\Nitarii\Riftbound Companion\');
  DelTree(Data + 'free-opponent', True, True, True);
  DelTree(Data + 'speech', True, True, True);
  DelTree(Data + 'desktop-updates', True, True, True);
  DelTree(Data + 'temp', True, True, True);
  DelTree(Data + 'webview', True, True, True);
  if SuppressibleMsgBox(CustomMessage('RemoveSaves'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2, IDNO) = IDYES then begin
    DeleteFile(Data + '.riftbound-local-state.json');
    DeleteFile(Data + '.riftbound-local-state.json.bak');
    DeleteFile(Data + '.riftbound-combat-checkpoint.json');
    DeleteFile(Data + '.riftbound-conversation.json');
    DeleteFile(Data + '.riftbound-ai-settings.json');
    DeleteFile(Data + 'desktop-preferences.json');
    RemoveDir(Data);
  end;
end;
