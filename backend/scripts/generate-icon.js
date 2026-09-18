'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const workspaceDir = path.resolve(__dirname, '../../');
const desktopDir = 'c:\\Users\\saket\\OneDrive\\Desktop';
const icoPath = path.join(workspaceDir, 'agent-icon.ico');
const pngPath = path.join(workspaceDir, 'agent-icon.png');
const vbsPath = path.join(workspaceDir, 'launch-agent.vbs');
const shortcutPath = path.join(desktopDir, 'AI Browser Agent.lnk');

// 1. Generate a high-resolution 256x256 PNG icon using PowerShell script written to file
const genPs1 = `
Add-Type -AssemblyName System.Drawing
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

# Outer vibrant purple-cyan gradient orb
$rect = New-Object System.Drawing.Rectangle 10, 10, 236, 236
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0,0), (New-Object System.Drawing.Point 256,256), ([System.Drawing.Color]::FromArgb(255, 147, 51, 234)), ([System.Drawing.Color]::FromArgb(255, 6, 182, 212))
$g.FillEllipse($bgBrush, $rect)

# Inner sleek dark cockpit
$innerRect = New-Object System.Drawing.Rectangle 30, 30, 196, 196
$innerBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 12, 14, 24))
$g.FillEllipse($innerBrush, $innerRect)

# Center glowing cyan-purple AI spark
$centerRect = New-Object System.Drawing.Rectangle 60, 60, 136, 136
$centerBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 60,60), (New-Object System.Drawing.Point 196,196), ([System.Drawing.Color]::FromArgb(255, 168, 85, 247)), ([System.Drawing.Color]::FromArgb(255, 6, 182, 212))
$g.FillEllipse($centerBrush, $centerRect)

# Core bright glow
$coreRect = New-Object System.Drawing.Rectangle 92, 92, 72, 72
$coreBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
$g.FillEllipse($coreBrush, $coreRect)

$bmp.Save('${pngPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$g.Dispose()
Write-Host 'PNG generated.'
`;

fs.writeFileSync(path.join(workspaceDir, 'make-png.ps1'), genPs1, 'utf8');
execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(workspaceDir, 'make-png.ps1')}"`, { stdio: 'inherit' });

// 2. Package PNG into true 256x256 Windows ICO binary
const pngBuffer = fs.readFileSync(pngPath);
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // Reserved
icoHeader.writeUInt16LE(1, 2); // Type: 1 = ICO
icoHeader.writeUInt16LE(1, 4); // Count: 1 image

const icoDir = Buffer.alloc(16);
icoDir.writeUInt8(0, 0);       // Width: 0 = 256px
icoDir.writeUInt8(0, 1);       // Height: 0 = 256px
icoDir.writeUInt8(0, 2);       // Color count: 0 (no palette)
icoDir.writeUInt8(0, 3);       // Reserved
icoDir.writeUInt16LE(1, 4);    // Color planes: 1
icoDir.writeUInt16LE(32, 6);   // Bits per pixel: 32 (RGBA)
icoDir.writeUInt32LE(pngBuffer.length, 8); // Size of image data
icoDir.writeUInt32LE(22, 12);  // Offset: 6 (header) + 16 (dir) = 22

const fullIco = Buffer.concat([icoHeader, icoDir, pngBuffer]);
fs.writeFileSync(icoPath, fullIco);
console.log('True Windows 256x256 ICO created! File size:', fullIco.length, 'bytes');

// 3. Create / Update the Desktop shortcut with explicit icon location
const shortcutPs1 = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('${shortcutPath.replace(/\\/g, '\\\\')}')
$Shortcut.TargetPath = 'wscript.exe'
$Shortcut.Arguments = '"${vbsPath.replace(/\\/g, '\\\\')}"'
$Shortcut.WorkingDirectory = '${workspaceDir.replace(/\\/g, '\\\\')}'
$Shortcut.Description = 'AI Browser Agent - Autonomous Floating Assistant'
$desktopIco = 'c:\\Users\\saket\\OneDrive\\Desktop\\agent-icon.ico'
$Shortcut.IconLocation = "$desktopIco,0"
$Shortcut.Save()

# Notify Windows Explorer of shell change to refresh desktop icon cache immediately
$code = @'
using System;
using System.Runtime.InteropServices;
public class ShellNotifier {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
    public static void Refresh() {
        SHChangeNotify(0x08000000, 0x0000, IntPtr.Zero, IntPtr.Zero); // SHCNE_ASSOCCHANGED
    }
}
'@
Add-Type -TypeDefinition $code -Language CSharp
[ShellNotifier]::Refresh()

Write-Host 'Desktop shortcut updated and Windows icon cache notified!'
`;

fs.writeFileSync(path.join(workspaceDir, 'make-shortcut.ps1'), shortcutPs1, 'utf8');
execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(workspaceDir, 'make-shortcut.ps1')}"`, { stdio: 'inherit' });

// Clean up temporary generator ps1 files
try {
  fs.unlinkSync(path.join(workspaceDir, 'make-png.ps1'));
  fs.unlinkSync(path.join(workspaceDir, 'make-shortcut.ps1'));
} catch {}

console.log('All done! Icon and shortcut are updated.');
