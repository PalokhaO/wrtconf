import { ClientMessage, Serializable, ServerAnswerMessage, ServerMessage, ServerOfferMessage } from "@wrtconf/models";
import { Observable, Subject } from "rxjs";

export class WRTConfSignalling {
    private clients: Client[] = [];
    message$ = new Subject<ClientMessage>();

    constructor(message$: Observable<ServerMessage>) {
        message$.subscribe(m => this.handleMessage(m));
    }

    private handleMessage(message: ServerMessage) {
        switch(message.type) {
            case 'clients':
                this.updateClients(message.clients);
                break;
            case 'offer':
                this.handleOffer(message);
                break;
            case 'answer':
                this.handleAnswer(message);
                break;
        }
    }

    private updateClients(clients: {id: string, meta: Serializable}[]) {
        const newClients = clients.filter(client =>
            !this.clients.some(existing => existing.id === client.id)
        );
        const removedClients = this.clients.filter(client =>
            !clients.some(newClient => newClient.id === client.id)
        );
        this.clients = this.clients
            .filter(c => !removedClients.includes(c))
            .concat(newClients);
        newClients.forEach(client => this.initNewClient(client));
        removedClients.forEach(client => this.disconnect(client));
    }

    private async initNewClient(client: Client) {
        client.connection = new RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}]});
        const offer = await client.connection.createOffer();
        await client.connection.setLocalDescription(offer);
        this.message$.next({
            type: "offer",
            to: client.id,
            offer,
        });
    }

    private disconnect(client: Client) {
        client.connection?.close?.();
    }

    private async handleOffer(message: ServerOfferMessage) {
        const client = this.clients.find(c => c.id === message.from);
        this.disconnect(client);
        client.connection = new RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}]});
        await client.connection.setRemoteDescription(message.offer);
        const answer = await client.connection.createAnswer();
        this.message$.next({
            type: 'answer',
            to: message.from,
            answer,
        });
    }

    private async handleAnswer(message: ServerAnswerMessage) {
        const client = this.clients.find(c => c.id === message.from);
        if (client.connection.connectionState !== 'connected') {
            this.disconnect(client);
            client.connection = new RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}]});
            await client.connection.setRemoteDescription(message.answer);
        }
    }
}

interface Client {
    id: string;
    meta: Serializable;
    connection?: RTCPeerConnection;
}