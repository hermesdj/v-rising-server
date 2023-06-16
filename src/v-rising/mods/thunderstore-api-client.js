import axios from "axios";
import {downloadFileStream} from "../utils.js";
import unzipper from "unzipper";
import path from "path";
import {logger} from "../../logger.js";

export class ThunderstoreApiClient {
    constructor(config) {
        this.reloadConfig(config);
    }

    reloadConfig(config) {
        this.baseURL = config.url;
        this.client = axios.create({
            baseURL: this.baseURL
        })
    }

    async fetchAllMods() {
        const {data} = await this.client.get('/package/');
        return data;
    }

    async getModByUuid(id) {
        const {data} = await this.client.get(`/packages/${id}/`);
        return data;
    }

    async downloadMod(modVersion) {
        const downloadStream = await downloadFileStream(modVersion.name, modVersion.download_url);

        const result = {
            manifest: null,
            dlls: []
        };

        for await (const entry of downloadStream.pipe(unzipper.Parse({forceStream: true}))) {
            logger.debug('Entry is of type %s and with path %s', entry.type, entry.path);
            if (entry.type === 'File') {
                if (entry.path === 'manifest.json') {
                    const content = await entry.buffer();
                    result.manifest = JSON.parse(content);
                } else if (path.extname(entry.path) === '.dll') {
                    result.dlls.push({
                        name: entry.path,
                        buffer: await entry.buffer()
                    });
                } else {
                    entry.autodrain();
                }
            } else {
                entry.autodrain();
            }
        }

        logger.info('Parsed manifest with name %s, %d dlls and content %j', result.manifest ? result.manifest.name : null, result.dlls.length, result.manifest);

        return result;
    }
}
