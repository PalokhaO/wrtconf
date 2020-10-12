const { WRTConf } = require('@wrtconf/client');

function createVideo(id) {
    const video = document.createElement('video');
    video.autoplay = true;
    video.id = id;
    document.body.append(video);
    return video;
}

navigator.mediaDevices.getUserMedia({audio: true, video: true}).then(stream => {
    const url = `${(location.protocol === 'https:' ? 'wss:' : 'ws:')}//${location.host}/wrtconf`;
    const conf = new WRTConf({
        url,
        source: stream,
        defaultConstraints: {
            video: {
                quality: 1,
            }
        }
    });
    console.log(conf);

    conf.addEventListener('peer', ({data: peer}) => {
        const id = 'a' + peer.signallingPeer.id;
        const video = createVideo(id);
        video.srcObject = peer.remoteStream;
        updateSize();
    });
    conf.addEventListener('removepeer', ({data: peer}) => {
        document.querySelector('#a' + peer.signallingPeer.id)
            ?.remove();
        updateSize();
    });
    conf.addEventListener('metaupdate', ({data: peer}) => {
        console.log("Meta updated for peer: ", peer);
    });

    function updateSize() {
        const minSizeConstraint = 720 / conf.peers.length;
        if (minSizeConstraint < 720) {
            conf.updateReceptionConstraints({video: {minSize: minSizeConstraint}}, true);
        }
    }
});