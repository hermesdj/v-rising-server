#!/bin/bash

# Initialize the variables
s=/mnt/vrising/server
p=/mnt/vrising/persistentdata
logFile=$p/VRising-Server.log
ports=()

# Parse the variables from arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
  -s|--server-path)
    s="$2"
    shift
    shift
    ;;
  -p|--persistent-data-path)
    p="$2"
    shift
    shift
    ;;
  -l|--log-file)
    logFile="$2"
    shift
    shift
    ;;
  *)
    ports+=("$1")
    shift
    ;;
  esac
done;

echo "server path is $s";
echo "persistent data path is $p";
echo "log file is $logFile";
for item in "${ports[@]}"
do
echo "ports are $item";
done

# Handle the On Exit event
onExit() {
  kill -INT $(ps -A | grep 'VRising' | awk '{print $1}')
  wait $!
}

# Set the timezone to the server
setTimezone() {
  echo "Set Timezone to $TZ"
  echo $TZ >/etc/timezone 2>&1
  ln -snf /usr/share/zoneinfo/$TZ /etc/localtime 2>&1
  dpkg-reconfigure -f noninteractive tzdata 2>&1
}

# Set the user
setUser() {
  if [ ! -z $UID ]; then
    usermod -u $UID docker 2>&1
  fi
  if [ ! -z $GID ]; then
    groupmod -g $GID docker 2>&1
  fi
}

# Remove the Xvfb lock if it is present
removeX0Lock() {
  if [ -f /tmp/.X0-lock ]; then
    echo "Removing /tmp/.X0-lock"
    rm /tmp/.X0-lock 2>&1
  fi
}

setTimezone
setUser

removeX0Lock

trap onExit INT TERM KILL

# Start Xvfb before launching the server
Xvfb :0 -screen 0 1024x768x16 &

echo "Starting V Rising Dedicated Server"
# Launch the server as a background process
DISPLAY=:0.0 wine64 $s/VRisingServer.exe -persistentDataPath $p -logFile "$logFile" 2>&1

echo $!
wait $!
