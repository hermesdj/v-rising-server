import {EventEmitter} from "events";
import lodash from "lodash";

export class LogParser extends EventEmitter {
    constructor(regexpArray = []) {
        super();
        this.regexpArray = regexpArray;
    }

    parseLogLine(line) {
        let matched = false;
        for (const {regex, parse} of this.regexpArray) {
            const matches = regex.exec(line);
            if (matches && matches.length > 0 && lodash.isFunction(parse)) {
                parse(matches, line);
                regex.lastIndex = 0;
                matched = true;
                break;
            }
            regex.lastIndex = 0;
        }

        return matched;
    }
}
