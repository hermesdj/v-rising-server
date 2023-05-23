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

RUN npm install --production

EXPOSE 8080

RUN chmod +x ./start.sh
CMD ["pm2-runtime", "main.js"]
