#!/bin/sh
p=/mnt/vrising/persistentdata
kill -TERM $(ps -A | grep 'VRising' | awk '{print $1}') &
wineserver -k
kill -TERM $(ps -A | grep 'Xvfb' | awk '{print $1}') &
kill -TERM $(ps -A | grep 'wineserver' | awk '{print $1}') &
kill -TERM $(ps -A | grep 'wineboot' | awk '{print $1}') &
wait $!
