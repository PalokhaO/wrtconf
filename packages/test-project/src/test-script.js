const { WRTConf } = require('@wrtconf/client');

navigator.mediaDevices.getUserMedia({audio: true}).then(stream => {
    const conf = new WRTConf('ws://localhost:8080/wrtconf', stream);

    conf.clients$.subscribe(console.log);
    console.log(conf);
});