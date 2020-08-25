import { merge, Observable } from "rxjs";
import { map, pairwise, startWith, switchMap, tap } from "rxjs/operators";
import { ClientMessage } from "../../models";
import { SocketConnection } from "./SocketServer";

export class SignallingServer {
    constructor(private connections$: Observable<SocketConnection[]>) {
        connections$.pipe(
            startWith(null),
            pairwise(),
            tap((([prev, next]) => {
                if (prev?.length > next?.length) {
                    const removed = prev.find(c => !next.includes(c));
                    this.removeConnection(removed, next);
                } else if (prev?.length > next?.length) {
                    const added = next.find(c => !prev.includes(c));
                    this.addConnection(added, prev);
                }
            })),
            map(([prev, next]) => next),
            switchMap(this.toMessage$),
        ).subscribe(({connections, connection, message}) => {
            this.handleMessage(message, connection, connections);
        });
    }

    private handleMessage(message: ClientMessage, connection: SocketConnection, connections: SocketConnection[]) {
        switch(message.type) {
            case 'meta':
                connections
                    .filter(c => c !== connection)
                    .forEach(c => c.send({
                        type: 'meta',
                        from: connection.id,
                        meta: message.meta,
                    }));
                break;
            case 'offer':
                connections
                    .find(c => c.id === message.to)
                    ?.send?.({
                        type: 'offer',
                        from: connection.id,
                        offer: message.offer,
                    });
                break;
            case 'answer':
                connections
                    .find(c => c.id === message.to)
                    ?.send?.({
                        type: 'answer',
                        from: connection.id,
                        answer: message.answer,
                    });
                break;
        }
    }

    private removeConnection(removedConnection: SocketConnection, otherConnections: SocketConnection[]) {
        otherConnections.forEach(c => c.send({
            type: 'disconnect',
            from: removedConnection.id,
        }));
    }

    private addConnection(addedConnection: SocketConnection, otherConnections: SocketConnection[]) {
        otherConnections.forEach(c => c.send({
            type: 'connect',
            from: addedConnection.id,
        }));
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