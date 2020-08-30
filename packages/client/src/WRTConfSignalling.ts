import { ClientCandidateMessage, ClientMessage, Serializable, ServerAnswerMessage, ServerCandidateMessage, ServerMessage, ServerOfferMessage } from "@wrtconf/models";
import { BehaviorSubject, fromEvent, Observable, Subject } from "rxjs";
import { filter, map } from "rxjs/operators";

const videoBitrate = 750000;
const audioBitrate = 24000;

export class WRTConfSignalling {
    private clients: Client[] = [];
    private connectionInitialised = false;
    source = new MediaStream();
    message$ = new Subject<ClientMessage>();
    clients$ = new BehaviorSubject<Client[]>(this.clients);

    constructor(message$: Observable<ServerMessage>, stream?: MediaStream) {
        message$.subscribe(m => this.handleMessage(m));
        this.setSource(stream);
    }

    setSource(stream: MediaStream) {
        this.source = stream;
        const connections = this.clients
            .map(c => c.connection)
            .filter(Boolean);
        connections.forEach(connection => {
            connection.getSenders().forEach(s => connection.removeTrack(s));
            stream.getTracks().forEach(t => connection.addTrack(t));
        });
    }

    private async handleMessage(message: ServerMessage) {
        const client = this.clients.find(c => c.id == message.from);
        switch(message.type) {
            case 'clients':
                await this.handleClients(message.clients);
                break;
            case 'offer':
                await this.handleOffer(message, client);
                break;
            case 'answer':
                await this.handleAnswer(message, client);
                break;
            case 'candidate':
                await this.handleCandidate(message, client);
                break;
        }
        this.clients$.next(this.clients);
    }

    private async handleClients(clients: SignallingClient[]) {
        const newClients = clients
            .filter(client => !this.clients.some(existing => existing.id === client.id))
            .map(client => this.toClient(client));
        const removedClients = this.clients.filter(client =>
            !clients.some(newClient => newClient.id === client.id)
        );
        this.clients = this.clients
            .filter(c => !removedClients.includes(c))
            .concat(newClients);
        if (this.connectionInitialised) {
            removedClients.forEach(client => this.disconnect(client));
            await Promise.all(newClients.map(client => this.initNewClient(client)));
        } else {
            this.connectionInitialised = true;
        }
    }

    private async handleOffer(message: ServerOfferMessage, client: Client) {
        this.initICESignalling(client);
        await client.connection.setRemoteDescription(message.offer);
        const answer = await client.connection.createAnswer();
        this.message$.next({
            type: 'answer',
            to: message.from,
            answer,
        });
        await client.connection.setLocalDescription(answer);
    }

    private async handleAnswer(message: ServerAnswerMessage, client: Client) {
        await client.connection.setRemoteDescription(message.answer);
    }

    private async handleCandidate(message: ServerCandidateMessage, client: Client) {
        await client.connection?.addIceCandidate(message.candidate);
    }
    
    private async initNewClient(client: Client) {
        this.initICESignalling(client);
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

    private initICESignalling(client: Client) {
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

    private toClient(signallingClient: SignallingClient): Client {
        const client = {
            ...signallingClient,
            connection: new RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}]}),
            stream: new MediaStream(),
        };
        client.connection.ontrack = ({track}) => client.stream.addTrack(track);
        this.source.getTracks().forEach(async track => client.connection.addTrack(track, this.source));
        return client;
    }
}

interface SignallingClient {
    id: string;
    meta: Serializable;
}

export interface Client extends SignallingClient {
    stream: MediaStream;
    connection: RTCPeerConnection;
}