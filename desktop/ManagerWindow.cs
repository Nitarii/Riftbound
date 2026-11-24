using System.Diagnostics;
using System.Text.Json;

namespace Riftbound;

internal sealed class ManagerWindow : Form
{
    private readonly EngineSession engine;
    private readonly ReleaseUpdates updates;
    private readonly bool english;
    private readonly Action<string> install;
    private readonly CancellationTokenSource lifetime = new();
    private readonly System.Windows.Forms.Timer timer = new() { Interval = 600 };
    private readonly Label hardware = new();
    private readonly Label notice = new();
    private readonly ModuleRow small;
    private readonly ModuleRow large;
    private readonly ModuleRow voice;
    private readonly ModuleRow synthesis;
    private readonly ModuleRow release;
    private readonly RadioButton auto;
    private readonly RadioButton cpu;
    private readonly Dictionary<ModuleRow, (string Phase, long Bytes, long Time)> samples = new();
    private const string Small = "qwen3:4b-instruct-2507";
    private const string Large = "qwen3.5:9b-q4km";
    private bool polling, busy, installingUpdate, preferenceLoaded;

    public ManagerWindow(EngineSession engine, ReleaseUpdates updates, bool english, Action<string> install, Action stop)
    {
        this.engine = engine;
        this.updates = updates;
        this.english = english;
        this.install = install;
        Text = L("Gestionnaire", "Manager") + " · Riftbound Companion";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(740, 670);
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(575, 560);
        Font = new Font("Segoe UI", 10);
        BackColor = Color.FromArgb(15, 21, 28);
        ForeColor = Color.WhiteSmoke;

        var content = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, AutoScroll = true, Padding = new Padding(18),
            ColumnCount = 1, AutoSize = true
        };
        content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(content);
        Add(content, Caption(L("Modules locaux", "Local modules"), 18));
        Add(content, hardware);
        hardware.AutoSize = true;
        var options = Bar();
        auto = new RadioButton { Text = L("Accélération automatique", "Automatic acceleration"), AutoSize = true, Checked = true };
        cpu = new RadioButton { Text = L("CPU seulement", "CPU only"), AutoSize = true };
        options.Controls.Add(auto);
        options.Controls.Add(cpu);
        Add(content, options);

        large = AddModule(content, "Qwen3.5 9B", Large);
        small = AddModule(content, "Qwen3 4B · " + L("léger", "lightweight"), Small);
        voice = AddModule(content, "Whisper Small · " + L("Microphone", "Microphone"), null);
        synthesis = new ModuleRow(L("Voix française · Piper SIWIS", "French voice · Piper SIWIS"),
            L("Installer", "Install"), "", "");
        synthesis.Toggle.Visible = synthesis.Repair.Visible = synthesis.Remove.Visible = false;
        synthesis.Install.Click += async (_, _) => await RunAsync(async () =>
        {
            await engine.PostAsync("api/speech/synthesis/install", new { }, lifetime.Token);
        });
        Add(content, synthesis.Panel);
        release = new ModuleRow(L("Application Windows", "Windows app"), L("Vérifier", "Check"), L("Mettre à jour", "Update"), L("Réparer", "Repair"));
        Add(content, release.Panel);
        release.Remove.Visible = false;
        release.Install.Click += async (_, _) => await RunAsync(async () => await updates.CheckAsync(lifetime.Token));
        release.Toggle.Click += async (_, _) => await ApplyUpdateAsync(updates.Latest);
        release.Repair.Click += async (_, _) => await ApplyUpdateAsync(updates.Repair);

        notice.AutoSize = true;
        Add(content, notice);
        var footer = Bar();
        var data = Button(L("Ouvrir le dossier des données", "Open data folder"));
        data.Click += (_, _) => Process.Start(new ProcessStartInfo(engine.Data) { UseShellExecute = true });
        footer.Controls.Add(data);
        var shutdown = Button(L("Tout arrêter et quitter", "Stop everything and exit"));
        shutdown.Click += (_, _) => stop();
        footer.Controls.Add(shutdown);
        Add(content, footer);
        updates.Changed += RenderRelease;
        RenderRelease();
        timer.Tick += async (_, _) => await RefreshAsync();
        Shown += async (_, _) => { timer.Start(); await RefreshAsync(); };
        FormClosed += (_, _) =>
        {
            timer.Dispose();
            lifetime.Cancel();
            updates.Changed -= RenderRelease;
        };
    }

    private string L(string french, string englishText) => english ? englishText : french;

    private ModuleRow AddModule(TableLayoutPanel layout, string title, string? model)
    {
        var row = new ModuleRow(title, L("Installer", "Install"), L("Activer", "Enable"), L("Réparer", "Repair"));
        row.Remove.Text = L("Supprimer", "Remove");
        row.Install.Click += async (_, _) => await ChangeModule(model, "install");
        row.Toggle.Click += async (_, _) => await ChangeModule(model, row.Enabled ? "stop" : "enable");
        row.Repair.Click += async (_, _) => await ChangeModule(model, "repair");
        row.Remove.Click += async (_, _) => await ChangeModule(model, "remove");
        Add(layout, row.Panel);
        return row;
    }

    private async Task ChangeModule(string? model, string action)
    {
        var backend = cpu.Checked ? "cpu" : "auto";
        if (action == "remove" && MessageBox.Show(this,
            L("Supprimer les fichiers de ce modèle ?", "Remove this model’s files?"), Text,
            MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

        if (model is null)
        {
            await RunAsync(() => action switch
            {
                "enable" => Post("api/manager/processes/whisper/enable", new { }),
                "stop" => Post("api/manager/processes/stop", new { target = "whisper" }),
                "remove" => Post("api/manager/modules/remove", new { target = "whisper" }),
                _ => Post("api/speech/install", new { confirmFolder = engine.Data, repair = action == "repair" })
            });
        }
        else
        {
            await RunAsync(() => action switch
            {
                "enable" => Post("api/ai/free/desktop-enable", new { model, backend }),
                "stop" => Post("api/ai/rules/activate", new { }),
                "remove" => Post("api/manager/modules/remove", new { target = "qwen", model }),
                _ => Post("api/ai/free/desktop-install", new { model, backend, repair = action == "repair" })
            });
        }
    }

    private Task<JsonElement> Post(string path, object data) => engine.PostAsync(path, data, lifetime.Token);

    private async Task RunAsync(Func<Task> action)
    {
        if (busy) return;
        busy = true;
        notice.Text = "";
        try { await action(); }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        catch (Exception error) { if (!IsDisposed) notice.Text = error.Message; }
        finally { busy = false; }
        await RefreshAsync();
    }

    private async Task RefreshAsync()
    {
        if (polling || IsDisposed || lifetime.IsCancellationRequested) return;
        polling = true;
        try
        {
            var jobs = await Task.WhenAll(
                engine.GetAsync("api/ai/free/status", lifetime.Token),
                engine.GetAsync("api/ai/status", lifetime.Token),
                engine.GetAsync("api/speech/status", lifetime.Token));
            if (IsDisposed) return;
            var ai = jobs[0];
            var enabled = jobs[1];
            var whisper = jobs[2];
            var recommendation = ai.GetProperty("recommendation");
            var recommended = String(recommendation, "model");
            var gpu = String(recommendation, "gpuName");
            var processor = String(recommendation, "cpuName");
            if (processor.Length == 0) processor = "CPU";
            hardware.Text = processor + " · " + Number(recommendation, "ramGB") + " GB RAM" +
                (string.IsNullOrEmpty(gpu) ? "" : "\n" + gpu);
            if (!preferenceLoaded)
            {
                cpu.Checked = String(ai, "preferredBackend") == "cpu";
                auto.Checked = !cpu.Checked;
                preferenceLoaded = true;
            }
            foreach (var item in ai.GetProperty("models").EnumerateArray())
            {
                var id = String(item, "id");
                var row = id == Small ? small : large;
                var selected = String(ai, "model") == id;
                var shown = selected && Bool(ai, "installing");
                var active = selected && Bool(ai, "processActive");
                var useModel = String(enabled, "model") == id && Bool(enabled, "enabled") && !Bool(enabled, "rulesOnly");
                var installed = Bool(item, "installed") && Bool(ai, "engineInstalled");
                var hint = String(item, "size") + (id == recommended ? " · " + L("recommandé", "recommended") : "");
                RenderModule(row, hint, ai, installed, useModel, active, shown, selected, Bool(ai, "installing"));
            }
            RenderModule(voice, "488 MB", whisper, Bool(whisper, "installed"), Bool(whisper, "enabled"),
                Bool(whisper, "processActive"), Bool(whisper, "installing"), true, Bool(whisper, "installing"));
            if (whisper.TryGetProperty("synthesis", out var naturalVoice))
            {
                var installingVoice = Bool(naturalVoice, "installing");
                var nativeVoice = Bool(naturalVoice, "native");
                var error = String(naturalVoice, "error");
                synthesis.Install.Enabled = !nativeVoice && !installingVoice;
                synthesis.Progress.Visible = installingVoice;
                synthesis.Progress.Style = ProgressBarStyle.Marquee;
                synthesis.Status.Text = installingVoice ? String(naturalVoice, "message")
                    : error.Length > 0 ? error
                    : Bool(naturalVoice, "installed") ? L("Prête · synthèse locale", "Ready · local speech")
                    : L("Voix neuronale gratuite à installer", "Free neural voice available to install");
            }
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        catch (Exception error) { if (!IsDisposed) notice.Text = error.Message; }
        finally { polling = false; }
    }

    private void RenderModule(ModuleRow row, string hint, JsonElement state, bool installed, bool enabled,
        bool active, bool running, bool selected, bool anotherOperation)
    {
        var error = selected ? String(state, "error") : "";
        var phase = String(state, "phase");
        var status = error.Length > 0 ? error : active ? L("Actif", "Active") :
            installed ? enabled ? L("Prêt", "Ready") : L("Arrêté", "Stopped") : L("Non installé", "Not installed");
        row.Install.Enabled = !anotherOperation && !installed;
        row.Toggle.Enabled = installed && !anotherOperation || running;
        row.Toggle.Text = enabled || running ? L("Arrêter", "Stop") : L("Activer", "Enable");
        row.Enabled = enabled || running;
        row.Repair.Enabled = !anotherOperation && (installed || error.Length > 0);
        row.Remove.Enabled = !anotherOperation && (installed || error.Length > 0);
        row.Progress.Visible = running;
        if (running)
        {
            var bytes = Number(state, "transferred");
            var total = Number(state, "total");
            var time = Stopwatch.GetTimestamp();
            var speed = 0.0;
            if (samples.TryGetValue(row, out var last) && last.Phase == phase && bytes >= last.Bytes)
                speed = (bytes - last.Bytes) / Math.Max(.01, Stopwatch.GetElapsedTime(last.Time, time).TotalSeconds);
            samples[row] = (phase, bytes, time);
            var percent = (int)Math.Clamp(Number(state, "progress"), 0, 100);
            row.Progress.Style = total > 0 && phase is "engine" or "model" ? ProgressBarStyle.Continuous : ProgressBarStyle.Marquee;
            row.Progress.Value = percent;
            var stage = phase switch
            {
                "model" => L("Modèle", "Model"), "engine" => L("Moteur", "Engine"),
                "extracting" => L("Extraction", "Extracting"), "starting" => L("Démarrage", "Starting"),
                _ => L("Vérification", "Checking")
            };
            status = stage + (total > 0 && phase is "engine" or "model" ? " · " + FormatTransfer(bytes, total, speed) : "");
        }
        else samples.Remove(row);
        row.Status.Text = hint + "  ·  " + status;
    }

    private void RenderRelease()
    {
        if (IsDisposed || installingUpdate) return;
        var version = Program.Version.ToString(3);
        release.Status.Text = L("Installée ", "Installed ") + version + "  ·  " +
            (updates.Latest is { } next ? L("Disponible ", "Available ") + next.Version :
                updates.Error is not null ? L("Vérification indisponible", "Check unavailable") :
                updates.Checked ? L("À jour", "Up to date") : L("Vérification…", "Checking…"));
        release.Toggle.Enabled = updates.Latest is not null;
        release.Repair.Enabled = updates.Repair is not null;
    }

    private async Task ApplyUpdateAsync(ReleaseAsset? asset)
    {
        if (asset is null || installingUpdate) return;
        await RunAsync(async () =>
        {
            installingUpdate = true;
            release.Install.Enabled = release.Toggle.Enabled = release.Repair.Enabled = false;
            release.Progress.Visible = true;
            try
            {
                var progress = new Progress<Transfer>(transfer =>
                {
                    if (IsDisposed) return;
                    release.Progress.Value = (int)Math.Clamp(100.0 * transfer.Received / transfer.Total, 0, 100);
                    release.Status.Text = FormatTransfer(transfer.Received, transfer.Total, transfer.BytesPerSecond);
                });
                release.Status.Text = L("Téléchargement…", "Downloading…");
                var file = await updates.DownloadAsync(asset, progress, lifetime.Token);
                release.Status.Text = L("Installation…", "Installing…");
                install(file);
            }
            finally
            {
                installingUpdate = false;
                release.Install.Enabled = true;
                release.Progress.Visible = false;
                RenderRelease();
            }
        });
    }

    private static string FormatTransfer(long n, long total, double speed) =>
        $"{100.0 * n / total:0}%  ·  {n / 1048576.0:0.0} / {total / 1048576.0:0.0} MB  ·  {speed / 1048576:0.0} MB/s";
    private static bool Bool(JsonElement data, string key) => data.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.True;
    private static string String(JsonElement data, string key) => data.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString()! : "";
    private static long Number(JsonElement data, string key) => data.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.Number ? (long)Math.Round(value.GetDouble()) : 0;

    private static Label Caption(string text, int size) => new() { Text = text, AutoSize = true, Font = new Font("Segoe UI Semibold", size) };
    private static FlowLayoutPanel Bar() => new() { AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, WrapContents = true };
    private static Button Button(string text) => new() { Text = text, AutoSize = true, FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(34, 46, 61), ForeColor = Color.WhiteSmoke, Padding = new Padding(4, 0, 4, 0) };

    private static void Add(TableLayoutPanel layout, Control control)
    {
        control.Margin = new Padding(0, 0, 0, 9);
        control.Dock = DockStyle.Top;
        layout.Controls.Add(control, 0, layout.RowCount++);
    }

    private sealed class ModuleRow
    {
        public TableLayoutPanel Panel { get; } = new()
        {
            ColumnCount = 1, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Padding = new Padding(10), BackColor = Color.FromArgb(23, 32, 43)
        };
        public Label Status { get; } = new() { AutoSize = true };
        public ProgressBar Progress { get; } = new() { Height = 6, Maximum = 100, Visible = false };
        public Button Install { get; }
        public Button Toggle { get; }
        public Button Repair { get; }
        public Button Remove { get; } = Button("");
        public bool Enabled { get; set; }

        public ModuleRow(string title, string install, string toggle, string repair)
        {
            Install = Button(install);
            Toggle = Button(toggle);
            Repair = Button(repair);
            var buttons = Bar();
            buttons.Controls.AddRange([Install, Toggle, Repair, Remove]);
            Panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            var heading = Caption(title, 11);
            Add(Panel, heading);
            Add(Panel, Status);
            Add(Panel, Progress);
            Add(Panel, buttons);
        }
    }
}
