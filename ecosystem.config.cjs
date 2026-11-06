/**
 * PM2 Ecosystem Configuration for Fire Safety ERP
 *
 * Runs both the HTTP API server and background outbox worker simultaneously.
 *
 * Usage:
 *   Production: pm2 start ecosystem.config.cjs --env production
 *   Status:     pm2 status
 *   Logs:       pm2 logs
 *   Stop all:   pm2 stop ecosystem.config.cjs
 *   Restart:    pm2 restart ecosystem.config.cjs --env production
 */

module.exports = {
  apps: [
    {
      name: "fire-safety-api",
      cwd: "./server",
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "1G",
      // Allow 12s for graceful shutdown (server has 10s drain timeout before forced close)
      kill_timeout: 12000,
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
      out_file: "../logs/api-out.log",
      error_file: "../logs/api-error.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "fire-safety-worker",
      cwd: "./server",
      script: "dist/worker.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "512M",
      // Allow 12s for in-flight outbox job completion (worker has 10s grace timeout)
      kill_timeout: 12000,
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
      out_file: "../logs/worker-out.log",
      error_file: "../logs/worker-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};

