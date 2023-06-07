import {ThunderstoreApiClient} from "./thunderstore-api-client.js";
import {EventEmitter} from "events";
import {BepinexManager} from "./bepinex-manager.js";
import {logger} from "../../logger.js";

export class VRisingModManager extends EventEmitter {
    constructor(server, config) {
        super();
        this.server = server;
        this.config = config.server;
        this.api = new ThunderstoreApiClient(config.server.mods.thunderstore);
        this.bepinexManager = new BepinexManager(config.server.mods.bepinex);

        this.server.on('config_updated', (config) => this.updateConfig(config));
    }

    updateConfig(config) {
        this.config = config.server;
        this.api.reloadConfig(config.server.mods.thunderstore);
        this.bepinexManager.reloadConfig(config.server.mods.bepinex);
    }

    async beforeStart() {
        if (!this.bepinexManager.isDownloaded) {
            logger.info('Downloading bepinex archive');
            await this.bepinexManager.downloadArchive();
        }

        const isInstalled = await this.bepinexManager.checkIsInstalled(this.config.serverPath);

        if (!isInstalled) {
            logger.info('Installing bepinex to path %s', this.config.serverPath);
            await this.bepinexManager.install(this.config.serverPath);
        } else {
            await this.bepinexManager.checkConfigFile(this.config.serverPath);
            await this.bepinexManager.checkDefaultPlugins(this.config.serverPath);
        }

        logger.info('Mod Manager is ready !');
    }

    isModInstalledByDllName(dllName) {
        return this.bepinexManager.isModInstalled(this.config.serverPath, dllName);
    }

    isModInstalled() {

    }

    async init() {
        await this.bepinexManager.init();
    }

    listAllMods() {
        return this.api.fetchAllMods();
    }

    listAvailableMods() {
        return this.listAllMods()
            .then(mods => mods.filter(mod => !mod.is_deprecated))
            .then(mods => mods.sort((a, b) => a.rating_score > b.rating_score));
    }

    listInstalledMods() {
        return [];
    }

    getModInfo(id) {
        return this.api.getModByUuid(id);
    }
}