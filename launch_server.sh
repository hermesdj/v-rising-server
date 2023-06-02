#!/bin/bash

echo "server path is $s"
echo "persistent data path is $p"
echo "log file is $logFile"

cd "$s"
DISPLAY=:0.0 wine64 VRisingServer.exe -persistentDataPath $p -logFile "$logFile" $ports[0] $ports[1]
