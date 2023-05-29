#!/bin/sh
s=/mnt/vrising/server
p=/mnt/vrising/persistentdata

onExit() {
  kill -INT $(ps -A | grep 'VRising' | awk '{print $1}')
  wait $!
}

setTimezone() {
  echo $TZ >/etc/timezone 2>&1
  ln -snf /usr/share/zoneinfo/$TZ /etc/localtime 2>&1
  dpkg-reconfigure -f noninteractive tzdata 2>&1
}

setUser() {
  if [ ! -z $UID ]; then
    usermod -u $UID docker 2>&1
  fi
  if [ ! -z $GID ]; then
    groupmod -g $GID docker 2>&1
  fi
}

updateSteam() {
  mkdir -p /root/.steam 2>/dev/null
  chmod -R 777 /root/.steam 2>/dev/null

  /usr/bin/steamcmd +@sSteamCmdForcePlatformType windows +force_install_dir "$s" +login anonymous +app_update 1829350 validate +quit
}

removeX0Lock() {
  if [ -f /tmp/.X0-lock ]; then
    echo "Removing /tmp/.X0-lock"
    rm /tmp/.X0-lock
  fi
}

setTimezone
setUser
updateSteam

removeX0Lock

trap onExit INT TERM KILL

Xvfb :0 -screen 0 1024x768x16 &
setsid './launch_server.sh' &

echo $!
wait $!
