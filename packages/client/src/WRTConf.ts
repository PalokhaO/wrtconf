import { Serializable } from '@wrtconf/models';
import { Observable } from 'rxjs';
import { Client, WRTConfSignalling, WRTConfSignallingParams } from './WRTConfSignalling';
import { WRTConfSocket } from './WRTConfSocket';

export class WRTConf {
    private signalling: WRTConfSignalling;
    clients$: Observable<Client[]>;

    constructor(private url: string, params: WRTConfParams = {}) {
        const socket = new WRTConfSocket(url, params.meta);
        this.signalling = new WRTConfSignalling(socket.message$, params);
        this.signalling.message$.subscribe(m => socket.send(m));
        this.clients$ = this.signalling.clients$.asObservable();
    }
}

interface WRTConfParams extends WRTConfSignallingParams {
    meta?: Serializable;
}