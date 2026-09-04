import qrcode from 'qrcode-terminal';
import os from 'os';

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const url = `http://${getLocalIp()}:5173`;

// Pequeno atraso para garantir que o Vite já tenha subido
setTimeout(() => {
  console.log('\n\x1b[32m%s\x1b[0m', '--- SCANNEIE PARA ABRIR NO CELULAR ---');
  qrcode.generate(url, { small: true });
  console.log('\x1b[36m%s\x1b[0m', `Link: ${url}`);
  console.log('\x1b[33m%s\x1b[0m', 'Nota: Use a câmera do celular (abrirá no navegador).\n');
}, 2000);
