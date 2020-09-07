import { Serializable, StreamConstraints } from '@wrtconf/models';
import { EventEmitter } from './EventEmitter';
import { SocketConnection } from './SocketConnection';
import { WebRTCConnection, WRTConfEvents, WRTConfSignallingParams } from './WebRTCConnection';
import { WebRTCPeer } from './WebRTCPeer';

export class WRTConf extends EventEmitter<WRTConfEvents>{
    private webRTCConnection: WebRTCConnection;
    private socketConnection: SocketConnection;
    public get peers(): WebRTCPeer[] {
        return this.webRTCConnection.peers;
    }

    constructor(private url: string, params: WRTConfParams = {}) {
        super();
        this.socketConnection = new SocketConnection(url, params.meta);
        this.webRTCConnection = new WebRTCConnection(params);
        this.webRTCConnection.addEventListener('peer', e => this.emit(e));
        this.webRTCConnection.addEventListener('removepeer', e => this.emit(e));
        this.webRTCConnection.message$.subscribe(m => this.socketConnection.send(m));
        this.socketConnection.message$.subscribe(m => this.webRTCConnection.handleMessage(m));
        this.socketConnection.connect$.subscribe(() => this.webRTCConnection.resetConnectionStatus());
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
