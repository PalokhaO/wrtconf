import { Server as HttpServer } from 'http';
import { Server as WebsocketServer } from 'ws';
import WebSocket from 'ws';
import { fromEvent, merge, Observable, throwError } from 'rxjs';
import { debounceTime, filter, first, map, startWith, switchMap, takeUntil } from 'rxjs/operators';

export class WRTConfServer {
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
        const closed$ = fromEvent(socket, 'close').pipe(first());
        const error$ = fromEvent(socket, 'error').pipe(
            switchMap(() => throwError(new Error('WebSocket connection error'))),
            takeUntil(closed$),
        );
        const pong$ = fromEvent(socket, 'pong').pipe(
            takeUntil(closed$),
        );

        const rawMessage$ = fromEvent<MessageEvent>(socket, 'message').pipe(
            map(e => e.data),
            startWith('ping'),
            takeUntil(closed$),
        );

        rawMessage$.pipe(
            debounceTime(1000),
        ).subscribe(() => socket.ping());
        rawMessage$.pipe(
            source => merge(source, pong$),
            debounceTime(3000),
        ).subscribe(() => socket.close(1000, 'Client connection lost'));

        rawMessage$.pipe(filter(m => m === 'ping'))
            .subscribe(() => socket.send('pong'));
        
        const message$ = rawMessage$.pipe(
            filter(m => m && m !== 'ping'),
            map(m => JSON.parse(m)),
            source => merge(source, error$),
        );

        closed$.subscribe(() => {
            this.connections = this.connections.filter(c => c.socket === socket);
        });

        this.connections = [
            ...this.connections,
            {
                socket,
                message$,
            }
        ]
    }
}

interface Connection {
    socket: WebSocket;
    message$: Observable<any>;
}