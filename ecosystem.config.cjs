/**
 * PM2 process definitions.
 *
 * Start everything:   pm2 start ecosystem.config.cjs
 * Stop everything:    pm2 stop all
 * Status:             pm2 status
 * Live logs:          pm2 logs
 * Logs for one app:   pm2 logs radio-scheduler
 *
 * Survive reboots (run once after first `pm2 start`):
 *   pm2 save && pm2 startup
 *   (then run the `sudo env ...` command it prints)
 */
module.exports = {
  apps: [
    {
      name:         'app-server',
      script:       'server.js',
      cwd:          __dirname,
      interpreter:  'node',
      restart_delay: 3000,
      max_restarts:  10,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name:         'radio-scheduler',
      script:       'business_modules/recording/input/start-scheduler.js',
      cwd:          __dirname,
      interpreter:  'node',
      restart_delay: 5000,   // wait 5s before restarting on crash
      max_restarts:  20,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
