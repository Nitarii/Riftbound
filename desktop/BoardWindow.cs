using System.Diagnostics;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Riftbound;

internal sealed class BoardWindow : Form
{
    private readonly CancellationTokenSource lifetime = new();
    private readonly DesktopPreferences preferences = new();
    private readonly WebView2 board = new() { Dock = DockStyle.Fill, Visible = false, DefaultBackgroundColor = Color.FromArgb(14, 19, 25) };
    private readonly Label splash = new() { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, Text = "Ouverture de Riftbound Companion…" };
    private readonly ReleaseUpdates updates = new();
    private EngineSession? engine;
    private ManagerWindow? manager;
    private bool closing, stopped;

    public BoardWindow()
    {
        Text = "Riftbound Companion";
        Font = new Font("Segoe UI", 11);
        ForeColor = Color.WhiteSmoke;
        BackColor = board.DefaultBackgroundColor;
        Size = new Size(1360, 890);
        MinimumSize = new Size(560, 510);
        StartPosition = FormStartPosition.CenterScreen;
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        Controls.Add(board);
        Controls.Add(splash);
        updates.Changed += () =>
        {
            if (!IsDisposed && updates.Latest is { } next)
                Text = "Riftbound Companion  ·  " + next.Version +
                    (preferences.Language == "en" ? " available" : " disponible");
        };
        Load += async (_, _) => await StartAsync();
        FormClosing += HandleClosing;
    }

    private async Task StartAsync()
    {
        var startupLog = Path.Combine(Program.DataDirectory, "temp", "desktop-startup.log");
        var step = "Locate WebView2 runtime";
        try
        {
            try { if (File.Exists(startupLog)) File.Delete(startupLog); }
            catch (Exception logError) when (logError is IOException or UnauthorizedAccessException) { }
            CoreWebView2Environment.GetAvailableBrowserVersionString();
            step = "Launch the local engine";
            engine = new EngineSession(Program.DataDirectory);
            await engine.ConnectAsync(lifetime.Token);
            step = "Create WebView2 environment";
            var environment = await CoreWebView2Environment.CreateAsync(
                userDataFolder: Path.Combine(Program.DataDirectory, "webview"));
            if (closing) return;
            step = "Initialize the board WebView2 control";
            await board.EnsureCoreWebView2Async(environment);
            if (closing) return;
            step = "Configure board navigation";
            await ConfigureWebViewAsync(environment, engine);
            if (closing) return;
            board.CoreWebView2.Navigate(engine.Origin.AbsoluteUri);
            _ = updates.CheckAsync(lifetime.Token);
        }
        catch (OperationCanceledException) when (closing) { }
        catch (Exception error)
        {
            engine?.Dispose();
            engine = null;
            if (!closing)
            {
                try
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(startupLog)!);
                    File.WriteAllText(startupLog, $"{step}\n{error.GetType().Name} (0x{error.HResult:X8}): {error.Message}\n");
                }
                catch (Exception logError) when (logError is IOException or UnauthorizedAccessException) { }
                splash.Text = "Riftbound Companion n’a pas démarré.\n\n" + error.Message;
            }
        }
    }

    private async Task ConfigureWebViewAsync(CoreWebView2Environment environment, EngineSession session)
    {
        var core = board.CoreWebView2;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.AreBrowserAcceleratorKeysEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.NavigationStarting += (_, args) => args.Cancel = !IsLocal(args.Uri, session.Origin);
        core.FrameNavigationStarting += (_, args) => args.Cancel = !IsLocal(args.Uri, session.Origin);
        core.NewWindowRequested += (_, args) => args.Handled = true;
        core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
        core.WebResourceRequested += (_, args) =>
        {
            if (!IsLocal(args.Request.Uri, session.Origin) && !args.Request.Uri.StartsWith("blob:", StringComparison.Ordinal))
                args.Response = environment.CreateWebResourceResponse(null, 403, "Offline board", "");
        };
        core.PermissionRequested += (_, args) =>
        {
            args.SavesInProfile = false;
            if (!IsLocal(args.Uri, session.Origin) || args.PermissionKind != CoreWebView2PermissionKind.Microphone)
                args.State = CoreWebView2PermissionState.Deny;
        };
        core.WebMessageReceived += (_, args) =>
        {
            if (!IsLocal(args.Source, session.Origin) || closing) return;
            using var packet = JsonDocument.Parse(args.WebMessageAsJson);
            var message = packet.RootElement;
            if (message.ValueKind != JsonValueKind.Object || !message.TryGetProperty("type", out var type)) return;
            if (type.ValueKind != JsonValueKind.String) return;
            if (type.GetString() == "manager") OpenManager();
            if (type.GetString() == "language" && message.TryGetProperty("language", out var value) &&
                value.ValueKind == JsonValueKind.String && value.GetString() is ("fr" or "en") and var language)
                preferences.SetLanguage(language);
        };
        core.NavigationCompleted += (_, args) =>
        {
            splash.Visible = !args.IsSuccess;
            board.Visible = args.IsSuccess;
            if (!args.IsSuccess) splash.Text = "Le plateau local n’a pas pu s’ouvrir.";
        };
        core.ProcessFailed += (_, args) =>
        {
            if (closing || args.ProcessFailedKind is not (CoreWebView2ProcessFailedKind.BrowserProcessExited or CoreWebView2ProcessFailedKind.RenderProcessExited)) return;
            board.Visible = false;
            splash.Visible = true;
            splash.Text = "Le plateau s’est fermé. Relance Riftbound Companion pour reprendre la partie.";
        };
        await core.AddScriptToExecuteOnDocumentCreatedAsync(
            "Object.defineProperty(window,'riftboundDesktop',{value:Object.freeze(" +
            JsonSerializer.Serialize(new { token = session.Token, language = preferences.Language }) + ")});");
    }

    private static bool IsLocal(string address, Uri origin) =>
        Uri.TryCreate(address, UriKind.Absolute, out var uri) &&
        uri.Scheme == origin.Scheme && uri.Host == origin.Host && uri.Port == origin.Port;

    private void OpenManager()
    {
        if (engine is null) return;
        if (manager is { IsDisposed: false }) { manager.Activate(); return; }
        manager = new ManagerWindow(engine, updates, preferences.Language == "en", LaunchInstaller, Close);
        manager.Show(this);
    }

    private void LaunchInstaller(string filename)
    {
        var start = new ProcessStartInfo(filename) { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden };
        foreach (var argument in new[] { "/SILENT", "/NORESTART", "/SP-", "/WAITPID=" + Environment.ProcessId })
            start.ArgumentList.Add(argument);
        using var installer = Process.Start(start) ?? throw new IOException("Le programme d’installation n’a pas démarré.");
        Close();
    }

    private async void HandleClosing(object? sender, FormClosingEventArgs args)
    {
        if (stopped || engine is null) return;
        args.Cancel = true;
        if (closing) return;
        closing = true;
        lifetime.Cancel();
        manager?.Close();
        await engine.StopAsync();
        engine.Dispose();
        engine = null;
        stopped = true;
        Close();
    }
}
