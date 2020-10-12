import { SignallingPeer, StreamConstraints } from "@wrtconf/models";

export class WebRTCPeer {

    signallingPeer: SignallingPeer;
    receptionConstraints: StreamConstraints;
    transmissionConstraints: StreamConstraints;
    onReceptionConstraints: (constraints: StreamConstraints) => void;
    onIceCandidate: (candidate: RTCIceCandidate) => void;

    localStream = new MediaStream();
    remoteStream = new MediaStream();
    meta?: string;
    private connection = new RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}]});
    

    constructor(init: WebRTCPeerInit) {
        this.signallingPeer = init.signallingPeer;
        this.receptionConstraints = init.receptionConstraints;
        this.onReceptionConstraints = init.onReceptionConstraints;
        this.onIceCandidate = init.onIceCandidate;

        this.connection.ontrack = ({track}) => this.remoteStream.addTrack(track);
        this.connection.addEventListener('icecandidate', e => {
            if (e.candidate) {
                this.onIceCandidate?.(e.candidate);
            }
        });
        if (init.localStream) {
            this.updateLocalStream(init.localStream);
        }
        this.meta = init.meta;
    }

    updateLocalStream(stream: MediaStream) {
        if (!stream) {
            throw new Error(`Cannot update local stream: supplied stream is ${stream}`);
        }
        this.localStream?.removeEventListener('addtrack', this.addTrackHandler);
        this.localStream?.removeEventListener('removetrack', this.addTrackHandler);
        this.localStream = stream;
        this.connection.getSenders().forEach(s => this.connection.removeTrack(s));
        stream.getTracks().forEach(t => this.connection.addTrack(t));
        stream.addEventListener('addtrack', this.addTrackHandler);
        stream.addEventListener('removetrack', this.removeTrackHandler);
    }

    updateReceptionConstraints(constraints: StreamConstraints) {
        this.receptionConstraints = {
            video: {
                ...this.receptionConstraints.video,
                ...constraints.video,
            },
            audio: {
                ...this.receptionConstraints.audio,
                ...constraints.audio,
            }
        };
        this.onReceptionConstraints?.(this.receptionConstraints);
    }

    updateTransmissionConstraints(constraints: StreamConstraints) {
        this.transmissionConstraints = {
            video: {
                ...this.transmissionConstraints?.video || {},
                ...constraints.video,
            },
            audio: {
                ...this.transmissionConstraints?.audio || {},
                ...constraints.audio,
            }
        };
        this.connection.getSenders()
            .forEach(sender => this.constrainSender(sender));
    }

    addIceCandidate(candidate: RTCIceCandidate) {
        this.connection.addIceCandidate(candidate);
    }

    disconnect() {
        this.connection.close();
    }

    async getOffer() {
        const offer = await this.connection.createOffer();
        await this.connection.setLocalDescription(offer);
        return offer;
    }

    async getAnswer(offer: RTCSessionDescriptionInit) {
        await this.connection.setRemoteDescription(offer);
        this.updateReceptionConstraints(this.receptionConstraints);
        const answer = await this.connection.createAnswer();
        await this.connection.setLocalDescription(answer);
        return answer;
    }

    async setAnswer(answer: RTCSessionDescriptionInit) {
        this.updateReceptionConstraints(this.receptionConstraints);
        await this.connection.setRemoteDescription(answer);
    }

    private addTrack(track: MediaStreamTrack) {
        const sender = this.connection.addTrack(track);
        this.constrainSender(sender);
    }

    private constrainSender(sender: RTCRtpSender) {
        const parameters = sender.getParameters();
        if (parameters.encodings.length) {
            Object.assign(parameters.encodings[0], this.calculateConstraints(this.transmissionConstraints, sender.track));
        }
        sender.setParameters(parameters);
    }
    
    private calculateConstraints(constraints: StreamConstraints, track: MediaStreamTrack) {
        switch(track.kind) {
            case 'audio':
                return constraints.audio;
            case 'video':
                const result: any = {
                    ...constraints.video,
                    scaleResolutionDownBy: this.scaleDownCoefficient(track, constraints.video.minSize),
                };
                result.maxBitrate = (constraints.video.minSize ** 2) * constraints.video.maxFramerate *
                    constraints.video.quality / 10;
                delete result.minSize;
                delete result.quality;
                return result;
        }
    }
    
    private scaleDownCoefficient(track: MediaStreamTrack, minSize?: number): number {
        const settings = track.getSettings();
        const currentMinSize = Math.min(settings.width, settings.height);
        const ratio = currentMinSize / minSize;
        const coefficient = Math.max(ratio, 1);
        return isFinite(coefficient) ? coefficient : 1;
    }

    private addTrackHandler = ({track}: MediaStreamTrackEvent) => {
        this.addTrack(track);
    }
    private removeTrackHandler = ({track}: MediaStreamTrackEvent) => {
        const sender = this.connection.getSenders().find(s => s.track === track);
        if (sender) {
            this.connection.removeTrack(sender);
        }
    }

}

interface WebRTCPeerInit {
    signallingPeer: SignallingPeer;
    receptionConstraints: StreamConstraints;
    onIceCandidate?: (candidate: RTCIceCandidate) => void;
    onReceptionConstraints?: (constraints: StreamConstraints) => void;
    localStream?: MediaStream;
    meta?: string;
}
