FROM ubuntu:22.04
LABEL maintainer="Jérémy Dallard"
VOLUME ["/mnt/vrising/server", "/mnt/vrising/persistentdata"]

ENV NODE_VERSION=18.12.0

ARG DEBIAN_FRONTEND="noninteractive"

RUN apt update -y && \
    apt-get upgrade -y && \
    apt-get install -y  apt-utils && \
    apt-get install -y  software-properties-common \
                        tzdata && \
    add-apt-repository multiverse && \
    dpkg --add-architecture i386 && \
    apt update -y && \
    apt-get upgrade -y

RUN apt install -y curl
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
ENV NVM_DIR=/root/.nvm
RUN . "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm use v${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm alias default v${NODE_VERSION}
ENV PATH="/root/.nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"
RUN node --version
RUN npm --version

RUN useradd -m steam && cd /home/steam && \
    echo steam steam/question select "I AGREE" | debconf-set-selections && \
    echo steam steam/license note '' | debconf-set-selections && \
    apt purge steam steamcmd && \
    apt install -y gdebi-core  \
                   libgl1-mesa-glx:i386 \
                   wget && \
    apt install -y steam \
                   steamcmd && \
    ln -s /usr/games/steamcmd /usr/bin/steamcmd
#RUN apt install -y mono-complete
RUN apt install -y wine
RUN apt install -y xserver-xorg \
                   xvfb
RUN rm -rf /var/lib/apt/lists/* && \
    apt clean && \
    apt autoremove -y

RUN npm install pm2 -g

WORKDIR /usr/src/vrising-api

COPY src src/
COPY main.js .
COPY package*.json .
COPY start.sh .
COPY launch_server.sh .
COPY stop_server.sh .
COPY settings settings/
COPY public public/
RUN mkdir data
RUN mkdir logs

ENV V_RISING_MAX_HEALTH_MOD=1.0
ENV V_RISING_MAX_HEALTH_GLOBAL_MOD=1.0
ENV V_RISING_RESOURCE_YIELD_MOD=1.0

ENV V_RISING_DAY_DURATION_SECONDS=1080.0
ENV V_RISING_DAY_START_HOUR=9
ENV V_RISING_DAY_END_HOUR=17

ENV V_RISING_TOMB_LIMIT=12
ENV V_RISING_NEST_LIMIT=4

ENV V_RISING_SAVE_NAME="world1"

ENV V_RISING_MAX_USER=50
ENV V_RISING_MAX_ADMIN=4
ENV V_RISING_DESC=""
ENV V_RISING_PASSWORD=""
ENV V_RISING_CLAN_SIZE=10
ENV V_RISING_PORT=9876
ENV V_RISING_QUERY_PORT=9877
ENV V_RISING_PUBLIC_LIST=true

ENV V_RISING_SETTING_PRESET=""
ENV V_RISING_DEATH_CONTAINER_PERMISSIONS="ClanMembers"
ENV V_RISING_GAME_MODE="PvE"

RUN npm install --production

EXPOSE 8080

RUN chmod +x ./start.sh
RUN chmod +x ./launch_server.sh
RUN chmod +x ./stop_server.sh
CMD ["pm2-runtime", "main.js"]
