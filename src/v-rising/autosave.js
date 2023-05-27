import {logger} from "../logger.js";
import path from "path";
import lodash from "lodash";
import fs from "fs";
import {mkdirp} from "mkdirp";
import {createGunzip, createGzip} from "node:zlib";
import {pipeline} from "node:stream";
import {EventEmitter} from "events";

export class AutoSaveManager extends EventEmitter {
    constructor(server) {
        super();
        this.server = server;
        this.server.on('auto_save', info => this.handleSaveBackup(info));
        this.server.on('loaded_save', info => this.handleSaveBackup(info));
    }

    _backupDir(config) {
        return path.resolve(config.server.dataPath, config.server.backupPath, config.server.saveName);
    }

    _saveDir(config) {
        return path.resolve(config.server.dataPath, 'Saves', 'v2', config.server.saveName);
    }

    async handleSaveBackup(info) {
        const {config, fileName, saveNumber, extension} = info;
        logger.info('Save %s loaded with extension %s', saveNumber, extension);
        const baseSaveDir = this._saveDir(config);
        const saveFilePath = path.join(baseSaveDir, `${fileName}${saveNumber}.${extension}`);
        const backupDir = this._backupDir(config);

        const isCompressed = extension === 'save.gz';

        if (!fs.existsSync(saveFilePath)) {
            logger.error('save file path does not exists : %s', saveFilePath);
            return;
        }

        await this.checkBackupDir(backupDir);

        const backupFilePath = path.resolve(backupDir, `${fileName}${saveNumber}.${!isCompressed && config.server.compressBackupSaves ? 'save.gz' : extension}`);
        try {
            const saved = await this.executeBackup(saveFilePath, backupFilePath, config, saveNumber);
            if (saved) {
                logger.info('Save %s has been backuped !', saveNumber);
                this.emit('backup', saveNumber);
            }

            await this.cleanupBackupDir(config);
        } catch (err) {
            logger.error('Error backuping save %s : %s', saveNumber, err.message);
            return false;
        }
    }

    async executeBackup(saveFilePath, backupFilePath, config, saveNumber) {
        return new Promise((resolve, reject) => {
            const extension = path.extname(saveFilePath);

            if (!fs.existsSync(backupFilePath)) {
                logger.info('The save file %s is not backup, creating a backup right now', saveNumber);
                if (extension === '.save.gz' || (extension === '.save' && !config.server.compressBackupSaves)) {
                    // Save is already compressed or backup should not be compressed
                    logger.info('Backuping save %s to %s not compressed', saveNumber, backupFilePath);
                    fs.copyFile(saveFilePath, backupFilePath, (err) => {
                        if (err) return reject(err);
                        logger.info('Save %s has been backuped !', saveNumber);
                        resolve(true);
                    });
                } else if (extension === '.save' && config.server.compressBackupSaves) {
                    const gzip = createGzip();
                    const source = fs.createReadStream(saveFilePath);
                    const destination = fs.createWriteStream(backupFilePath);

                    logger.info('Compressing backup for %s to %s', saveNumber, backupFilePath);
                    pipeline(source, gzip, destination, (err) => {
                        if (err) return reject(err);
                        resolve(true);
                    });
                } else {
                    logger.warn('Unknown file extension %s !', extension);
                    reject(new Error('Unknown file extension ' + extension));
                }
            } else {
                logger.debug('Backup of save %s already exists', saveNumber);
                resolve(false);
            }
        });
    }

    async checkBackupDir(path) {
        if (!fs.existsSync(path)) {
            logger.info('Backup dir does not exists, creating it : %s', path);
            await mkdirp(path);
        }
    }

    async listBackedUpSaveNames(config) {
        return (await fs.promises.readdir(this._backupDir(config)));
    }

    async cleanupBackupDir(config) {
        const backupDir = this._backupDir(config);
        const fileNames = (await this.listBackedUpSaveNames(config));

        if (fileNames.length > config.server.backupCount) {
            const files = lodash.sortBy(fileNames.map(fileName => ({fileName, ...fs.statSync(path.join(backupDir, fileName))})), 'birthtime');
            const oldestSaves = lodash.take(files, files.length - config.server.backupCount);
            for (const {fileName} of oldestSaves) {
                logger.info('Deleting old backup file %s', fileName);
                await fs.promises.unlink(path.join(backupDir, fileName));
            }
        } else {
            logger.debug('No backup cleanup to do, only %d/%d backup files are present', fileNames.length, config.server.backupCount);
        }
    }

    async restoreBackup(config, fileName, compressSaveFiles, currentSaveNumber) {
        const backupDir = this._backupDir(config);
        const backupFilePath = path.join(backupDir, fileName);

        if (!fs.existsSync(backupFilePath)) {
            logger.warn('The backup file to restore no longer exists on the file system : %s', backupFilePath);
            return false;
        }

        const extension = compressSaveFiles ? '.save.gz' : '.save';
        const newSaveNumber = parseInt(currentSaveNumber) + 1;

        const saveDir = this._saveDir(config);
        const newSaveFileName = `AutoSave_${newSaveNumber}${extension}`;
        const saveFilePath = path.join(saveDir, newSaveFileName);

        logger.info('Restoring backup %s to %s', backupFilePath, saveFilePath);

        return new Promise((resolve, reject) => {
            // Handle Restore of the backup file
            if ((compressSaveFiles && config.server.compressBackupSaves) || (!compressSaveFiles && !config.server.compressBackupSaves)) {
                logger.info('Direct copy of files between Backup and Saves directories');
                fs.copyFile(backupFilePath, saveFilePath, (err) => {
                    if (err) return reject(err);
                    logger.info('Save %s has been restored !', fileName);
                    resolve(true);
                });
            } else {
                logger.info('Decompressing backup file and transferring to target directory');
                const gunzip = createGunzip();
                const source = fs.createReadStream(backupFilePath);
                const destination = fs.createWriteStream(saveFilePath);

                logger.info('Restoring backup for %s to %s', fileName, saveFilePath);
                pipeline(source, gunzip, destination, (err) => {
                    if (err) return reject(err);
                    resolve(true);
                });
            }
        });
    }
}
