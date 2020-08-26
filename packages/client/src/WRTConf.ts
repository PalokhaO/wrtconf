import { Serializable } from '@wrtconf/models';
import { Subject } from 'rxjs';
import { WRTConfSignalling } from './WRTConfSignalling';
import { WRTConfSocket } from './WRTConfSocket';

export class WRTConf {
    message$ = new Subject<any>();

    constructor(private url: string, options: Partial<WRTConfOptions> = {}) {
        const socket = new WRTConfSocket(url, options.meta);
        const signalling = new WRTConfSignalling(socket.message$);
        signalling.message$.subscribe(m => socket.send(m));
    }
}

interface WRTConfOptions {
    meta?: Serializable;
}