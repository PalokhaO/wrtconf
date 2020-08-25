const { WRTConf } = require('@wrtconf/client');

const conf = new WRTConf('ws://localhost:8080/wrtconf');

conf.message$.subscribe(console.log);
console.log(conf);