import path from "path";
import url from "url";
import fs from "fs";
import {mkdirp} from "mkdirp";
import {EventEmitter} from "events";
import {pipeline} from "node:stream/promises";
import {Readable} from "node:stream";
import {logger} from "../../logger.js";
import {downloadFileStream, extractFilePathsFromZip, extractFileToDirectory} from "../utils.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export class BepInExManager extends EventEmitter {
    constructor(config) {
        super();
        this.reloadConfig(config);
        this.logWatcher = new BepInExLogWatcher();
    }

    reloadConfig({url}) {
        this.downloadUrl = url;
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

        const downloadStream = await downloadFileStream('BepInEx', this.downloadUrl);

        const writeStream = fs.createWriteStream(destination);

        try {
            await pipeline(downloadStream, writeStream);
            logger.debug('Downloaded bepinex zip file to %s', destination);
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
    }

    async checkConfigFile(destPath) {
        const configDir = path.join(destPath, 'BepInEx', 'config');
        const filePath = path.join(configDir, 'BepInEx.cfg');
        const defaultFilePath = path.join(__dirname, '..', '..', '..', 'settings', 'BepInEx.cfg')

        if (!fs.existsSync(configDir)) {
            logger.debug('BepInEx config file doest not exists, creating it');
            await mkdirp(configDir);
        }

        await pipeline(fs.createReadStream(defaultFilePath), fs.createWriteStream(filePath));
        logger.debug('Copied config from default settings directory to config directory in BepInEx folder');
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

    getPluginDir(destPath) {
        return path.join(destPath, 'BepInEx', 'plugins');
    }

    isModInstalled(destPath, dllName) {
        const pluginDir = this.getPluginDir(destPath);
        return fs.existsSync(path.join(pluginDir, dllName));
    }

    async installModDll(destPath, dllName, dllBuffer) {
        if (this.isModInstalled(destPath, dllName)) return true;
        if (!dllBuffer || !Buffer.isBuffer(dllBuffer)) {
            logger.error('%s Dll is not a buffer', dllName);
            return false;
        }

        try {
            const stream = Readable.from(dllBuffer);
            await pipeline(stream, fs.createWriteStream(path.join(destPath, dllName)));
            return true;
        } catch (e) {
            logger.error('Dll writing error : %s', e.message);
            return false;
        }
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

    async checkPluginDir(serverPath) {
        const pluginDir = this.getPluginDir(serverPath);

        if (!fs.existsSync(pluginDir)) {
            await mkdirp(pluginDir);
        }
    }
}

class BepInExLogWatcher {

}
