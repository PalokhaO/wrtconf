import { Server as HttpServer } from 'http';
import { Server as WebsocketServer } from 'ws';
import WebSocket from 'ws';
import { BehaviorSubject, fromEvent, merge, Observable, throwError } from 'rxjs';
import { debounceTime, filter, first, map, share, shareReplay, startWith, switchMap, takeUntil } from 'rxjs/operators';
import { ClientMessage, ClientMetaMessage, ServerMessage } from '../../models';
import { v4 } from 'uuid';

export class SocketServer {
    private connections: SocketConnection[] = [];
    private _connections$ = new BehaviorSubject<SocketConnection[]>([]);
    connections$ = this._connections$.asObservable();

    constructor(httpServer: HttpServer, path = '') {
        const wsServer = new WebsocketServer({
            path,
            server: httpServer,
        });
        wsServer.on('connection', socket => this.initConnection(socket));
        wsServer.on('close', () => this._connections$.complete());
        this._connections$.subscribe(connections => connections.forEach(connection => {
            connection.send({
                type: "clients",
                clients: connections
                    .filter(c => c !== connection)
                    .map(c => ({
                        id: c.id,
                        meta: c.meta,
                    }))
            })
        }));
    }

    private initConnection(socket: WebSocket) {
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
        
        
        const message$: Observable<ClientMessage> = fromEvent<MessageEvent>(socket, 'message').pipe(
            map(e => e.data),
            filter(m => m && m !== 'ping'),
            map(m => JSON.parse(m)),
            source => merge(source, error$),
            takeUntil(closed$),
            share(),
        );

        message$.pipe(filter((m): m is ClientMetaMessage => m.type === 'meta'))
            .subscribe(m => this.setMeta(connection, m.meta));

        const connection: SocketConnection = {
            id: v4(),
            meta: null,
            message$,
            send: message => socket.send(JSON.stringify(message)),
        }

        closed$.subscribe(() => this.disconnect(connection));
    }

    private setMeta(connection: SocketConnection, meta: string) {
        connection.meta = meta;
        if (!this.connections.includes(connection)) {
            this.connections = [
                ...this.connections,
                connection,
            ];
        }
        
        this._connections$.next(this.connections);
    }

    private disconnect(connection: SocketConnection) {
        this.connections = this.connections.filter(c => c !== connection);
        this._connections$.next(this.connections);
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

export interface SocketConnection {
    id: string;
    meta: string;
    message$: Observable<ClientMessage>;
    send: (message: ServerMessage) => void;
}
