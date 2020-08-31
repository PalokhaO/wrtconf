import { ClientCandidateMessage, ClientMessage, Serializable, ServerAnswerMessage, ServerCandidateMessage, ServerMessage, ServerOfferMessage } from "@wrtconf/models";
import { BehaviorSubject, fromEvent, Observable, Subject } from "rxjs";
import { filter, map } from "rxjs/operators";

export class WRTConfSignalling {
    private clients: Client[] = [];
    private connectionInitialised = false;
    private defaultConstraints: Constraints = {
        audio: {
            maxBitrate: 41000,
        },
        video: {
            maxBitrate: 750000,
            maxFramerate: 20,
            minSize: 720,
        },
    };
    source = new MediaStream();
    message$ = new Subject<ClientMessage>();
    clients$ = new BehaviorSubject<Client[]>(this.clients);

    constructor(message$: Observable<ServerMessage>, params?: WRTConfSignallingParams) {
        message$.subscribe(m => this.handleMessage(m));
        this.setSource(params?.source);
        this.setDefaultConstraints(params?.defaultConstraints);
    }

    setSource(stream?: MediaStream) {
        this.source = stream;
        const connections = this.clients
            .map(c => c.connection)
            .filter(Boolean);
        connections.forEach(connection => {
            connection.getSenders().forEach(s => connection.removeTrack(s));
            stream?.getTracks().forEach(t => connection.addTrack(t));
        });
    }

    setDefaultConstraints(constraints: Constraints) {
        this.defaultConstraints = {
            video: {
                ...this.defaultConstraints.video,
                ...constraints?.video || {},
            },
            audio: {
                ...this.defaultConstraints.audio,
                ...constraints?.audio || {},
            },
        };
    }

    updateConstraints(clientId: string, constraints: Constraints) {
        const client = this.clients
            .find(c => c.id === clientId);
        if (client) {
            client.constraints = {
                video: {
                    ...client.constraints.video,
                    ...constraints.video || {},
                },
                audio: {
                    ...client.constraints.audio,
                    ...constraints.audio || {},
                }
            };
        }
        const senders = client.connection?.getSenders() || [];
        senders
            .filter(sender => !!sender.track)
            .forEach(sender => this.constrainSender(sender, client.constraints))
    }

    private constrainSender(sender: RTCRtpSender, constraints: Constraints) {
        const parameters = sender.getParameters();
        if (parameters.encodings.length) {
            Object.assign(parameters.encodings[0], this.calculateConstraints(constraints, sender.track));
        }
        sender.setParameters(parameters);
    }

    private calculateConstraints(constraints: Constraints, track: MediaStreamTrack) {
        switch(track.kind) {
            case 'audio':
                return constraints.audio;
            case 'video':
                const result = {
                    ...constraints.video,
                    scaleResolutionDownBy: this.scaleDownCoefficient(track, constraints.video.minSize),
                };
                delete result.minSize;
                return result;
        }
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
            newClients.forEach(client => this.initNewClient(client));
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

    private scaleDownCoefficient(track: MediaStreamTrack, minSize?: number): number {
        const settings = track.getSettings();
        const currentMinSize = Math.min(settings.width, settings.height);
        const ratio = currentMinSize / minSize;
        const coefficient = Math.max(ratio, 1);
        return isFinite(coefficient) ? coefficient : 1;
    }

    private toClient(signallingClient: SignallingClient): Client {
        const client = {
            ...signallingClient,
            connection: new RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}]}),
            stream: new MediaStream(),
            constraints: this.defaultConstraints,
        };
        client.connection.ontrack = ({track}) => client.stream.addTrack(track);
        this.source.getTracks().forEach(track => {
            const sender = client.connection.addTrack(track, this.source);
            this.constrainSender(sender, this.defaultConstraints);
        })
        return client;
    }
}

interface VideoConstraints {
    maxBitrate?: number;
    maxFramerate?: number;
    minSize?: number;
}

interface AudioConstraints {
    maxBitrate?: number;
}

export interface Constraints {
    video?: VideoConstraints;
    audio?: AudioConstraints;
}

export interface WRTConfSignallingParams {
    source?: MediaStream;
    defaultConstraints?: Constraints;
}

interface SignallingClient {
    id: string;
    meta: Serializable;
}

export interface Client extends SignallingClient {
    stream: MediaStream;
    connection: RTCPeerConnection;
    constraints: Constraints;
}