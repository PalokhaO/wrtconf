import { Subject, fromEvent, throwError, merge } from 'rxjs';
import { map, takeUntil, filter, debounceTime, switchMap, first } from 'rxjs/operators';

export class WRTConf {
    private options: WRTConfOptions = {};
    private socket: WebSocket;
    private message$: Subject<any>;

    constructor(private url: string, options: Partial<WRTConfOptions> = {}) {
        this.options = {
            ...this.options,
            ...options,
        };

        this.initSocket();
    }

    private initSocket() {
        const socket = new WebSocket(this.url);
        this.socket?.close?.();

        const closed$ = fromEvent(socket, 'close').pipe(first());
        const error$ = fromEvent(socket, 'error').pipe(
            switchMap(() => throwError(new Error('WebSocket connection error'))),
            takeUntil(closed$),
        );
        const rawMessage$ = fromEvent<MessageEvent>(socket, 'message').pipe(
            map(e => e.data),
            takeUntil(closed$),
        );

        rawMessage$.pipe(
            debounceTime(1000),
        ).subscribe(() => socket.send('ping'));
        rawMessage$.pipe(
            debounceTime(3000),
        ).subscribe(() => socket.close(1001, 'Server connection lost'));
        
        const message$ = rawMessage$.pipe(
            filter(m => m !== 'pong'),
            map(m => JSON.parse(m)),
            source => merge(source, error$),
        );
        message$.subscribe(this.message$);
    }
}

type Serializable = null | string | number | {[key: string]: Serializable} | Serializable[];

interface WRTConfOptions {
    meta?: Serializable;
}