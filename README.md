# Serveur V-Rising avec API

Serveur V Rising en conteneur docker avec API et application WEB (voir
projet [V Rising Server WEB Client](https://github.com/hermesdj/v-rising-client))

La configuration de ce conteneur a été basé sur le travail
de [TrueOsiris Docker VRising](https://github.com/TrueOsiris/docker-vrising)

## Installation

Le serveur VRising avec API est un serveur express basé sur le moteur nodejs. La version nodejs à installer doit être >=
18.12.0.

### Installation des dépendances

Une fois nodejs installé, lancez la commande suivante pour installer les dépendances.

```terminal
npm install
```

Pour démarrer l'API en mode dévelopement, vous pouvez lancer la commande

```terminal
npm run dev
```

Cette commande va lancer l'API et observer tout changement de fichiers

### Installation du client WEB

Pour le client web, vous devez cloner le projet [VRising Client](https://github.com/hermesdj/v-rising-client) dans un
dossier v-rising-client à côté de votre dossier v-rising-server

Suivez la procédure d'installation du client web pour installer les dépendances.

### Build de l'API avant lancement du conteneur docker

L'API sers les fichiers du client WEB depuis le dossier /public une fois déployé sur Docker. Il faut remplir ce dossier
avec le code compilé du client web avant de lancer le déploiement. Pour cela, il y a deux fichiers utiles :

Le fichier build.bat va dans le dossier du client, fais un build du projet, puis copie le contenu du dossier
v-rising-client/dist dans le dossier v-rising-server/public.
Ensuite il lance la commande npm run dev, ce qui démarre l'API en mode développement. Vous pouvez couper l'exécution à
ce moment là si besoin.

```terminal
cd ../v-rising-client
call npm run build
xcopy /s/e /y .\dist ..\v-rising-server\public
cd ../v-rising-server
npm run dev
```

Le fichier deploy.bat sers de déploiement sur l'environnement kubernetes, donc si vous n'utilisez pas kubernetes, ne le
lancez pas.

```terminal
cd ../v-rising-client
call npm run build
xcopy /s/e /y .\dist ..\v-rising-server\public
cd ../v-rising-server
skaffold delete
skaffold run
```

### Lancement du conteneur docker

Après avoir installé Docker Desktop for Windows par exemple, construire l'image avec la commande suivante

```terminal
docker build .
```

Une fois l'image construite, vous pouvez la lancer avec la commande suivante. Vous aurez besoin d'un fichier .env dans
le dossier du projet (cf chapitre sur la configuration)

```terminal
docker run -d --name='v-rising' --restart=unless-stopped --env-file .env \
-v '/path/on/host/server':'/mnt/vrising/server':'rw' \
-v '/path/on/host/persistentdata':'/mnt/vrising/persistentdata':'rw' \
-v '/path/on/host/apidata':'/usr/src/vrising-api/data':'rw' \
-v '/path/on/host/apiconfig':'/usr/src/vrising-api/config':'r' \
-v '/path/on/host/backups':'/mnt/vrising/backups':'rw' \
-p 9876:9876/udp \
-p 9877:9877/udp \
-p 80:8080 \
```

En utilisant docker-compose :

```
version: '3.3'
services:
  v-rising:
    container_name: v-rising-api
    image: hermesdj/v-rising-api
    build: ./
    network_mode: bridge
    environment:
      - TZ=Europe/Paris
      ...etc
    volumes:
      - './server:/mnt/vrising/server:rw'
      - './persistentdata:/mnt/vrising/persistentdata:rw'
      - './apidata:/usr/src/vrising-api/data:rw'
      - './apiconfig:/usr/src/vrising-api/config:r'
      - './backups:/mnt/vrising/backups:rw'
    ports:
      - '9876:9876/udp'
      - '9877:9877/udp'
      - '80:8080'
```

## Configuration du serveur

### Volumes

Le serveur a besoin de volumes pour persister les données entre plusieurs redémarrages

| Volume                                   | Container path              | Description                                                                                                                           |
|------------------------------------------|-----------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| Installation du serveur Steam            | /mnt/vrising/server         | Chemin où le serveur steam doit être enregistré                                                                                       |
| Données de sauvegarde du serveur VRising | /mnt/vrising/persistentdata | Chemin où les données de Settings et de Sauvegarde sont persistées                                                                    |
| Backup des sauvegardes                   | /mnt/vrising/backups        | Chemin où l'API va sauvegarder les backups des sauvegardes du serveur                                                                 |
| Données de sauvegarde de l'API           | /usr/src/vrising-api/data   | Chemin où l'API va stocker les données de session, les joueurs détéctés, etc.                                                         |
| Configuration de l'API                   | /usr/src/vrising-api/config | Lecture seule : utiliser ce volume pour monter un fichier config.yaml plutôt que passer par les variables d'environnement par exemple |

### Variables d'environnement

Les variables suivantes sont à définir soit dans le fichier de configuration config.yaml, soit peuvent être passées par
variable d'environnement.

Le fichier config.yaml est écrasé par les valeurs définies dans les variables d'environnement.

Consultez le fichier src/config.js pour voir comment les variables d'environnement viennent compléter ou remplacer les
valeurs du fichier config.yaml

#### Configuration de l'API Express NodeJS

| Variable                              | Default                                     | Description                                                                                                                                                            |
|---------------------------------------|---------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| API_PORT                              | 8080                                        | Port d'écoute de l'API nodejs                                                                                                                                          |
| API_AUTH_RETURN_URL                   | http://localhost:8080/api/auth/steam/return | URL de retour lors de l'authentification auprès de STEAM. Si vous hébergez votre serveur derrière un nom de domaine, il faut le renseigner içi à la place de localhost |
| API_AUTH_REALM                        | http://localhost:8080/                      | Realm utilisé pour l'authentification auprès de STEAM                                                                                                                  |
| API_AUTH_STEAM_API_KEY                | steam api key                               | La Clef API pour l'authentification des utilisateurs avec Steam                                                                                                        |
| API_SESSION_SECRET                    | changeit                                    | Le secret de session utilisé pour encoder le cookie de session. Modifier cette valeur est obligatoire !                                                                |
| API_SESSION_PARAMS_RESAVE             | false                                       | cf config de express-session paramètre resave                                                                                                                          |
| API_SESSION_PARAMS_SAVE_UNINITIALIZED | false                                       | cf config de express-session paramètre saveUninitialized                                                                                                               |
| API_SESSION_COOKIE_NAME               | v-rising-session.sid                        | Nom du cookie de session enregistré dans le navigateur du client web                                                                                                   |
| LOG_LEVEL                             | info                                        | Niveau des logs qui seront écris dans le fichier de log de l'API                                                                                                       |

#### Configuration du serveur V-Rising

| Variable                          | Default                                         | Description                                                                                                                                                                                                                                                                                                                                                         |
|-----------------------------------|-------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| V_RISING_SERVER_NAME              | V Rising Test Server                            | Nom du serveur V-Rising tel qu'il sera publié sur le listing du jeu                                                                                                                                                                                                                                                                                                 |
| V_RISING_SAVE_NAME                | world1                                          | Nom de la sauvegarde que le serveur va charger lors du démarrage. à modifier si vous voulez déployer votre propre sauvegarde sur le serveur. cf [Chapitre 'Charger une Sauvegarde'](#charger-une-sauvegarde)                                                                                                                                                        |
| V_RISING_PASSWORD                 | vide                                            | Le mot de passe à utiliser pour se connecter au serveur depuis le jeu. à utiliser si vous voulez un serveur privé !                                                                                                                                                                                                                                                 |
| V_RISING_RUN_ON_STARTUP           | Vrai                                            | Si l'API doit lancer le serveur dès qu'elle démarre. Passer à faux si vous préférez le lancer depuis le client WEB                                                                                                                                                                                                                                                  |
| V_RISING_TIMEZONE                 | Europe/Paris                                    | TimeZone utilisée pour configurer l'environnement d'exécution de linux. Ce paramètre est hérité du conteneur de TrueOsiris                                                                                                                                                                                                                                          |
| V_RISING_EXE_FILE_NAME            | VRisingServer.exe                               | Ce paramètre est utilisé en développement lors du lancement du serveur dans un environnement Windows. Il ne sers plus si le projet s'exécute sous linux                                                                                                                                                                                                             |
| V_RISING_SERVER_PATH              | /mnt/vrising/server                             | Paramètre utilisé pour l'installation du serveur. Ce paramètre doit pointer sur un volume persistant                                                                                                                                                                                                                                                                |
| V_RISING_DATA_PATH                | /mnt/vrising/persistentdata                     | Paramètre utilisé pour le lancement du serveur pour lui indiquer l'endroit où il doit stocker les données de Settings et de Saves. Doit pointer sur un volume persistant.                                                                                                                                                                                           |
| V_RISING_BACKUP_PATH              | /mnt/vrising/backups                            | Dossier utilisé par l'API pour enregistrer des copies des sauvegardes. Doit pointer sur un volume persistant pour ne pas perdre les données.                                                                                                                                                                                                                        |
| V_RISING_COMPRESS_BACKUPS         | true                                            | Détermine si l'API va comprimer les copies des sauvegardes. Utile pour conserver de la place. Ce paramètre est ignoré si les sauvegardes du jeu lui même sont déjà comprimées.                                                                                                                                                                                      |
| V_RISING_BACKUP_COUNT             | 5                                               | Le nombre de copies à conserver. Les plus anciennes sont supprimées à chaque fois qu'une nouvelle est ajoutée pour n'en conserver que le nombre déterminé par ce paramètre                                                                                                                                                                                          |
| V_RISING_LOG_FILE                 | /mnt/vrisings/persistentdata/VRising-Server.log | Le fichier de log où le serveur V Rising va écrire ses messages. L'API dépend de ce paramètre pour fonctionner correctement et détecter les changements                                                                                                                                                                                                             |
| V_RISING_GAME_PORT                | 9876                                            | Port d'écoute du jeu sur le conteneur. Assurez vous que le traffic UDP du réseau peu bien atteindre ce port                                                                                                                                                                                                                                                         |
| V_RISING_QUERY_PORT               | 9877                                            | Port d'écoute Steam du jeu sur le conteneur. Assurez vous que le traffic UDP du réseau peu bien atteindre ce port                                                                                                                                                                                                                                                   |
| V_RISING_DEFAULT_ADMIN_LIST       | vide                                            | Liste par défaut des admins du serveur. à remplir séparé par une virgule. Renseignez votre [ID Steam](https://help.steampowered.com/fr/faqs/view/2816-BE67-5B69-0FEC#:~:text=Rendez%2Dvous%20sur%20votre%20profil%20Steam.&text=Si%20vous%20n'avez%20jamais,%23%23%23%23%23%23.) si vous voulez pouvoir vous authentifier au client WEB et administrer le serveur ! |
| V_RISING_API_ENABLED              | true                                            | Détermine si l'API HTTP du serveur VRising est active                                                                                                                                                                                                                                                                                                               |
| V_RISING_API_BIND_ADDRESS         | *                                               | L'adresse IP à laquelle l'API du serveur V Rising va se lier                                                                                                                                                                                                                                                                                                        |
| V_RISING_API_BIND_PORT            | 9090                                            | Le port sur lequel le serveur V Rising va écouter pour les requêtes HTTP. Le système de métriques de l'API dépend de cette valeur pour récolter les données                                                                                                                                                                                                         |
| V_RISING_API_BASE_PATH            | /                                               | Le chemin de base à utiliser pour interroger l'API du serveur VRising                                                                                                                                                                                                                                                                                               |
| V_RISING_API_ACCESS_LIST          | vide                                            | La liste d'accès autorisé à interroger l'API. Pas de documentation sur le fonctionnement de ce paramètre.                                                                                                                                                                                                                                                           |
| V_RISING_API_PROMETHEUS_DELAY     | 30                                              | Le délai en secondes d'interrogation des métriques du serveur V Rising                                                                                                                                                                                                                                                                                              |
| V_RISING_API_METRICS_RETAIN_HOURS | 6                                               | Le nombre d'heures que l'API va garder en mémoire les métriques du serveur V Rising                                                                                                                                                                                                                                                                                 |
| RCON_ENABLED                      | Vrai                                            | RCon est un protocole de communication Steam permettant l'envoi de messages dans le serveur. Le serveur VRising supporte que deux commandes pour l'instant et elles sont utilisées par l'API pour notifier les joueurs d'un redémarrage imminent par exemple. Ce paramètre contrôle si RCon est activé                                                              |
| RCON_HOST                         | 127.0.0.1                                       | Le nom d'hôte/IP du serveur VRising. Ne pas modifier vu qu'il tourne sur le même serveur                                                                                                                                                                                                                                                                            |
| RCON_PORT                         | 25575                                           | Le port du service RCon auquel il faut se connecter. Ce paramètre est aussi passé à la configuration du serveur au premier démarrage afin qu'il écoute sur le même port                                                                                                                                                                                             |
| RCON_PASSWORD                     | changeit                                        | Le mot de passe utilisé pour sécuriser la connexion RCon                                                                                                                                                                                                                                                                                                            |

### Configuration du BOT discord

*Cette section est encore en cours de développement, les fonctionnalités du BOT sont encore très basique et j'aimerais
refactoriser cette partie du code bientôt*

Un bot discord peut envoyer des messages et répondre à des commandes. Pour cela, vous devez configurer les paramètres
discord suivants :

| Variable                   | Default    | Description                                                                                                                |
|----------------------------|------------|----------------------------------------------------------------------------------------------------------------------------|
| DISCORD_BOT_TOKEN          | token      | Le token d'accès de votre BOT discord                                                                                      |
| DISCORD_APP_ID             | app id     | L'ID d'application de votre BOT discord                                                                                    |
| DISCORD_PUBLIC_KEY         | public key | La clef publique de votre BOT discord                                                                                      |
| DISCORD_VRISING_CHANNEL_ID | channel id | L'ID du canal sur le serveur discord avec lequel le BOT doit interagir. Le bot ignorera les messages venant d'autre canaux |
| DISCORD_ROLE_ID            | role id    | l'ID de rôle que le BOT discord doit donner aux utilisateurs qui le veulent                                                |

## Charger une sauvegarde

Il est possible de charger une sauvegarde personnelle sur un serveur V-Rising. Pour cela, vous devez récupérer le
dossier de votre sauvegarde (par exemple sur un PC windows elle sera dans le dossier : %localappdata%low/Stunlock
Studios\VRising\Saves\v1)
et vous devez le déposer dans le dossier de sauvegarde du serveur. Par défaut ce dossier sera dans
/mnt/vrising/persistentdata/Saves/v2. Le nom du dossier correspond au nom de la sauvegarde qu'il faut modifier dans le
fichier ServerHostSettings.json.
Vous pouvez soit :

- Modifier settings/ServerHostSettings.json avant le premier démarrage du serveur. Ces valeurs ne sont plus prise en
  compte après la première initialisation.
- Modifier la variable d'environnement V_RISING_SAVE_NAME avant le premier démarrage du serveur. Idem, pas pris en
  compte une fois la première initialisation.
- Modifier directement le fichier ServerHostSettings.json dans le dossier /mnt/vrising/persistentdata/Settings, changer
  la valeur de SaveName, et redémarrer le conteneur docker
- Utiliser le client WEB pour modifier la configuration Host et lancer un redémarrage du serveur

## Déploiement Kubernetes

Le projet a été conçu pour être déployé sous la forme d'un POD kubernetes. Le dossier k8s contiens tous les descripteurs
d'objet kubernetes à déployer, et le fichier skaffold.yaml sers au déploiement.

Pour déployer sur kubernetes, installez [Skaffold](https://skaffold.dev/docs/install/)

Dans le fichier skaffold.yaml, changez les paramètres de contexte kubernetes pour qu'ils correspondent à votre cluster.
La configuration utilise pour le routage du réseau un reverse
proxy [Traefik](https://doc.traefik.io/traefik/getting-started/install-traefik/). Ce reverse proxy
utilise [Let's Encrypt](https://letsencrypt.org/fr/) pour gérer les certificats HTTPS du client WEB et utilise un
certResolver appelé jaysgaming. Il vous faudra changer le nom de ce cert resolver en prenant celui défini dans la config
de Traefik et le mettre dans le fichier k8s/api-ingressroute-secure.yaml.

Mon cluster utiliser aussi glusterfs pour l'attribution de volumes persistants dynamique. Il faudra que vous changiez le
storageClassName dans les fichiers PVC par celui que vous utilisez.

| Fichier K8S                       | Description                                                                                                                                                         |
|-----------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| api-deployment.yaml               | Déploiement du pod v-rising-api contenant le serveur VRising et l'API                                                                                               |
| api-env.yaml                      | Variables d'environnement en clair qui sont passées au conteneur VRising                                                                                            |
| api-ingressroute.yaml             | La route Traefik http non sécurisé par certificat qui est redirigée vers la route https                                                                             |
| api-ingressroute-secure.yaml      | La route Traefik https sécurisée qui utilise le certificat Let's Encrypt                                                                                            |
| api-redirect-http.yaml            | Middleware Traefik de redirection du traffic http vers https                                                                                                        |
| api-secrets.yaml                  | CE FICHIER N'EST PAS DANS LE REPO ! Contiens un secret kubernetes contenant les variables d'environnement chargées de données sensibles (token steam, discord, etc) |
| api-server-config.yaml            | fichier config.yaml monté dans le pod du serveur dans le dossier /usr/src/vrising-api/config pour charger la configuration de l'API                                 |
| api-service.yaml                  | Service permettant d'exposer le pod v-rising-api sur le réseau                                                                                                      |
| ingress-route-gameport.yaml       | Proxy Traefik UDP sur le port 9876/udp depuis le port 27015/udp sur le réseau (utilisé si le serveur est en mode ListOnSteam)                                       |
| ingress-route-queryport.yaml      | Proxy Traefik UDP sur le port 9877/udp depuis le port 27016/udp sur le réseau (utilisé si le serveur est en mode ListOnSteam)                                       |
| ingress-route-localgameport.yaml  | Proxy Traefik UDP sur le port 9876/udp depuis le port 9876/udp sur le réseau (utilisé pour les connexions directes avec SteamID en jeu)                             |
| ingress-route-localqueryport.yaml | Proxy Traefik UDP sur le port 9876/udp depuis le port 9877/udp sur le réseau (utilisé pour les connexions directes avec SteamID en jeu)                             |
| namespace.yaml                    | Définition du namespace v-rising sur le cluster                                                                                                                     |
| api-pvc-data.yaml                 | Stockage des données de l'API (session, joueurs détectés, etc.)                                                                                                     |
| pvc-backup.yaml                   | Stockage des copies de sauvegardes du serveur par l'API                                                                                                             |
| pvc-data.yaml                     | Stockage des données de sauvegarde et de configuration du serveur VRising                                                                                           |
| pvc-server.yaml                   | Stockage des données steam du serveur V Rising                                                                                                                      |
| role.yaml                         | Définition du rôle Kubernetes                                                                                                                                       |
| role-binding.yaml                 | Définition du lien Role/Compte Kubernetes                                                                                                                           |
| service-account.yaml              | Définition du compte de service kubernetes                                                                                                                          |

Le fichier deploy.bat ([Voir section build API](#build-de-lapi-avant-lancement-du-conteneur-docker)) permet de déployer
sur le cluster en utilisant skaffold.
Les fichiers PVC et secrets doivent être déployés séparément avant le lancement du déploiement skaffold.

### Reste à faire

- Exploiter les métriques du serveur à partir de l'api
- Observer les fichiers banlist et adminlist au cas où ils soient modifiés par le serveur
- Epingler le dernier Steam ID du serveur sur le discord lors de l'appel à la commande /v-server-info
- Push de l'image docker sur le registry docker principal
- Ajouter la possibilité d'uploader une nouvelle sauvegarde au serveur pour faciliter le déploiement initial et
  automatiquement configurer le serveur
- Ajouter la possibilité d'automatiquement wiper le serveur après le ResetDaysInterval en se basant sur le
  StartDate.json (tester avant ?)
- Bouton de check version de l'image docker et redémarrage automatique / planifié
- Possibilité de planifier des redémarrages périodiques par cron (utiliser cronstrue)
- Tester https://www.npmjs.com/package/steam-server-query pour exploiter le QueryPort et interroger le serveur !
- Exploiter les Remote URL pour les admins et les banned plutôt que par le fichier banned ou adminlist !
