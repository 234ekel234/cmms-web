// pm2 process definition for the FMI HANNI web client on the droplet.
// Usage (from the repo root, after the first `npm run deploy` has built a release):
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 save
//
// It runs `releases/current/server.js` — Next's standalone server, copied out of
// the build by deploy/deploy.sh. `current` is a symlink to the release in use,
// so a deploy (or a rollback) is "point the link, restart"; the build itself
// never touches the files the running server is reading.
//
// Listens on 127.0.0.1 only: Nginx is the public face (deploy/nginx-hanni.conf).
// The API keeps port 3000.
// A pm2 config is CommonJS by contract; pm2 cannot load it as a module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");

const root = path.resolve(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "hanni-web",
      cwd: path.join(root, "releases", "current"),
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "350M",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
        HOSTNAME: "127.0.0.1",
      },
    },
  ],
};
