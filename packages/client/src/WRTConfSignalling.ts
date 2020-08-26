import { ClientCandidateMessage, ClientMessage, Serializable, ServerAnswerMessage, ServerCandidateMessage, ServerMessage, ServerOfferMessage } from "@wrtconf/models";
import { BehaviorSubject, fromEvent, Observable, Subject } from "rxjs";
import { filter, map } from "rxjs/operators";

const videoBitrate = 750000;
const audioBitrate = 24000;

export class WRTConfSignalling {
    private clients: Client[] = [];
    private connectionInitialised = false;
    message$ = new Subject<ClientMessage>();
    clients$ = new BehaviorSubject<Client[]>(this.clients);

    constructor(message$: Observable<ServerMessage>, private stream: MediaStream) {
        message$.subscribe(m => this.handleMessage(m));
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

    private async handleClients(clients: {id: string, meta: Serializable}[]) {
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
            removedClients.forEach(client => this.disconnect(client));
            await Promise.all(newClients.map(client => this.initNewClient(client)));
        } else {
            this.connectionInitialised = true;
        }
    }

    private async handleOffer(message: ServerOfferMessage, client: Client) {
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

    private async handleAnswer(message: ServerAnswerMessage, client: Client) {
        await client.connection.setRemoteDescription(message.answer);
    }

    private async handleCandidate(message: ServerCandidateMessage, client: Client) {
        await client.connection?.addIceCandidate(message.candidate);
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

    private initRTCConnection(client: Client) {
        this.disconnect(client);
        client.stream = new MediaStream();
        client.connection = new RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}]});
        client.connection.ontrack = e => client.stream.addTrack(e.track);
        this.stream.getTracks().forEach(async track => {
            const sender = await client.connection.addTrack(track);
            const params = sender.getParameters();
            sender.setParameters({
                ...params,
                encodings: params.encodings.map(e => ({
                    ...e,
                    maxBitrate: track.kind === 'video'
                        ? videoBitrate
                        : audioBitrate,
                })),
            });
            console.log(sender);
        });
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

export interface Client {
    id: string;
    meta: Serializable;
    stream?: MediaStream;
    connection?: RTCPeerConnection;
}