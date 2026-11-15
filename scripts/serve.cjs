const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8765);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const address = `http://127.0.0.1:${port}`;
const autoOpen = process.argv.includes('--open');
function openGame() {
  if (!autoOpen) return;
  const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', address], {
    stdio: 'ignore', windowsHide: true,
  });
  browser.on('error', () => console.log(`Открой игру вручную: ${address}`));
}
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/world.js', ['world.js', 'text/javascript; charset=utf-8']],
]);

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const sfx = /^\/sfx\/([a-z_]+_[1-4])\.mp3$/.exec(pathname);   // звуки ElevenLabs: только имена из папки sfx
  const file = sfx ? [path.join('sfx', `${sfx[1]}.mp3`), 'audio/mpeg'] : files.get(pathname);
  if (!file) {
    res.writeHead(404);
    res.end();
    return;
  }
  fs.readFile(path.join(root, file[0]), (error, data) => {
    if (error) {
      res.writeHead(sfx && error.code === 'ENOENT' ? 404 : 500);
      res.end('Не удалось прочитать файл игры.');
      return;
    }
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': sfx ? 'max-age=86400' : 'no-store' });
    res.end(data);
  });
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && autoOpen) {
    // Reuse an existing game server, but never mistake another app for this game.
    const request = http.get(address, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (body.includes('<title>БИМ БИМ БАМ БАМ</title>')) openGame();
        else { console.error(`Порт ${port} занят другой программой.`); process.exitCode = 1; }
      });
    });
    request.setTimeout(3000, () => request.destroy(new Error('timeout')));
    request.on('error', () => { console.error(`Не удалось открыть ${address}`); process.exitCode = 1; });
  } else {
    console.error(`Не удалось запустить игру: ${error.message}`);
    process.exitCode = 1;
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log(`БИМ БИМ БАМ БАМ: ${address}`);
  openGame();
});
