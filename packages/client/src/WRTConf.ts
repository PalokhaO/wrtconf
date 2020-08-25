import { Serializable } from '@wrtconf/models';
import { Subject } from 'rxjs';
import { WRTConfSocket } from './WRTConfSocket';

export class WRTConf {
    message$ = new Subject<any>();

    constructor(private url: string, options: Partial<WRTConfOptions> = {}) {
        const socket = new WRTConfSocket(url, options.meta);
    }
}

interface WRTConfOptions {
    meta?: Serializable;
}