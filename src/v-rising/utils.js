import fs from "fs";
import unzipper from "unzipper";
import path from "path";
import {pipeline} from "node:stream/promises";
import {mkdirp} from "mkdirp";
import {logger} from "../logger.js";
import os from "os";
import {exec, spawn} from "child_process";

export async function waitForFile(filePath, timeout) {
    let totalTime = 0;
    let checkTime = 5000;

    return await new Promise((resolve) => {
        const timer = setInterval(() => {
            totalTime += checkTime;
            let fileExists = fs.existsSync(filePath);

            if (fileExists || totalTime >= timeout) {
                clearInterval(timer);
                resolve(fileExists);
            }
        }, checkTime)
    });
}

export async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function createUnzipper(filePath) {
    return {
        stream: fs.createReadStream(filePath)
            .pipe(unzipper.Parse({forceStream: true})),
        dirName: path.basename(filePath, path.extname(filePath))
    };
}

export async function extractFileToDirectory(filePath, outPath) {
    const zip = createUnzipper(filePath);
    const results = [];

    for await (const entry of zip.stream) {
        const out = path.resolve(outPath, entry.path.replace(zip.dirName + '/', ''));
        if (entry.type === 'File') {
            if (fs.existsSync(out)) {
                logger.debug('Removing existing file %s', out);
                fs.unlinkSync(out);
            }

            results.push(entry.path);
            logger.debug('Decompressing %s', out);
            await pipeline(entry, fs.createWriteStream(out));
        } else if (entry.type === 'Directory' && !fs.existsSync(out)) {
            logger.debug('creating directory %s', out);
            await mkdirp(out);
            entry.autodrain();
        }
    }

    return results;
}

export async function extractFilePathsFromZip(filePath) {
    const zip = createUnzipper(filePath);
    const results = [];

    for await (const entry of zip.stream) {
        const entryPath = entry.path.replace(zip.dirName, '');
        if (entry.type === 'File') {
            results.push(entryPath);
        }
        entry.autodrain();
    }

    return results;
}

export async function killAllSubProcesses(pid, signal) {
    if (os.platform() === 'win32') {
        return wrappedExecProcess(`taskkill /pid ${pid} /T /F`);
    } else if (os.platform() === 'linux') {
        const tree = {[pid]: []};
        const pidsToProcess = {[pid]: 1};

        return new Promise((resolve, reject) => {
            buildProcessTree(pid, tree, pidsToProcess, () => {
                killAll(tree, signal, (err, killed) => {
                    if (err) return reject(err);
                    resolve(killed);
                })
            });
        })
    } else {
        killPid(pid, signal);
    }
}

function killPid(pid, signal) {
    try {
        process.kill(parseInt(pid, 10), signal);
    } catch (err) {
        if (err.code !== 'ESRCH') throw err;
    }
}

function killAll(tree, signal, cb) {
    const killed = {};
    try {
        Object.keys(tree).forEach(pid => {
            tree[pid].forEach(pidpid => {
                if (!killed[pidpid]) {
                    killPid(pidpid, signal);
                    killed[pidpid] = 1;
                }
            });

            if (!killed[pid]) {
                killPid(pid, signal);
                killed[pid] = 1;
            }
        });
    } catch (err) {
        cb(err);
    }

    cb(null, killed);
}

function buildProcessTree(pid, tree, pidsToProcess, cb) {
    if (this.platform !== 'linux') return cb();
    const ps = spawn('ps', ['-o', 'pid', '--no-headers', '--ppid', pid]);
    let allData = '';
    ps.stdout.on('data', (data) => allData += data.toString('ascii'));

    let onClose = (code) => {
        delete pidsToProcess[pid];

        if (code !== 0) {
            if (Object.keys(pidsToProcess).length === 0) {
                cb();
            }
            return;
        }

        allData.match(/\d+/g).forEach(subPid => {
            subPid = parseInt(subPid, 10);
            if (!tree[pid]) tree[pid] = [];
            tree[pid].push(subPid);
            tree[subPid] = [];
            pidsToProcess[subPid] = 1;
            buildProcessTree(subPid, tree, pidsToProcess, cb);
        })
    };

    ps.on('close', onClose);
}

export async function wrappedExecProcess(command) {
    return new Promise((resolve, reject) => {
        exec(command, (err, stdout, stderr) => {
            if (err) {
                return reject(err);
            }
            resolve({stdout, stderr});
        });
    });
}
