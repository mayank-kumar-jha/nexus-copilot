param([int]$TargetPid = 0)

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class WinFocus {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    private static readonly IntPtr HWND_TOP = new IntPtr(0);
    private const uint SWP_SHOWWINDOW = 0x0040;
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const int SW_RESTORE = 9;
    private const int SW_SHOW = 5;

    public static void FocusBrowser(uint targetPid) {
        EnumWindows((hWnd, lParam) => {
            StringBuilder sb = new StringBuilder(256);
            GetClassName(hWnd, sb, 256);
            string cls = sb.ToString();
            if (cls == "Chrome_WidgetWin_1") {
                uint pid;
                GetWindowThreadProcessId(hWnd, out pid);
                if (targetPid == 0 || pid == targetPid) {
                    ShowWindow(hWnd, SW_RESTORE);
                    ShowWindow(hWnd, SW_SHOW);
                    SetWindowPos(hWnd, HWND_TOP, 50, 50, 1280, 800, SWP_SHOWWINDOW);
                    BringWindowToTop(hWnd);
                    SetForegroundWindow(hWnd);
                }
            }
            return true;
        }, IntPtr.Zero);
    }
}
"@

[WinFocus]::FocusBrowser([uint32]$TargetPid)
