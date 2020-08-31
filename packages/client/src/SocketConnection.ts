import { Subject, fromEvent, throwError, merge } from 'rxjs';
import { map, takeUntil, filter, debounceTime, switchMap, first, share, shareReplay } from 'rxjs/operators';
import { ClientMessage, Serializable } from '@wrtconf/models';

export class SocketConnection {
    private socket: WebSocket;
    message$ = new Subject<any>();

    constructor(private url: string, meta: Serializable = null) {
        this.initSocket(meta);
    }
    
    send(message: ClientMessage) {
        this.socket.send(JSON.stringify(message));
    }

    updateMeta(meta: Serializable) {
        this.send({
            type: 'meta',
            meta,
        });
    }

    private async initSocket(meta: Serializable) {
        this.socket?.close();
        const socket = new WebSocket(this.url);
        await this.open(socket);
        this.socket = socket;
        this.keepAlive(socket);
        this.initListeners(socket);
        this.updateMeta(meta);
        
    }

    private initListeners(socket: WebSocket) {
        const closed$ = fromEvent(socket, 'close').pipe(
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
        message$.subscribe(this.message$);
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