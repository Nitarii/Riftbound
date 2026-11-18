using System.Reflection;
using System.Text.Json;

namespace Riftbound;

internal static class Program
{
    public const string InstanceMutex = @"Local\Nitarii.RiftboundCompanion.Desktop";
    public static Version Version => Assembly.GetExecutingAssembly().GetName().Version!;
    public static string DataDirectory { get; private set; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Nitarii", "Riftbound Companion");

    [STAThread]
    private static void Main(string[] args)
    {
        if (args is ["--check-webview"])
        {
            try { Microsoft.Web.WebView2.Core.CoreWebView2Environment.GetAvailableBrowserVersionString(); }
            catch { Environment.ExitCode = 1; }
            return;
        }

        if (args is ["--data-dir", var directory])
            DataDirectory = Path.GetFullPath(directory);

        using var mutex = new Mutex(true, InstanceMutex, out var isFirst);
        if (!isFirst) return;
        ApplicationConfiguration.Initialize();
        using var window = new BoardWindow();
        Application.Run(window);
    }
}

internal sealed class DesktopPreferences
{
    private readonly string file = Path.Combine(Program.DataDirectory, "desktop-preferences.json");
    public string Language { get; private set; } = "fr";

    public DesktopPreferences()
    {
        try
        {
            var saved = JsonSerializer.Deserialize<string>(File.ReadAllText(file));
            if (saved == "en") Language = saved;
        }
        catch (Exception error) when (error is IOException or JsonException) { }
    }

    public void SetLanguage(string language)
    {
        Language = language;
        File.WriteAllText(file + ".tmp", JsonSerializer.Serialize(language));
        File.Move(file + ".tmp", file, true);
    }
}
