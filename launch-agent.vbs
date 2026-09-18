' Nexus AI Agent Silent Desktop Launcher
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

WshShell.Run "node """ & scriptDir & "\launch.js""", 0, False
