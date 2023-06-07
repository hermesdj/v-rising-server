import path from "path";
import url from "url";
import fs from "fs";
import {mkdirp} from "mkdirp";
import {EventEmitter} from "events";
import {pipeline} from "node:stream/promises";
import {logger} from "../../logger.js";
import axios from "axios";
import {extractFilePathsFromZip, extractFileToDirectory} from "../utils.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export class BepinexManager extends EventEmitter {
    constructor(config) {
        super();
        this.reloadConfig(config);
    }

    reloadConfig({url, defaultPlugins}) {
        this.downloadUrl = url;
        this.defaultPlugins = defaultPlugins;
    }

    async init() {
        if (!fs.existsSync(this.downloadDir)) {
            logger.info('Creating download directory %s', this.downloadDir);
            await mkdirp(this.downloadDir);
        }

        if (!this.isDownloaded) {
            await this.downloadArchive();
        }
    }

    async downloadArchive() {
        const destDir = path.join(this.downloadDir);

        if (!fs.existsSync(destDir)) {
            await mkdirp(destDir);
        }

        if (!this.isZip) {
            throw new Error(`Bepinex archive must be a zip file`);
        }

        const destination = path.join(destDir, this.downloadBepinexFileName);

        logger.debug('Downloading bepinex from %s', this.downloadUrl);

        const res = await axios.get(this.downloadUrl, {
            responseType: 'stream',
            onDownloadProgress(progressEvent) {
                logger.info('Bepinex Archive download progress: %s', Number(progressEvent.progress).toLocaleString(undefined, {
                    style: 'percent', minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }))
            },
            decompress: false
        });

        const downloadStream = res.data;

        const writeStream = fs.createWriteStream(destination);

        try {
            await pipeline(downloadStream, writeStream);
            logger.debug('Downloaded bepinex zip file to %s', destination);
        } catch (err) {
            fs.unlinkSync(destination);
            throw err;
        }
    }

    async downloadPlugin(url, destDir) {
        const dllName = path.basename(url);
        const destination = path.join(destDir, dllName);
        logger.debug('Downloading plugin %s', dllName);

        const res = await axios.get(url, {
            responseType: "stream",
            onDownloadProgress(progressEvent) {
                logger.debug('Plugin %s download progress: %s', dllName, Number(progressEvent.progress).toLocaleString(undefined, {
                    style: 'percent', minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }));
            }
        });

        const downloadStream = res.data;

        try {
            const writeStream = fs.createWriteStream(destination);
            await pipeline(downloadStream, writeStream);
            logger.debug('Downloaded plugin %s', dllName);
        } catch (err) {
            fs.unlinkSync(destination);
            throw err;
        }
    }

    checkArchivePath() {
        const filePath = path.join(this.downloadDir, this.downloadBepinexFileName);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Archive does not exists at path ${filePath}`);
        }
        return filePath;
    }

    async install(destPath) {
        await this.decompressArchive(destPath);
        await this.checkConfigFile(destPath);
        await this.checkDefaultPlugins(destPath);
    }

    async checkConfigFile(destPath) {
        const configDir = path.join(destPath, 'BepInEx', 'config');
        const filePath = path.join(configDir, 'BepInEx.cfg');
        const defaultFilePath = path.join(__dirname, '..', '..', '..', 'settings', 'BepInEx.cfg')

        if (!fs.existsSync(filePath)) {
            logger.debug('BepInEx config file doest not exists, creating it');
            await mkdirp(configDir);
            await pipeline(fs.createReadStream(defaultFilePath), fs.createWriteStream(filePath));
            logger.debug('Copied config from default settings directory to config directory in BepInEx folder');
        }
    }

    async checkDefaultPlugins(destPath) {
        if (!this.defaultPlugins || !Array.isArray(this.defaultPlugins) || this.defaultPlugins.length === 0) {
            logger.info('No default plugin configured');
            return;
        }
        const pluginDir = path.join(destPath, 'BepInEx', 'plugins');

        if (!fs.existsSync(pluginDir)) {
            await mkdirp(pluginDir);
        }

        for (const {url} of this.defaultPlugins) {
            const dllName = path.basename(url);
            const dllPath = path.join(pluginDir, dllName);

            if (!fs.existsSync(dllPath)) {
                logger.debug('Default plugin %s not installed !', dllName);
                await this.downloadPlugin(url, pluginDir);
            } else {
                logger.debug('Default plugin %s already installed', dllName);
            }
        }
    }

    async decompressArchive(destPath) {
        return extractFileToDirectory(this.checkArchivePath(), destPath);
    }

    async checkIsInstalled(destPath) {
        const files = await extractFilePathsFromZip(this.checkArchivePath());
        let isInstalled = true;

        for (const file of files) {
            isInstalled &= fs.existsSync(path.join(destPath, file));

            if (!isInstalled) {
                break;
            }
        }

        return isInstalled;
    }

    isModInstalled(destPath, dllName){
        const pluginDir = path.join(destPath, 'BepInEx', 'plugins');
        return fs.existsSync(path.join(pluginDir, dllName));
    }

    // DYNAMIC GETTERS
    get baseDir() {
        return path.resolve(path.join(__dirname, '..', '..', '..', 'data', 'bepinex'));
    }

    get downloadDir() {
        return path.join(this.baseDir, 'download');
    }

    get downloadBepinexFileName() {
        return path.basename(this.downloadUrl);
    }

    get isZip() {
        return path.extname(this.downloadBepinexFileName) === '.zip';
    }

    get isDownloaded() {
        return fs.existsSync(path.join(this.downloadDir, this.downloadBepinexFileName));
    }
}
