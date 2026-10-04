// pm2 na VPS: usa o Node 24 de /opt/node24 (o Node do sistema é mais antigo e serve aos outros apps)
module.exports = {
  apps: [
    {
      name: 'wpp-bicicleta',
      script: 'server.js',
      cwd: __dirname,
      interpreter: '/opt/node24/bin/node',
      node_args: '--env-file-if-exists=.env --no-warnings',
      max_memory_restart: '300M',
    },
  ],
};
