import fs from "fs";

export const waitForFile = async (filePath, timeout) => {
    let totalTime = 0;
    let checkTime = timeout / 10;

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
