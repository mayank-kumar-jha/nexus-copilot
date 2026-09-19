param([string]$DataDirPattern = 'NexusCopilot')

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class WinForceTop {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    private static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_SHOWWINDOW = 0x0040;
    private const int SW_RESTORE = 9;
    private const int SW_MAXIMIZE = 3;
    private const int SW_SHOW = 5;

    public static void ForceForeground(uint targetPid) {
        if (targetPid == 0) return;

        EnumWindows((hWnd, lParam) => {
            uint pid;
            uint targetThread = GetWindowThreadProcessId(hWnd, out pid);
            if (pid == targetPid) {
                IntPtr hFore = GetForegroundWindow();
                uint dummy;
                uint foreThread = GetWindowThreadProcessId(hFore, out dummy);
                uint currentThread = GetCurrentThreadId();

                if (foreThread != currentThread && foreThread != 0) {
                    AttachThreadInput(currentThread, foreThread, true);
                    ShowWindow(hWnd, SW_RESTORE);
                    ShowWindow(hWnd, SW_MAXIMIZE);
                    SetWindowPos(hWnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                    SetWindowPos(hWnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                    BringWindowToTop(hWnd);
                    SetForegroundWindow(hWnd);
                    AttachThreadInput(currentThread, foreThread, false);
                } else {
                    ShowWindow(hWnd, SW_RESTORE);
                    ShowWindow(hWnd, SW_MAXIMIZE);
                    SetForegroundWindow(hWnd);
                }
            }
            return true;
        }, IntPtr.Zero);
    }
}
"@

# Find all NexusCopilot browser processes
$procs = Get-WmiObject Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and
    ($_.CommandLine.Contains('nexus-agent-browser') -or $_.CommandLine.Contains('NexusCopilot') -or ($_.CommandLine.Contains('--remote-debugging-pipe') -and $_.Name -match 'chrome|msedge')) -and
    $_.CommandLine -notmatch '--type='
}

$wshell = New-Object -ComObject WScript.Shell
foreach ($p in $procs) {
    try {
        $wshell.AppActivate($p.ProcessId) | Out-Null
        [WinForceTop]::ForceForeground([uint32]$p.ProcessId)
    } catch {}
}
