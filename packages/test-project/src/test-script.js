const { WRTConf } = require('@wrtconf/client');

function createVideo(id) {
    const video = document.createElement('video');
    video.autoplay = true;
    video.id = id;
    document.body.append(video);
    return video;
}

navigator.mediaDevices.getDisplayMedia({audio: true, video: true}).then(stream => {
    const url = `${(location.protocol === 'https:' ? 'wss:' : 'ws:')}//${location.host}/wrtconf`;
    const conf = new WRTConf(url, {
        source: stream,
    });
    console.log(conf);

    conf.peers$.subscribe(peers => peers.forEach(peer => {
        if (peer.remoteStream) {
            const id = 'a' + peer.signallingPeer.id;
            const video = document.querySelector(`#${id}`) ||
                createVideo(id);
            video.srcObject = peer.remoteStream;
        }
    }));
});