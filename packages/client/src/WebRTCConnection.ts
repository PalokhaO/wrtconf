import { ClientCandidateMessage, ClientMessage, Serializable, ServerAnswerMessage, ServerCandidateMessage, ServerMessage, ServerOfferMessage } from "@wrtconf/models";
import { BehaviorSubject, fromEvent, Observable, Subject } from "rxjs";
import { filter, map } from "rxjs/operators";

export class WebRTCConnection {
    private peers: Peer[] = [];
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
    peers$ = new BehaviorSubject<Peer[]>(this.peers);

    constructor(message$: Observable<ServerMessage>, params?: WRTConfSignallingParams) {
        message$.subscribe(m => this.handleMessage(m));
        this.setSource(params?.source);
        this.setDefaultConstraints(params?.defaultConstraints);
    }

    setSource(stream?: MediaStream) {
        this.source = stream;
        const connections = this.peers
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

    updateConstraints(peerId: string, constraints: Constraints) {
        const peer = this.peers
            .find(c => c.id === peerId);
        if (peer) {
            peer.constraints = {
                video: {
                    ...peer.constraints.video,
                    ...constraints.video || {},
                },
                audio: {
                    ...peer.constraints.audio,
                    ...constraints.audio || {},
                }
            };
        }
        const senders = peer.connection?.getSenders() || [];
        senders
            .filter(sender => !!sender.track)
            .forEach(sender => this.constrainSender(sender, peer.constraints))
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
        const peer = this.peers.find(c => c.id == message.from);
        switch(message.type) {
            case 'clients':
                await this.handlePeers(message.clients);
                break;
            case 'offer':
                await this.handleOffer(message, peer);
                break;
            case 'answer':
                await this.handleAnswer(message, peer);
                break;
            case 'candidate':
                await this.handleCandidate(message, peer);
                break;
        }
        this.peers$.next(this.peers);
    }

    private async handlePeers(peers: SignallingPeer[]) {
        const newPeers = peers
            .filter(peer => !this.peers.some(existing => existing.id === peer.id))
            .map(peer => this.toPeer(peer));
        const removedPeers = this.peers.filter(peer =>
            !peers.some(newPeer => newPeer.id === peer.id)
        );
        this.peers = this.peers
            .filter(c => !removedPeers.includes(c))
            .concat(newPeers);
        if (this.connectionInitialised) {
            removedPeers.forEach(peer => this.disconnect(peer));
            newPeers.forEach(peer => this.initNewPeer(peer));
        } else {
            this.connectionInitialised = true;
        }
    }

    private async handleOffer(message: ServerOfferMessage, peer: Peer) {
        this.initICESignalling(peer);
        await peer.connection.setRemoteDescription(message.offer);
        const answer = await peer.connection.createAnswer();
        this.message$.next({
            type: 'answer',
            to: message.from,
            answer,
        });
        await peer.connection.setLocalDescription(answer);
    }

    private async handleAnswer(message: ServerAnswerMessage, peer: Peer) {
        await peer.connection.setRemoteDescription(message.answer);
    }

    private async handleCandidate(message: ServerCandidateMessage, peer: Peer) {
        await peer.connection?.addIceCandidate(message.candidate);
    }
    
    private async initNewPeer(peer: Peer) {
        this.initICESignalling(peer);
        const offer = await peer.connection.createOffer();
        await peer.connection.setLocalDescription(offer);
        this.message$.next({
            type: "offer",
            to: peer.id,
            offer,
        });
    }

    private disconnect(peer: Peer) {
        peer.connection?.close();
    }

    private initICESignalling(peer: Peer) {
        const candidate$: Observable<ClientCandidateMessage> =
            fromEvent<RTCPeerConnectionIceEvent>(peer.connection, 'icecandidate').pipe(
                filter(e => !!e.candidate),
                map(ev => ({
                    type: 'candidate',
                    to: peer.id,
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

    private toPeer(signallingPeer: SignallingPeer): Peer {
        const peer = {
            ...signallingPeer,
            connection: new RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}]}),
            stream: new MediaStream(),
            constraints: this.defaultConstraints,
        };
        peer.connection.ontrack = ({track}) => peer.stream.addTrack(track);
        this.source.getTracks().forEach(track => {
            const sender = peer.connection.addTrack(track, this.source);
            this.constrainSender(sender, this.defaultConstraints);
        })
        return peer;
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

interface SignallingPeer {
    id: string;
    meta: Serializable;
}

export interface Peer extends SignallingPeer {
    stream: MediaStream;
    connection: RTCPeerConnection;
    constraints: Constraints;
}