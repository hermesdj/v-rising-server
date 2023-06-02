#!/bin/bash

echo "server path is $s"
echo "persistent data path is $p"
echo "log file is $logFile"
echo "server name is $serverName"
echo "save name is $saveName"

cd "$s"
DISPLAY=:0.0 wine64 VRisingServer.exe -persistentDataPath $p -serverName "$serverName" -saveName "$saveName" -logFile "$logFile" $ports[0] $ports[1]
