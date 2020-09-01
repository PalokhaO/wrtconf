import { ClientMessage, ServerAnswerMessage, ServerCandidateMessage, ServerConstraintsMessage, ServerMessage, ServerOfferMessage, SignallingPeer, StreamConstraints } from "@wrtconf/models";
import { Observable, ReplaySubject, Subject } from "rxjs";
import { WebRTCPeer } from "./WebRTCPeer";

export class WebRTCConnection {
    localStream = new MediaStream();
    message$ = new Subject<ClientMessage>();
    peers$ = new ReplaySubject<WebRTCPeer[]>(1);

    private peers: WebRTCPeer[] = [];
    private connectionInitialised = false;
    private receptionConstraints: StreamConstraints = {
        audio: {
            maxBitrate: 41000,
        },
        video: {
            maxBitrate: 750000,
            maxFramerate: 20,
            minSize: 720,
        },
    };

    constructor(message$: Observable<ServerMessage>, params?: WRTConfSignallingParams) {
        message$.subscribe(m => this.handleMessage(m));
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
                signallingPeer,
                receptionConstraints: this.receptionConstraints,
                localStream: this.localStream,
                onIceCandidate: candidate => {
                    this.message$.next(({
                        type: 'candidate',
                        to: signallingPeer.id,
                        candidate,
                    }));
                },
                onReceptionConstraints: constraints => {
                    this.message$.next({
                        type: 'constraints',
                        to: signallingPeer.id,
                        constraints,
                    });
                },
            }));
        const removedPeers = this.peers.filter(({signallingPeer}) =>
            !peers.some(newPeer => newPeer.id === signallingPeer.id)
        );
        this.peers = this.peers
            .filter(c => !removedPeers.includes(c))
            .concat(newPeers);
        if (this.connectionInitialised) {
            removedPeers.forEach(peer => peer.disconnect());
            newPeers.forEach(peer => this.initNewPeer(peer));
        } else {
            this.connectionInitialised = true;
        }
        this.peers$.next(this.peers);
    }

    private async handleOffer(message: ServerOfferMessage, peer: WebRTCPeer) {
        this.message$.next({
            type: 'answer',
            to: message.from,
            answer: await peer.getAnswer(message.offer),
        });
        this.peers$.next(this.peers);
    }

    private async handleAnswer(message: ServerAnswerMessage, peer: WebRTCPeer) {
        await peer.setAnswer(message.answer);
        this.peers$.next(this.peers);
    }

    private async handleCandidate(message: ServerCandidateMessage, peer: WebRTCPeer) {
        await peer.addIceCandidate(message.candidate);
    }

    private async handleConstraints(message: ServerConstraintsMessage, peer: WebRTCPeer) {
        await peer.updateTransmissionConstraints(message.constraints);
    }
    
    private async initNewPeer(peer: WebRTCPeer) {
        this.message$.next({
            type: "offer",
            to: peer.signallingPeer.id,
            offer: await peer.getOffer(),
        });
    }

}

export interface WRTConfSignallingParams {
    source?: MediaStream;
    defaultConstraints?: StreamConstraints;
}