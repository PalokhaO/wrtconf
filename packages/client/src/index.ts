import { Serializable, StreamConstraints } from '@wrtconf/models';
import { Observable } from 'rxjs';
import { WebRTCConnection, WRTConfSignallingParams } from './WebRTCConnection';
import { SocketConnection } from './SocketConnection';
import { WebRTCPeer } from './WebRTCPeer';

export class WRTConf {
    private webRTCConnection: WebRTCConnection;
    peers$: Observable<WebRTCPeer[]>;

    constructor(private url: string, params: WRTConfParams = {}) {
        const socket = new SocketConnection(url, params.meta);
        this.webRTCConnection = new WebRTCConnection(socket.message$, params);
        this.webRTCConnection.message$.subscribe(m => socket.send(m));
        this.peers$ = this.webRTCConnection.peers$.asObservable();
    }

    updateLocalStream(stream: MediaStream) {
        this.webRTCConnection.updateLocalStream(stream);
    }

    updateReceptionConstraints(constraints: StreamConstraints) {
        this.webRTCConnection.updateReceptionConstraints(constraints, true);
    }
}

interface WRTConfParams extends WRTConfSignallingParams {
    meta?: Serializable;
}