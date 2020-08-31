import { merge, Observable } from "rxjs";
import { map, switchMap } from "rxjs/operators";
import { ClientMessage } from "../../models";
import { SocketConnection } from "./SocketServer";

export class SignallingServer {
    constructor(private connections$: Observable<SocketConnection[]>) {
        connections$.pipe(
            switchMap(this.toMessage$),
        ).subscribe(({connections, connection, message}) => {
            this.handleMessage(message, connection, connections);
        });
    }

    private handleMessage(message: ClientMessage, connection: SocketConnection, connections: SocketConnection[]) {
        switch(message.type) {
            case 'offer':
                connections
                    .find(c => c.id === message.to)
                    ?.send({
                        type: 'offer',
                        from: connection.id,
                        offer: message.offer,
                    });
                break;
            case 'answer':
                connections
                    .find(c => c.id === message.to)
                    ?.send({
                        type: 'answer',
                        from: connection.id,
                        answer: message.answer,
                    });
                break;
            case 'candidate':
                connections
                    .find(c => c.id === message.to)
                    ?.send({
                        type: 'candidate',
                        from: connection.id,
                        candidate: message.candidate,
                    });
                break;
            case 'constraints':
                connections
                    .find(c => c.id === message.to)
                    ?.send({
                        type: 'constraints',
                        from: connection.id,
                        constraints: message.constraints,
                    });
                break;
        }
    }

    private toMessage$(connections: SocketConnection[]) {
        const namedMessages = connections.map(connection =>
            connection.message$.pipe(
                map(message => ({
                    connections,
                    connection,
                    message,
                }))
            )
        );
        return merge(...namedMessages);
    }
}