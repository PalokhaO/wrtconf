import { SignallingPeer } from "@wrtconf/models";

export class WebRTCPeer {
    signallingPeer: SignallingPeer;
    transmissionConstraints: Constraints;

    localStream = new MediaStream();
    remoteStream = new MediaStream();
    connection = new RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}]});
    

    constructor(init: WebRTCPeerInit) {
        this.signallingPeer = init.signallingPeer;
        this.transmissionConstraints = init.transmissionConstraints;
        this.connection.addEventListener('icecandidate', e => {
            if (e.candidate) {
                init.onIceCandidate(e.candidate);
            }
        });

        this.connection.ontrack = ({track}) => this.remoteStream.addTrack(track);
        if (init.localStream) {
            this.updateLocalStream(init.localStream);
        }
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

    updateTransmissionConstraints(constraints: Constraints) {
        this.transmissionConstraints = {
            video: {
                ...this.transmissionConstraints.video,
                ...constraints.video,
            },
            audio: {
                ...this.transmissionConstraints.audio,
                ...constraints.audio,
            }
        };
        this.connection.getSenders()
            .forEach(sender => this.constrainSender(sender));
    }

    async getOffer() {
        const offer = await this.connection.createOffer();
        await this.connection.setLocalDescription(offer);
        return offer;
    }

    async getAnswer(offer: RTCSessionDescriptionInit) {
        await this.connection.setRemoteDescription(offer);
        const answer = await this.connection.createAnswer();
        await this.connection.setLocalDescription(answer);
        return answer;
    }

    async setAnswer(answer: RTCSessionDescriptionInit) {
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
    transmissionConstraints: Constraints;
    onIceCandidate: (candidate: RTCIceCandidate) => void;
    localStream?: MediaStream;
}

export interface Constraints {
    video?: {
        maxBitrate?: number;
        maxFramerate?: number;
        minSize?: number;
    };
    audio?: {
        maxBitrate?: number;
    };
}