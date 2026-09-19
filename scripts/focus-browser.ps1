param([string]$DataDirPattern = 'NexusCopilot')

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class WinFocus {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    private static readonly IntPtr HWND_TOP = new IntPtr(0);
    private const uint SWP_SHOWWINDOW = 0x0040;
    private const int SW_RESTORE = 9;
    private const int SW_MAXIMIZE = 3;
    private const int SW_SHOW = 5;

    public static void FocusPid(uint targetPid) {
        if (targetPid == 0) return;
        EnumWindows((hWnd, lParam) => {
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            if (pid == targetPid) {
                ShowWindow(hWnd, SW_RESTORE);
                ShowWindow(hWnd, SW_SHOW);
                ShowWindow(hWnd, SW_MAXIMIZE);
                SetWindowPos(hWnd, HWND_TOP, 0, 0, 0, 0, 0x0001 | 0x0002 | SWP_SHOWWINDOW); // SWP_NOSIZE | SWP_NOMOVE | SWP_SHOWWINDOW
                BringWindowToTop(hWnd);
                SetForegroundWindow(hWnd);
            }
            return true;
        }, IntPtr.Zero);
    }
}
"@

# Find the Nexus browser root process
$procs = Get-WmiObject Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and
    $_.CommandLine.Contains($DataDirPattern) -and
    $_.CommandLine -notmatch '--type='
}

$wshell = New-Object -ComObject WScript.Shell
foreach ($p in $procs) {
    # Activate via WScript.Shell
    $wshell.AppActivate($p.ProcessId) | Out-Null
    # Force Win32 restore & foreground
    [WinFocus]::FocusPid([uint32]$p.ProcessId)
}
