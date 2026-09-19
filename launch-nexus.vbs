' Nexus Desktop Launcher
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

' Launch node launch.js in minimized terminal mode (7 = Minimized, ensures Chrome inherits visible window permissions)
WshShell.Run "node """ & scriptDir & "\launch.js""", 7, False
