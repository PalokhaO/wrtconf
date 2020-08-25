import { Server as HttpServer } from 'http';
import { SignallingServer } from './SignallingServer';
import { SocketServer } from './SocketServer';

export class WRTConfServer {
    private socketServer: SocketServer;
    private signallingServer: SignallingServer;

    constructor(httpServer: HttpServer, path = '') {
        this.socketServer = new SocketServer(httpServer, path);
        this.signallingServer = new SignallingServer(this.socketServer.connections$);
    }
}