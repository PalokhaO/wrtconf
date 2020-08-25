import { Server as HttpServer } from 'http';
import { Server as WebsocketServer } from 'ws';
import WebSocket from 'ws';
import { fromEvent, merge, Observable, throwError } from 'rxjs';
import { debounceTime, filter, first, map, share, shareReplay, startWith, switchMap, takeUntil } from 'rxjs/operators';
import { ClientMessage, ServerMessage } from '../../models';
import { v4 } from 'uuid';

export class SocketServer {
    private wsServer: WebsocketServer;
    private connections: Connection[] = [];

    constructor(private httpServer: HttpServer, private path = '') {
        this.wsServer = new WebsocketServer({
            path,
            server: httpServer,
        });
        this.wsServer.on('connection', ws => this.handleConnection(ws));
    }

    private handleConnection(socket: WebSocket) {
        this.keepAlive(socket);

        const closed$ = fromEvent(socket, 'close').pipe(
            first(),
            shareReplay(1),
        );
        const error$ = fromEvent(socket, 'error').pipe(
            switchMap(() => throwError(new Error('WebSocket connection error'))),
            takeUntil(closed$),
            share(),
        );
        
        
        const message$ = fromEvent<MessageEvent>(socket, 'message').pipe(
            map(e => e.data),
            filter(m => m && m !== 'ping'),
            map(m => JSON.parse(m)),
            source => merge(source, error$),
            takeUntil(closed$),
            share(),
        );

        const connection = {
            id: v4(),
            socket,
            message$,
            send: message => socket.send(JSON.stringify(message)),
        }

        closed$.subscribe(() => this.disconnect(connection));
        this.connect(connection)
    }

    private connect(connection: Connection) {
        this.connections = [
            ...this.connections,
            connection,
        ];
        this.connections.forEach(c => {
            if (c !== connection) {
                c.send({
                    type: 'connect',
                    from: connection.id,
                });
            }
        });
    }

    private disconnect(connection: Connection) {
        this.connections = this.connections.filter(c => c !== connection);
        this.connections.forEach(c => {
            c.send({
                type: 'disconnect',
                from: connection.id,
            });
        });
    }

    private keepAlive(socket: WebSocket) {
        const closed$ = fromEvent(socket, 'close').pipe(
            first(),
            shareReplay(1),
        );
        const pong$ = fromEvent(socket, 'pong').pipe(
            takeUntil(closed$),
        );
        const activity$ = fromEvent<MessageEvent>(socket, 'message').pipe(
            map(e => e.data),
            startWith('ping'),
            source => merge(source, pong$),
            takeUntil(closed$),
            share(),
        );

        activity$.pipe(debounceTime(1000))
            .subscribe(() => socket.ping());
        activity$.pipe(debounceTime(3000))
            .subscribe(() => socket.close(1000, 'Client connection lost'));

        activity$.pipe(filter(m => m === 'ping'))
            .subscribe(() => socket.send('pong'));
    }
}

interface Connection {
    socket: WebSocket;
    id: string;
    message$: Observable<ClientMessage>;
    send: (message: ServerMessage) => void;
}