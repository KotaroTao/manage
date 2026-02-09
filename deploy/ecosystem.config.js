module.exports = {
  apps: [
    {
      name: "manage",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/home/deploy/manage",
      instances: 2,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      max_memory_restart: "500M",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/var/log/pm2/manage-error.log",
      out_file: "/var/log/pm2/manage-out.log",
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
