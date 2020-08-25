import express from 'express';
import pkg from '@wrtconf/server';
const { WRTConfServer } = pkg;
import browserify from 'browserify';

function streamToString (stream) {
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}
const script = streamToString(
    browserify({sourceType: 'module'})
        .add('src/test-script.js')
        .bundle()
);
const app = express();


    app.get('/', (req, res, next) => {
        script.then(script => {
            res.send(`
                <script>${script}</script>
            `);
            next();
            
        }).catch(console.error);
    })

const server = app.listen(8080);

const wrtConfServer = new WRTConfServer(server, '/wrtconf');