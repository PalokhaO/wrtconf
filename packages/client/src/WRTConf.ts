import { Serializable } from '@wrtconf/models';
import { Observable } from 'rxjs';
import { Client, WRTConfSignalling } from './WRTConfSignalling';
import { WRTConfSocket } from './WRTConfSocket';

export class WRTConf {
    private signalling: WRTConfSignalling;
    clients$: Observable<Client[]>;

    constructor(private url: string, private stream: MediaStream, options: Partial<WRTConfOptions> = {}) {
        const socket = new WRTConfSocket(url, options.meta);
        this.signalling = new WRTConfSignalling(socket.message$, stream);
        this.signalling.message$.subscribe(m => socket.send(m));
        this.clients$ = this.signalling.clients$.asObservable();
    }
}

interface WRTConfOptions {
    meta?: Serializable;
}