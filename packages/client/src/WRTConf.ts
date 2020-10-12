import { ClientMessage, ServerAnswerMessage, ServerCandidateMessage, ServerConstraintsMessage, ServerMessage, ServerOfferMessage, SignallingPeer, StreamConstraints } from "@wrtconf/models";
import { Subject } from "rxjs";
import { EventEmitter } from "./EventEmitter";
import { SocketConnection } from "./SocketConnection";
import { WebRTCPeer } from "./WebRTCPeer";

export class WRTConf extends EventEmitter<WRTConfEvents> {
    localStream = new MediaStream();
    message$ = new Subject<ClientMessage>();
    peers: WebRTCPeer[] = [];

    private connectionInitialised = false;
    private receptionConstraints: StreamConstraints = {
        audio: {
            maxBitrate: 41000,
        },
        video: {
            quality: 1,
            maxFramerate: 20,
            minSize: 720,
        },
    };
    private socketConnection: SocketConnection;

    constructor(params?: WRTConfSignallingParams) {
        super();
        this.socketConnection = new SocketConnection(params.url, params.meta);
        this.socketConnection.message$.subscribe(m => this.handleMessage(m));
        this.socketConnection.connect$.subscribe(() => this.resetConnectionStatus());

        this.updateLocalStream(params?.source);
        this.updateReceptionConstraints(params?.defaultConstraints, true);
    }

    updateLocalStream(stream: MediaStream) {
        if (!stream) {
            throw new Error(`Cannot update local stream: supplied stream is ${stream}`);
        }
        this.localStream = stream;
        this.peers.forEach(peer => peer.updateLocalStream(stream));
    }

    updateReceptionConstraints(constraints: StreamConstraints, apply = false) {
        this.receptionConstraints = {
            video: {
                ...this.receptionConstraints.video,
                ...constraints?.video || {},
            },
            audio: {
                ...this.receptionConstraints.audio,
                ...constraints?.audio || {},
            },
        };
        if (apply) {
            this.peers.forEach(peer => peer.updateReceptionConstraints(this.receptionConstraints));
        }
    }

    updateMeta(meta: string) {
        this.socketConnection.updateMeta(meta);
    }

    private resetConnectionStatus() {
        this.connectionInitialised = false;
    }
    
    private async handleMessage(message: ServerMessage) {
        const peer = this.peers.find(peer => peer.signallingPeer.id == message.from);
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
            case 'constraints':
                await this.handleConstraints(message, peer);
        }
    }

    private async handlePeers(peers: SignallingPeer[]) {
        const newPeers = peers
            .filter(peer => !this.peers.some(existing => existing.signallingPeer.id === peer.id))
            .map(signallingPeer => new WebRTCPeer({
                meta: signallingPeer.meta,
                signallingPeer,
                receptionConstraints: this.receptionConstraints,
                localStream: this.localStream,
                onIceCandidate: candidate => {
                    this.socketConnection.send(({
                        type: 'candidate',
                        to: signallingPeer.id,
                        candidate,
                    }));
                },
                onReceptionConstraints: constraints => {
                    this.socketConnection.send({
                        type: 'constraints',
                        to: signallingPeer.id,
                        constraints,
                    });
                },
            }));
        const removedPeers = this.peers.filter(({signallingPeer}) =>
            !peers.some(newPeer => newPeer.id === signallingPeer.id)
        );
        const existingPeers = this.peers
            .filter(p => !removedPeers.includes(p));
        const updatedMetaPeers = existingPeers
            .filter(({signallingPeer}) => {
                const updated = peers.find(p => p.id === signallingPeer.id);
                const metaUpdated = updated.meta !== signallingPeer.meta;
                if (metaUpdated) {
                    signallingPeer.meta = updated.meta;
                }
                return metaUpdated
            });

        this.peers = existingPeers.concat(newPeers);

        newPeers.forEach(peer => this.emit({
            type: 'peer',
            data: peer,
        }));
        removedPeers.forEach(peer => this.emit({
            type: 'removepeer',
            data: peer,
        }));
        updatedMetaPeers.forEach(peer => this.emit({
            type: 'metaupdate',
            data: peer,
        }));

        if (this.connectionInitialised) {
            removedPeers.forEach(peer => peer.disconnect());
            newPeers.forEach(peer => this.initNewPeer(peer));
        } else {
            this.connectionInitialised = true;
        }
    }

    private async handleOffer(message: ServerOfferMessage, peer: WebRTCPeer) {
        this.socketConnection.send({
            type: 'answer',
            to: message.from,
            answer: await peer.getAnswer(message.offer),
        });
    }

    private async handleAnswer(message: ServerAnswerMessage, peer: WebRTCPeer) {
        await peer.setAnswer(message.answer);
    }

    private async handleCandidate(message: ServerCandidateMessage, peer: WebRTCPeer) {
        await peer.addIceCandidate(message.candidate);
    }

    private async handleConstraints(message: ServerConstraintsMessage, peer: WebRTCPeer) {
        await peer.updateTransmissionConstraints(message.constraints);
    }
    
    private async initNewPeer(peer: WebRTCPeer) {
        this.socketConnection.send({
            type: "offer",
            to: peer.signallingPeer.id,
            offer: await peer.getOffer(),
        });
    }

}

export interface WRTConfSignallingParams {
    url: string;
    source?: MediaStream;
    defaultConstraints?: StreamConstraints;
    meta?: string;
}

export interface WRTConfEvents {
    'peer': WebRTCPeer;
    'metaupdate': WebRTCPeer;
    'removepeer': WebRTCPeer;
}
