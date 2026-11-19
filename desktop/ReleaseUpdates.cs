using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;

namespace Riftbound;

internal sealed record ReleaseAsset(Version Version, Uri Url, string Sha256, long Size);
internal sealed record Transfer(long Received, long Total, double BytesPerSecond);

internal sealed class ReleaseUpdates
{
    private static readonly Version Installed = new(Program.Version.Major, Program.Version.Minor, Program.Version.Build);
    private const string Endpoint = "https://api.github.com/repos/Nitarii/Riftbound/releases?per_page=30";
    private const string Prefix = "https://github.com/Nitarii/Riftbound/releases/download/";
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(15) };
    private static readonly SemaphoreSlim CheckLock = new(1);

    static ReleaseUpdates()
    {
        Http.DefaultRequestHeaders.UserAgent.ParseAdd("RiftboundCompanion/" + Installed);
        Http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
    }

    public ReleaseAsset? Latest { get; private set; }
    public ReleaseAsset? Repair { get; private set; }
    public bool Checked { get; private set; }
    public string? Error { get; private set; }
    public event Action? Changed;

    public async Task CheckAsync(CancellationToken cancellation)
    {
        try
        {
            await CheckLock.WaitAsync(cancellation);
            try
            {
                var releases = await Http.GetFromJsonAsync<JsonElement>(Endpoint, cancellation);
                var assets = releases.EnumerateArray().Select(SelectAsset).OfType<ReleaseAsset>().ToArray();
                Latest = assets.Where(asset => asset.Version > Installed).MaxBy(asset => asset.Version);
                Repair = assets.FirstOrDefault(asset => asset.Version == Installed);
                Error = null;
                Checked = true;
            }
            finally { CheckLock.Release(); }
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { return; }
        catch (Exception error) when (error is HttpRequestException or IOException or JsonException or TaskCanceledException)
        {
            Error = error.Message;
        }
        Changed?.Invoke();
    }

    private static ReleaseAsset? SelectAsset(JsonElement release)
    {
        if (release.GetProperty("draft").GetBoolean() || release.GetProperty("prerelease").GetBoolean()) return null;
        var tag = release.GetProperty("tag_name").GetString();
        if (tag is null || !tag.StartsWith("desktop-v", StringComparison.Ordinal) ||
            !Version.TryParse(tag["desktop-v".Length..], out var version) ||
            version.Build < 0 || version.Revision >= 0 || tag != "desktop-v" + version) return null;

        var filename = "RiftboundCompanion-" + version + "-x64-Setup.exe";
        foreach (var asset in release.GetProperty("assets").EnumerateArray())
        {
            if (asset.GetProperty("name").GetString() != filename ||
                !asset.TryGetProperty("digest", out var digestValue)) continue;
            var url = asset.GetProperty("browser_download_url").GetString();
            var digest = digestValue.GetString();
            var size = asset.GetProperty("size").GetInt64();
            if (url == Prefix + tag + "/" + filename && size > 0 &&
                digest is { Length: 71 } && digest.StartsWith("sha256:", StringComparison.Ordinal) &&
                digest[7..].All(Uri.IsHexDigit))
                return new ReleaseAsset(version, new Uri(url), digest[7..], size);
        }
        return null;
    }

    public async Task<string> DownloadAsync(ReleaseAsset asset, IProgress<Transfer> progress, CancellationToken cancellation)
    {
        var directory = Path.Combine(Program.DataDirectory, "desktop-updates");
        Directory.CreateDirectory(directory);
        var filename = Path.Combine(directory, Path.GetFileName(asset.Url.AbsolutePath));
        var partial = filename + ".part";
        try
        {
            using var response = await Http.GetAsync(asset.Url, HttpCompletionOption.ResponseHeadersRead, cancellation);
            response.EnsureSuccessStatusCode();
            if (response.Content.Headers.ContentLength is long length && length != asset.Size)
                throw new IOException("La taille du téléchargement ne correspond pas à GitHub.");
            using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            using var stall = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
            stall.CancelAfter(TimeSpan.FromSeconds(30));
            await using var source = await response.Content.ReadAsStreamAsync(stall.Token);
            var stopwatch = System.Diagnostics.Stopwatch.StartNew();
            long received = 0;
            double lastReport = -1;
            var buffer = new byte[128 * 1024];
            await using (var target = new FileStream(partial, FileMode.Create, FileAccess.Write, FileShare.None, buffer.Length, true))
            {
                int count;
                while ((count = await source.ReadAsync(buffer, stall.Token)) > 0)
                {
                    stall.CancelAfter(TimeSpan.FromSeconds(30));
                    received += count;
                    if (received > asset.Size) throw new IOException("Téléchargement trop volumineux.");
                    hash.AppendData(buffer, 0, count);
                    await target.WriteAsync(buffer.AsMemory(0, count), cancellation);
                    var seconds = stopwatch.Elapsed.TotalSeconds;
                    if (seconds - lastReport >= 0.2)
                    {
                        lastReport = seconds;
                        progress.Report(new Transfer(received, asset.Size, received / Math.Max(.1, seconds)));
                    }
                }
            }
            if (received != asset.Size || !CryptographicOperations.FixedTimeEquals(hash.GetHashAndReset(), Convert.FromHexString(asset.Sha256)))
                throw new IOException("La vérification SHA-256 de l’installateur a échoué.");
            progress.Report(new Transfer(received, asset.Size, 0));
            File.Move(partial, filename, true);
            return filename;
        }
        finally
        {
            if (File.Exists(partial)) File.Delete(partial);
        }
    }
}
