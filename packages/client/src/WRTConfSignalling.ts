import { ClientCandidateMessage, ClientMessage, Serializable, ServerAnswerMessage, ServerCandidateMessage, ServerMessage, ServerOfferMessage } from "@wrtconf/models";
import { fromEvent, Observable, Subject } from "rxjs";
import { filter, map } from "rxjs/operators";

export class WRTConfSignalling {
    clients: Client[] = [];
    message$ = new Subject<ClientMessage>();
    private connectionInitialised = false;

    constructor(message$: Observable<ServerMessage>, private stream: MediaStream) {
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
            case 'candidate':
                this.handleCandidate(message);
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
        if (this.connectionInitialised) {
            newClients.forEach(client => this.initNewClient(client));
            removedClients.forEach(client => this.disconnect(client));
        } else {
            this.connectionInitialised = true;
        }
    }

    private async initNewClient(client: Client) {
        this.initRTCConnection(client);
        const offer = await client.connection.createOffer();
        await client.connection.setLocalDescription(offer);
        this.message$.next({
            type: "offer",
            to: client.id,
            offer,
        });
    }

    private disconnect(client: Client) {
        client.connection?.close();
    }

    private async handleOffer(message: ServerOfferMessage) {
        const client = this.clients.find(c => c.id === message.from);
        this.initRTCConnection(client);
        await client.connection.setRemoteDescription(message.offer);
        const answer = await client.connection.createAnswer();
        this.message$.next({
            type: 'answer',
            to: message.from,
            answer,
        });
        await client.connection.setLocalDescription(answer);
    }

    private async handleAnswer(message: ServerAnswerMessage) {
        const client = this.clients.find(c => c.id === message.from);
        await client.connection.setRemoteDescription(message.answer);
    }

    private handleCandidate(message: ServerCandidateMessage) {
        const client = this.clients.find(c => c.id === message.from);
        client.connection?.addIceCandidate(message.candidate);
    }

    private initRTCConnection(client: Client) {
        this.disconnect(client);
        client.stream = new MediaStream();
        client.connection = new RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}]});
        client.connection.ontrack = e => client.stream.addTrack(e.track);
        this.stream.getTracks().forEach(track =>
            client.connection.addTrack(track)
        );
        const candidate$: Observable<ClientCandidateMessage> =
            fromEvent<RTCPeerConnectionIceEvent>(client.connection, 'icecandidate').pipe(
                filter(e => !!e.candidate),
                map(ev => ({
                    type: 'candidate',
                    to: client.id,
                    candidate: ev.candidate,
                })),
            );
        candidate$.subscribe(this.message$);
    }
}

interface Client {
    id: string;
    meta: Serializable;
    stream?: MediaStream;
    connection?: RTCPeerConnection;
}