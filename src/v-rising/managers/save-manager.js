import {logger} from "../../logger.js";
import path from "path";
import lodash from "lodash";
import fs from "fs";
import {mkdirp} from "mkdirp";
import {createGunzip, createGzip} from "node:zlib";
import {pipeline} from "node:stream/promises";
import {EventEmitter} from "events";
import {waitForFile} from "../utils.js";
import dayjs from "dayjs";

export class VRisingSaveManager extends EventEmitter {
    constructor(config, server, settingsManager) {
        super();
        this.server = server;
        this.settingsManager = settingsManager;

        this.fileName = 'AutoSave';
        this.saveDir = 'Saves';
        this.saveVersion = 'v2';

        this.startDateFileName = 'StartDate.json';

        this.compressBackupSaves = true;
        this.backupCount = 5;
        this.saveName = config.server.saveName;

        this.updateConfig(config);

        this.settingsManager.on('applied_host_settings', (hostSettings) => this.updateFromHostSettings(hostSettings));

        this.server.on('config_updated', (config) => this.updateConfig(config));
        this.server.on('auto_save', info => this.handleSaveBackup(info));
        this.server.on('loaded_save', info => this.handleSaveBackup(info));
        this.server.on('ready', () => this.loadSaveInfo());
    }

    loadSaveInfo() {
        const startDateFilePath = path.join(this._saveDir(), this.startDateFileName);
        if (fs.existsSync(startDateFilePath)) {
            logger.info('Reading StartDate of current save');
            const content = fs.readFileSync(startDateFilePath, 'utf8');
            try {
                const startDate = dayjs(content, 'MM/DD/YYYY').toDate();
                logger.info('Start date of the current save is %s', startDate);
                this.emit('parsed_start_date', startDate);
            } catch (err) {
                logger.error('Error reading start date of server: %s', err.message);
            }
        }
    }

    updateFromHostSettings(hostSettings) {
        this.saveName = hostSettings.SaveName;
        logger.info('Updated autosave manager with save name %s', this.saveName);
    }

    updateConfig(config) {
        this.compressBackupSaves = config.server.compressBackupSaves;
        this.backupCount = config.server.backupCount;
        this.backupPath = config.server.backupPath;
        this.dataPath = config.server.dataPath;

        logger.debug('Updated autosave config with compressBackupSaves %s, backupCount %d', this.compressBackupSaves, this.backupCount);
    }

    _backupDir() {
        return path.resolve(this.backupPath, this.saveVersion, this.saveName);
    }

    _saveDir() {
        return path.resolve(this.dataPath, this.saveDir, this.saveVersion, this.saveName);
    }

    async handleSaveBackup(info) {
        const {saveNumber, extension} = info;

        logger.info('Save %s loaded with extension %s', saveNumber, extension);

        const baseSaveDir = this._saveDir();
        const saveFilePath = path.join(baseSaveDir, `${this.fileName}_${saveNumber}.${extension}`);
        const backupDir = this._backupDir();

        const isCompressed = extension === 'save.gz';

        logger.debug('Checking save file path with saveName', this.saveName);
        const fileExists = await waitForFile(saveFilePath, 30000);

        if (!fileExists) {
            logger.error('save file path does not exists : %s', saveFilePath);
            return;
        }

        await this.checkBackupDir(backupDir);

        const backupFilePath = path.resolve(backupDir, `${this.fileName}_${saveNumber}.${!isCompressed && this.compressBackupSavesaves ? 'save.gz' : extension}`);
        try {
            const saved = await this.executeBackup(saveFilePath, backupFilePath, saveNumber);
            if (saved) {
                logger.info('Save %s has been backuped !', saveNumber);
                this.emit('backup', saveNumber);
            }

            await this.cleanupBackupDir();
        } catch (err) {
            logger.error('Error backuping save %s : %s', saveNumber, err.message);
            return false;
        }
    }

    async executeBackup(saveFilePath, backupFilePath, saveNumber) {
        const extension = path.extname(saveFilePath);

        if (!fs.existsSync(backupFilePath)) {

            logger.info('The save file %s is not backup, creating a backup right now', saveNumber);

            if (extension === '.save.gz' || (extension === '.save' && !this.compressBackupSaves)) {
                // Save is already compressed or backup should not be compressed
                logger.info('Backuping save %s to %s not compressed', saveNumber, backupFilePath);
                await fs.promises.copyFile(saveFilePath, backupFilePath);
                return true;
            } else if (extension === '.save' && this.compressBackupSaves) {
                const gzip = createGzip();
                const source = fs.createReadStream(saveFilePath);
                const destination = fs.createWriteStream(backupFilePath);

                logger.info('Compressing backup for %s to %s', saveNumber, backupFilePath);

                await pipeline(source, gzip, destination);
                return true;
            } else {
                logger.warn('Unknown file extension %s !', extension);
                throw new Error('Unknown file extension ' + extension);
            }

        } else {
            logger.debug('Backup of save %s already exists', saveNumber);
            return false;
        }
    }

    async checkBackupDir(path) {
        if (!fs.existsSync(path)) {
            logger.info('Backup dir does not exists, creating it : %s', path);
            await mkdirp(path);
        }
    }

    async listBackedUpSaveNames() {
        return (await fs.promises.readdir(this._backupDir()));
    }

    async cleanupBackupDir() {
        const backupDir = this._backupDir();
        const fileNames = (await this.listBackedUpSaveNames());

        if (fileNames.length > this.backupCount) {
            const files = lodash.sortBy(fileNames.map(fileName => ({fileName, ...fs.statSync(path.join(backupDir, fileName))})), 'birthtime');
            const oldestSaves = lodash.take(files, files.length - this.backupCount);
            for (const {fileName} of oldestSaves) {
                logger.info('Deleting old backup file %s', fileName);
                await fs.promises.unlink(path.join(backupDir, fileName));
            }
        } else {
            logger.debug('No backup cleanup to do, only %d/%d backup files are present', fileNames.length, this.backupCount);
        }
    }

    async restoreBackup(fileName, compressSaveFiles, currentSaveNumber) {
        const backupDir = this._backupDir();
        const backupFilePath = path.join(backupDir, fileName);

        if (!fs.existsSync(backupFilePath)) {
            logger.warn('The backup file to restore no longer exists on the file system : %s', backupFilePath);
            return false;
        }

        const extension = compressSaveFiles ? '.save.gz' : '.save';
        const newSaveNumber = parseInt(currentSaveNumber) + 1;

        const saveDir = this._saveDir();
        const newSaveFileName = `AutoSave_${newSaveNumber}${extension}`;
        const saveFilePath = path.join(saveDir, newSaveFileName);

        logger.info('Restoring backup %s to %s', backupFilePath, saveFilePath);

        if ((compressSaveFiles && this.compressBackupSaves) || (!compressSaveFiles && !this.compressBackupSaves)) {
            logger.info('Direct copy of files between Backup and Saves directories');
            await fs.promises.copyFile(backupFilePath, saveFilePath);
            return true;
        } else {
            logger.info('Decompressing backup file and transferring to target directory');
            const gunzip = createGunzip();
            const source = fs.createReadStream(backupFilePath);
            const destination = fs.createWriteStream(saveFilePath);

            logger.info('Restoring backup for %s to %s', fileName, saveFilePath);
            await pipeline(source, gunzip, destination);
            return true;
        }
    }
}
