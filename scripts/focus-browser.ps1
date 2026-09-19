Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public class WinForceTop {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);

    private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    private static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_SHOWWINDOW = 0x0040;
    private const int SW_RESTORE = 9;
    private const int SW_SHOW = 5;

    public static void FocusAllChrome() {
        IntPtr hFore = GetForegroundWindow();
        uint dummy;
        uint foreThread = GetWindowThreadProcessId(hFore, out dummy);
        uint currentThread = GetCurrentThreadId();

        EnumWindows((hWnd, lParam) => {
            StringBuilder cls = new StringBuilder(256);
            GetClassName(hWnd, cls, 256);
            string className = cls.ToString();

            if (className == "Chrome_WidgetWin_1") {
                StringBuilder title = new StringBuilder(256);
                GetWindowText(hWnd, title, 256);
                string titleStr = title.ToString();

                // Skip invisible background helper widgets
                if (titleStr.Length > 0 || IsWindowVisible(hWnd)) {
                    if (foreThread != currentThread && foreThread != 0) {
                        AttachThreadInput(currentThread, foreThread, true);
                        ShowWindow(hWnd, SW_RESTORE);
                        SetWindowPos(hWnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                        SetWindowPos(hWnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                        BringWindowToTop(hWnd);
                        SetForegroundWindow(hWnd);
                        SwitchToThisWindow(hWnd, true);
                        AttachThreadInput(currentThread, foreThread, false);
                    } else {
                        ShowWindow(hWnd, SW_RESTORE);
                        SetWindowPos(hWnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                        SetWindowPos(hWnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                        BringWindowToTop(hWnd);
                        SetForegroundWindow(hWnd);
                        SwitchToThisWindow(hWnd, true);
                    }
                }
            }
            return true;
        }, IntPtr.Zero);
    }
}
"@

[WinForceTop]::FocusAllChrome()
