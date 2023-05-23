import {getVRisingPodName} from "../k8s/pod.js";
import {cp} from "../k8s/CustomCp.js";
import url from "url";
import * as path from "path";
import {loadServerConfig} from "../config.js";

const __dirname = url.fileURLToPath(import.meta.url);
export const backupVRisingSave = async function () {
    const podName = await getVRisingPodName();
    console.log('copy server config');

    const config = loadServerConfig();

    return await cp.cpFromPod(
        config.k8s.namespace,
        podName,
        config.k8s.containerName,
        `mnt/vrising/persistentdata/Saves/v2/${config.server.saveName}`,
        path.resolve(__dirname, '..', '..', 'backup')
    );
}
