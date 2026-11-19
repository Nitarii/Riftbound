using System.Collections;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Riftbound;

// The suspended child enters a kill-on-close job before it can spawn any workers.
internal sealed class EngineJob : IDisposable
{
    private const uint CreateSuspended = 0x00000004;
    private const uint UnicodeEnvironment = 0x00000400;
    private const uint NoWindow = 0x08000000;
    private readonly SafeFileHandle job;
    private readonly SafeFileHandle process;

    public EngineJob(string executable, IReadOnlyDictionary<string, string> overrides)
    {
        job = CreateJobObject(IntPtr.Zero, null);
        if (job.IsInvalid) throw new Win32Exception();
        try
        {
            var limits = new ExtendedLimits { Basic = new BasicLimits { Flags = 0x2000 } };
            if (!SetInformationJobObject(job, 9, ref limits, Marshal.SizeOf<ExtendedLimits>()))
                throw new Win32Exception();

            var variables = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (DictionaryEntry entry in Environment.GetEnvironmentVariables())
                variables[(string)entry.Key] = (string)entry.Value!;
            variables.Remove("NODE_OPTIONS");
            foreach (var entry in overrides) variables[entry.Key] = entry.Value;
            var block = Marshal.StringToHGlobalUni(string.Join('\0', variables.Select(v => v.Key + "=" + v.Value)) + "\0");
            try
            {
                var startup = new StartupInfo { Size = Marshal.SizeOf<StartupInfo>() };
                var command = new StringBuilder($"\"{executable}\" --desktop");
                if (!CreateProcess(executable, command, IntPtr.Zero, IntPtr.Zero, false,
                        CreateSuspended | UnicodeEnvironment | NoWindow, block, Path.GetDirectoryName(executable)!,
                        ref startup, out var handles))
                    throw new Win32Exception();

                process = new SafeFileHandle(handles.Process, true);
                using var thread = new SafeFileHandle(handles.Thread, true);
                if (!AssignProcessToJobObject(job, process) || ResumeThread(thread) == uint.MaxValue)
                {
                    var error = new Win32Exception();
                    TerminateProcess(process, 1);
                    process.Dispose();
                    throw error;
                }
            }
            finally { Marshal.FreeHGlobal(block); }
        }
        catch
        {
            job.Dispose();
            throw;
        }
    }

    public bool HasExited => WaitForSingleObject(process, 0) == 0;
    public uint? ExitCode => GetExitCodeProcess(process, out var code) ? code : null;

    public void Dispose()
    {
        if (job.IsClosed) return;
        job.Dispose();
        WaitForSingleObject(process, 1500);
        process.Dispose();
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimits
    {
        public long PerProcessTime, PerJobTime;
        public uint Flags;
        public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimits
    {
        public BasicLimits Basic;
        public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct StartupInfo
    {
        public int Size;
        public IntPtr Reserved, Desktop, Title;
        public uint X, Y, XSize, YSize, XChars, YChars, FillAttribute, Flags;
        public ushort ShowWindow, ReservedSize;
        public IntPtr ReservedBytes, Stdin, Stdout, Stderr;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInfo
    {
        public IntPtr Process, Thread;
        public uint ProcessId, ThreadId;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateJobObject(IntPtr attributes, string? name);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(SafeFileHandle job, int type, ref ExtendedLimits data, int size);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(SafeFileHandle job, SafeFileHandle process);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(string application, StringBuilder command, IntPtr processAttributes,
        IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string directory,
        ref StartupInfo startup, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(SafeFileHandle thread);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(SafeFileHandle process, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(SafeFileHandle process, out uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(SafeFileHandle handle, uint milliseconds);
}
