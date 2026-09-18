' Nexus Desktop Silent Launcher (Zero CMD Window)
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

' Launch node launch.js in completely hidden mode (0 = Hidden)
WshShell.Run "node """ & scriptDir & "\launch.js""", 0, False
