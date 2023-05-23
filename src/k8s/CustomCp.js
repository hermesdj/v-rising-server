import * as k8s from "@kubernetes/client-node";
import {Cp} from "@kubernetes/client-node";
import {WritableStreamBuffer} from "stream-buffers";
import {pack} from "tar-stream";

export class CustomCp extends Cp {
    /**
     * Download a file from the pod
     * @param namespace
     * @param podName
     * @param containerName
     * @param srcPath
     * @returns {Promise<string>}
     */
    async cpFromPodToString(namespace, podName, containerName, srcPath) {
        return new Promise((resolve, reject) => {
            const command = ["cat", srcPath];
            const writerStream = new WritableStreamBuffer();
            const errStream = new WritableStreamBuffer();
            this.execInstance.exec(
                namespace,
                podName,
                containerName,
                command,
                writerStream,
                errStream,
                null,
                false,
                async ({status}) => {
                    if (status === "Failure" || errStream.size())
                        reject(`Error from cpFromPodToString - details: \n ${errStream.getContentsAsString()}`);
                    resolve(writerStream.getContentsAsString() || "");
                }
            );
        });
    }

    async cpStringToPod(
        namespace,
        podName,
        containerName,
        srcFiles,
        tgtPath
    ) {
        const readStream = pack();
        srcFiles.forEach((tarEntry) => {
            readStream.entry(...tarEntry);
        });
        readStream.finalize();

        const command = ["tar", "xf", "-", "-C", tgtPath];

        const errStream = new WritableStreamBuffer();
        const conn = await this.execInstance.exec(
            namespace,
            podName,
            containerName,
            command,
            null,
            errStream,
            readStream,
            false,
            async ({status}) => {
                // Does not reach here for unknown reasons
                if (status === "Failure" || errStream.size()) {
                    throw new Error(`Error from cpStringToPod - details: \n ${errStream.getContentsAsString()}`);
                }
            }
        );

        return new Promise((resolve) => {
            conn.onclose = (event) => {
                resolve();
            };
        });
    }
}

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const exec = new k8s.Exec(kc);

export const cp = new CustomCp(kc, exec);
