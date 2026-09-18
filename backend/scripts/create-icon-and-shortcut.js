'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const workspaceDir = path.resolve(__dirname, '../../');
const desktopDir = 'c:\\Users\\saket\\OneDrive\\Desktop';
const iconPath = path.join(workspaceDir, 'agent-icon.ico');
const vbsPath = path.join(workspaceDir, 'launch-agent.vbs');
const shortcutPath = path.join(desktopDir, 'AI Browser Agent.lnk');

// 1. Create launch-agent.vbs (Runs Node and Chrome silently with ZERO visible CMD window)
const vbsContent = `' AI Browser Agent Silent Desktop Launcher
Set WshShell = CreateObject("WScript.Shell")

' Start backend server silently (WindowStyle 0 = Hidden)
WshShell.Run "cmd /c ""cd /d c:\\Users\\saket\\OneDrive\\Desktop\\interview practice\\backend && node src/server.js""", 0, False

' Brief pause to allow backend port 3000 to listen
WScript.Sleep 1000

' Launch Chrome/Edge in pure floating app mode with custom dimensions
chromeCmd = """C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"" --app=http://localhost:3000 --user-data-dir=""%TEMP%\\ai-agent-app"" --window-size=620,240 --window-position=420,100"
chrome86Cmd = """C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"" --app=http://localhost:3000 --user-data-dir=""%TEMP%\\ai-agent-app"" --window-size=620,240 --window-position=420,100"
edgeCmd = "msedge --app=http://localhost:3000 --user-data-dir=""%TEMP%\\ai-agent-app"" --window-size=620,240 --window-position=420,100"

On Error Resume Next
WshShell.Run chromeCmd, 1, False
If Err.Number <> 0 Then
    Err.Clear
    WshShell.Run chrome86Cmd, 1, False
    If Err.Number <> 0 Then
        Err.Clear
        WshShell.Run edgeCmd, 1, False
    End If
End If
`;

fs.writeFileSync(vbsPath, vbsContent, 'utf8');
console.log('Created silent launcher at:', vbsPath);

// 2. Generate a valid .ico file
const psScript = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 64, 64
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(15, 17, 28))

# Outer glowing ring
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(168, 85, 247)), 4
$g.DrawEllipse($pen, 6, 6, 52, 52)

# Central orb
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0,0), (New-Object System.Drawing.Point 64,64), ([System.Drawing.Color]::FromArgb(168, 85, 247)), ([System.Drawing.Color]::FromArgb(6, 182, 212))
$g.FillEllipse($brush, 14, 14, 36, 36)

# Save as ICO
$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = [System.IO.File]::OpenWrite('${iconPath.replace(/\\/g, '\\\\')}')
$icon.Save($fs)
$fs.Close()
$bmp.Dispose()
$g.Dispose()
`;

try {
  fs.writeFileSync(path.join(workspaceDir, 'gen-icon.ps1'), psScript, 'utf8');
  execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(workspaceDir, 'gen-icon.ps1')}"`, { stdio: 'inherit' });
  console.log('Icon successfully generated at:', iconPath);
} catch (err) {
  console.warn('PowerShell icon generation warning:', err.message);
}

// 3. Create Windows Shortcut (.lnk) on Desktop with custom icon
const shortcutPsScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('${shortcutPath.replace(/\\/g, '\\\\')}')
$Shortcut.TargetPath = 'wscript.exe'
$Shortcut.Arguments = '"${vbsPath.replace(/\\/g, '\\\\')}"'
$Shortcut.WorkingDirectory = '${workspaceDir.replace(/\\/g, '\\\\')}'
$Shortcut.Description = 'AI Browser Agent - Autonomous Floating Assistant'
if (Test-Path '${iconPath.replace(/\\/g, '\\\\')}') {
    $Shortcut.IconLocation = '${iconPath.replace(/\\/g, '\\\\')},0'
}
$Shortcut.Save()
Write-Host 'Desktop shortcut updated with custom icon!'
`;

try {
  fs.writeFileSync(path.join(workspaceDir, 'create-shortcut.ps1'), shortcutPsScript, 'utf8');
  execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(workspaceDir, 'create-shortcut.ps1')}"`, { stdio: 'inherit' });
} catch (err) {
  console.warn('Shortcut creation warning:', err.message);
}
