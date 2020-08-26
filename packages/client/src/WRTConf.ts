import { Serializable } from '@wrtconf/models';
import { Subject } from 'rxjs';
import { WRTConfSignalling } from './WRTConfSignalling';
import { WRTConfSocket } from './WRTConfSocket';

export class WRTConf {
    signalling: WRTConfSignalling;
    message$ = new Subject<any>();

    constructor(private url: string, private stream: MediaStream, options: Partial<WRTConfOptions> = {}) {
        const socket = new WRTConfSocket(url, options.meta);
        this.signalling = new WRTConfSignalling(socket.message$, stream);
        this.signalling.message$.subscribe(m => socket.send(m));
    }
}

interface WRTConfOptions {
    meta?: Serializable;
}