# v-rising-server

V Rising Server with API

TODO :

- Regarder l'API dans ServerHostSettings.json
- Observer les fichiers banlist et adminlist car ils sont modifiés par le serveur
- Revoir le code de connexion/déconnexion d'un joueur
- Refaire l'affichage de log : https://github.com/FEMessage/log-viewer
- Capturer les logs de SteamCMD, du serveur.exe, de l'API du serveur (métriques ? console ?) et de l'API et regrouper le tout proprement
- Parser les métriques du serveur prometheus : https://www.npmjs.com/package/parse-prometheus-text-format
- BOT DISCORD : Ajouter le nom du serveur dans les messages envoyés
- Regarder les GameSettings : https://cdn.stunlock.com/blog/2022/05/25083113/Game-Server-Settings.pdf

HttpService - Initializing!
HttpService - Adding Routes
HttpService - Added Route GET ^/metrics/?$
HttpService - Added Route GET ^/console/v1
HttpService - Added Route POST ^/api/message/v1$
HttpService - Added Route POST ^/api/shutdown/v1$
HttpService - Added Route POST ^/api/save/v1$
HttpService - Receive Thread started.
