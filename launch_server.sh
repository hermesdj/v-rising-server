#!/bin/sh

s=/mnt/vrising/server
p=/mnt/vrising/persistentdata
cd "$s"
DISPLAY=:0.0 wine64 VRisingServer.exe -persistentDataPath $p -serverName "$V_RISING_NAME" -saveName "$V_RISING_SAVE_NAME" -logFile "$p/VRising-Server.log"
