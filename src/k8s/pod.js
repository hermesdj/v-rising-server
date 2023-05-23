import {client} from './k8s.js';
import {loadServerConfig} from "../config.js";

export const getVRisingPodName = async function () {
    const config = loadServerConfig();
    return client.listNamespacedPod(config.k8s.namespace).then(({body: {items}}) => {
        if (items.length > 0) {
            const pod = items.find(item => item.metadata.name.startsWith('v-rising-server-'));
            console.log('found pod', pod.metadata.name);
            return pod.metadata.name;
        } else {
            console.warn('No pod found in v-rising namespace !');
            throw new Error('No pod found !');
        }
    });
}
