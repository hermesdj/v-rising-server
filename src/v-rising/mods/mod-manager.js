import {ThunderstoreApiClient} from "./thunderstore-api-client.js";
import {EventEmitter} from "events";
import {BepInExManager} from "./bep-in-ex-manager.js";
import {logger} from "../../logger.js";
import {DbManager} from "../../db-manager.js";
import path from "path";
import fs from "fs";
import {mkdirp} from "mkdirp";

class VRisingModStore {
    constructor() {
        this.db = DbManager.createDb("mods-db", "mods");
    }

    addMod(id, mod) {
        return this.db.set(id, mod);
    }

    getMod(id) {
        return this.db.get(id);
    }

    hasMod(id) {
        return this.db.has(id);
    }

    listMods() {
        return this.db.all();
    }
}

export class VRisingModManager extends EventEmitter {
    constructor(server, config) {
        super();
        this.server = server;
        this.config = config.server;
        this.isEnabled = config.server.mods.enabled;
        this.api = new ThunderstoreApiClient(config.server.mods.thunderstore);
        this.bepinexManager = new BepInExManager(config.server.mods.bepinex);
        this.store = new VRisingModStore();

        this.updateConfig(config);

        this.server.on('config_updated', (config) => this.updateConfig(config));
    }

    updateConfig(config) {
        this.isEnabled = config.server.mods.enabled;
        this.config = config.server;
        this.defaultMods = config.server.mods.defaultMods;
        this.api.reloadConfig(config.server.mods.thunderstore);
        this.bepinexManager.reloadConfig(config.server.mods.bepinex);
    }

    async beforeStart() {
        if (!this.isEnabled) return;
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
        }

        await this.checkDefaultMods();

        logger.info('Mod Manager is ready !');
    }

    isModInstalledByDllName(dllName) {
        return this.bepinexManager.isModInstalled(this.config.serverPath, dllName);
    }

    isModInstalled(versionId) {
        const mod = this.store.getMod(versionId);
        return !!mod && this.bepinexManager.isModInstalled(this.config.serverPath, mod.dllName);
    }

    getMod(modId) {
        return this.api.getModByUuid(modId);
    }

    async installMod(modId, versionId) {
        if (this.isModInstalled(versionId)) {
            return;
        }
        const mod = await this.getMod(modId);
        const version = mod.versions.find(v => v.id === versionId);
        const dependencies = version.dependencies.filter(dep => !dep.startsWith('BepInEx-BepInExPack_V_Rising'));

        if (dependencies.length > 0) {
            // TODO find dependency and install if not installed
        }
    }

    async init() {
        if (!this.isEnabled) return;
        await this.bepinexManager.init();
    }

    listAllMods() {
        if (!this.isEnabled) return [];
        return this.api.fetchAllMods();
    }

    listAvailableMods() {
        if (!this.isEnabled) return [];
        return this.listAllMods()
            .then(mods => mods.filter(mod => !mod.is_deprecated))
            .then(mods => mods.sort((a, b) => a.rating_score > b.rating_score));
    }

    listInstalledMods() {
        if (!this.isEnabled) return [];
        return this.store.listMods();
    }

    getModInfo(id) {
        if (!this.isEnabled) return null;
        return this.api.getModByUuid(id);
    }

    async checkDefaultMods() {
        if (!this.defaultMods || !Array.isArray(this.defaultMods) || this.defaultMods.length === 0) {
            logger.info('No default plugin configured');
            return;
        }

        await this.bepinexManager.checkPluginDir(this.config.serverPath);
        const results = [];

        for (const {url} of this.defaultMods) {
            const {manifest, dlls} = await this.api.downloadMod({download_url: url, name: 'Default Mod'});
            if (!manifest) {
                logger.warn('No manifest found for url %s', url);
                continue;
            }


            for (const {name, buffer} of dlls) {
                const installed = await this.bepinexManager.installModDll(this.config.serverPath, name, buffer);
                results.push({
                    name,
                    installed,
                    manifest
                });
            }
        }

        if (results.length > 0) {
            const fullModList = await this.api.fetchAllMods();
            for (const {manifest: {name, version_number}, installed} of results) {
                let foundModVersion = null;
                for (const mod of fullModList) {
                    for (const version of mod.versions) {
                        if (version.name === name && version.version_number === version_number) {
                            foundModVersion = version;
                            break;
                        }
                    }

                    if (!!foundModVersion) {
                        break;
                    }
                }

                // TODO
            }
        }
    }
}
