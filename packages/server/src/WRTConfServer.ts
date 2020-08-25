import { Server as HttpServer } from 'http';
import { SocketServer } from './SocketServer';

export class WRTConfServer {
    private socketServer: SocketServer;

    constructor(httpServer: HttpServer, path = '') {
        this.socketServer = new SocketServer(httpServer, path);
    }
}