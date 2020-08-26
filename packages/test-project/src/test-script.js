const { WRTConf } = require('@wrtconf/client');

function createVideo(id) {
    const video = document.createElement('video');
    video.autoplay = true;
    video.id = id;
    document.body.append(video);
    return video;
}

navigator.mediaDevices.getUserMedia({audio: true, video: {
    sampleRate: 5,
}}).then(stream => {
    const conf = new WRTConf('ws://localhost:8080/wrtconf', stream);
    console.log(conf);

    conf.clients$.subscribe(clients => clients.forEach(client => {
        if (client.stream) {
            const id = 'a' + client.id;
            const video = document.querySelector(`#${id}`) ||
                createVideo(id);
            video.srcObject = client.stream;
        }
    }));
});