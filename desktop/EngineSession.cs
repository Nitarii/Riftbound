using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;

namespace Riftbound;

internal sealed class EngineSession : IDisposable
{
    private readonly EngineJob job;
    private readonly HttpClient http = new(new SocketsHttpHandler { UseProxy = false }) { Timeout = TimeSpan.FromSeconds(12) };
    public string Token { get; } = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    public Uri Origin => http.BaseAddress!;
    public bool HasExited => job.HasExited;
    public string Data { get; }
    private readonly string readyPath;

    public EngineSession(string data)
    {
        Data = data;
        var temp = Path.Combine(Data, "temp");
        Directory.CreateDirectory(temp);
        readyPath = Path.Combine(temp, "engine-" + Guid.NewGuid().ToString("N") + ".json");
        var executable = Path.Combine(AppContext.BaseDirectory, "engine", "RiftboundEngine.exe");
        job = new EngineJob(executable, new Dictionary<string, string>
        {
            ["PORT"] = "0",
            ["RIFTBOUND_DATA_DIR"] = Data,
            ["RIFTBOUND_TOKEN"] = Token,
            ["RIFTBOUND_DESKTOP_READY"] = readyPath,
            ["RIFTBOUND_DESKTOP_CATALOG"] = Path.Combine(AppContext.BaseDirectory, "engine", "cards.json")
        });
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
    }

    public async Task ConnectAsync(CancellationToken cancellation)
    {
        for (var attempt = 0; attempt < 200; attempt++)
        {
            if (job.HasExited) throw new IOException("Le moteur local s’est arrêté au démarrage.");
            if (File.Exists(readyPath))
            {
                using var ready = JsonDocument.Parse(await File.ReadAllTextAsync(readyPath, cancellation));
                var port = ready.RootElement.GetProperty("port").GetInt32();
                if (port is < 1 or > 65535) throw new IOException("Le port du moteur est invalide.");
                http.BaseAddress = new Uri($"http://127.0.0.1:{port}/");
                await GetAsync("api/state", cancellation);
                File.Delete(readyPath);
                return;
            }
            await Task.Delay(75, cancellation);
        }
        throw new TimeoutException("Le moteur local ne répond pas.");
    }

    public Task<JsonElement> GetAsync(string path, CancellationToken cancellation) =>
        SendAsync(new HttpRequestMessage(HttpMethod.Get, path), cancellation);

    public Task<JsonElement> PostAsync(string path, object body, CancellationToken cancellation) =>
        SendAsync(new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) }, cancellation);

    private async Task<JsonElement> SendAsync(HttpRequestMessage request, CancellationToken cancellation)
    {
        using (request)
        using (var response = await http.SendAsync(request, cancellation))
        using (var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellation)))
        {
            var json = result.RootElement;
            if (!response.IsSuccessStatusCode)
                throw new IOException(json.TryGetProperty("error", out var error) ? error.GetString() : response.ReasonPhrase);
            return json.Clone();
        }
    }

    public async Task StopAsync()
    {
        if (http.BaseAddress is null || job.HasExited) return;
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        try
        {
            await PostAsync("api/manager/stop", new { confirm = "STOP_RIFTBOUND" }, deadline.Token);
            while (!job.HasExited) await Task.Delay(60, deadline.Token);
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or IOException or ObjectDisposedException) { }
    }

    public void Dispose()
    {
        http.Dispose();
        job.Dispose();
        if (File.Exists(readyPath)) File.Delete(readyPath);
    }
}
