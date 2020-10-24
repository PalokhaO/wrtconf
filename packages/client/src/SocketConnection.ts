import { ClientMessage, ServerMessage } from '@palokhao/wrtconf-models';
import { fromEvent, merge, Subject, throwError } from 'rxjs';
import { debounceTime, delay, filter, first, map, share, shareReplay, switchMap, takeUntil, tap } from 'rxjs/operators';

export class SocketConnection {
    private socket: WebSocket;
    message$ = new Subject<ServerMessage>();
    connect$ = new Subject<void>();

    constructor(private url: string, private meta?: string) {
        this.initSocket();
    }
    
    send(message: ClientMessage) {
        this.socket.send(JSON.stringify(message));
    }

    updateMeta(meta: string) {
        this.meta = meta;
        this.send({
            type: 'meta',
            meta: this.meta,
        });
    }

    private async initSocket() {
        this.socket?.close(1000);
        const socket = new WebSocket(this.url);
        this.socket = socket;
        this.keepAlive(socket);
        this.initListeners(socket);
        await this.open(socket);
        this.connect$.next();
        this.updateMeta(this.meta);
    }

    private initListeners(socket: WebSocket) {
        const closed$ = fromEvent<CloseEvent>(socket, 'close').pipe(
            first(),
            share(),
        );
        const error$ = fromEvent(socket, 'error').pipe(
            switchMap(() => throwError(new Error('WebSocket connection error'))),
            takeUntil(closed$),
        );
        
        const message$ = fromEvent<MessageEvent>(socket, 'message').pipe(
            map(e => e.data),
            filter(m => m !== 'pong'),
            map(m => JSON.parse(m)),
            source => merge(source, error$),
            takeUntil(closed$),
        );
        message$.subscribe(
            data => this.message$.next(data),
        );
        closed$.pipe(
            filter(event => event.code !== 100),
            tap(() => console.log("Socket connection lost")),
            delay(1000),
            tap(() => console.log("Retrying socket connection")),
        ).subscribe(() => this.initSocket());
    }

    private keepAlive(socket) {
        const closed$ = fromEvent(socket, 'close').pipe(
            first(),
            shareReplay(1),
        );
        const rawMessage$ = fromEvent<MessageEvent>(socket, 'message').pipe(
            map(e => e.data),
            takeUntil(closed$),
            share(),
        );

        rawMessage$.pipe(
            debounceTime(1000),
        ).subscribe(() => socket.send('ping'));
        rawMessage$.pipe(
            debounceTime(3000),
        ).subscribe(() => socket.close(1000, 'Server connection lost'));
    }

    private open(socket: WebSocket) {
        return new Promise((res, rej) => {
            socket.onopen = res;
            socket.onerror = rej;
        });
    }
}