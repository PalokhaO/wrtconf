import { Subject, fromEvent, throwError, merge } from 'rxjs';
import { map, takeUntil, filter, debounceTime, switchMap, first } from 'rxjs/operators';
import { Serializable } from '@wrtconf/models';

export class WRTConf {
    private options: WRTConfOptions = {};
    private socket: WebSocket;
    message$ = new Subject<any>();

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
        ).subscribe(() => socket.close(1000, 'Server connection lost'));
        
        const message$ = rawMessage$.pipe(
            filter(m => m !== 'pong'),
            map(m => JSON.parse(m)),
            source => merge(source, error$),
        );
        message$.subscribe(this.message$);
        this.socket = socket;
    }

    // private generateOffer() {
    //     const peerConnection = new RTCPeerConnection({
    //         iceServers: [{urls: 'stun:stun.l.google.com:19302'}],
    //     });
    //     signalingChannel.addEventListener('message', async message => {
    //         if (message.answer) {
    //             const remoteDesc = new RTCSessionDescription(message.answer);
    //             await peerConnection.setRemoteDescription(remoteDesc);
    //         }
    //     });
    //     const offer = await peerConnection.createOffer();
    //     await peerConnection.setLocalDescription(offer);
    //     signalingChannel.send({'offer': offer});
    // }
}

interface WRTConfOptions {
    meta?: Serializable;
}