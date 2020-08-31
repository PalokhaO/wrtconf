import { Serializable } from '@wrtconf/models';
import { Observable } from 'rxjs';
import { Peer, WebRTCConnection, WRTConfSignallingParams } from './WebRTCConnection';
import { SocketConnection } from './SocketConnection';

export class WRTConf {
    private signalling: WebRTCConnection;
    peers$: Observable<Peer[]>;

    constructor(private url: string, params: WRTConfParams = {}) {
        const socket = new SocketConnection(url, params.meta);
        this.signalling = new WebRTCConnection(socket.message$, params);
        this.signalling.message$.subscribe(m => socket.send(m));
        this.peers$ = this.signalling.peers$.asObservable();
    }
}

interface WRTConfParams extends WRTConfSignallingParams {
    meta?: Serializable;
}