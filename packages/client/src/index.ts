import { Serializable, StreamConstraints } from '@wrtconf/models';
import { Observable } from 'rxjs';
import { WebRTCConnection, WRTConfSignallingParams } from './WebRTCConnection';
import { SocketConnection } from './SocketConnection';
import { WebRTCPeer } from './WebRTCPeer';

export class WRTConf {
    private webRTCConnection: WebRTCConnection;
    private socketConnection: SocketConnection;
    peers$: Observable<WebRTCPeer[]>;

    constructor(private url: string, params: WRTConfParams = {}) {
        this.socketConnection = new SocketConnection(url, params.meta);
        this.webRTCConnection = new WebRTCConnection(this.socketConnection.message$, params);
        this.webRTCConnection.message$.subscribe(m => this.socketConnection.send(m));
        this.peers$ = this.webRTCConnection.peers$.asObservable();
        this.socketConnection.connect$.subscribe();
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