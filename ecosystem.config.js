module.exports = {
  apps: [
    {
      name: "201ful",
      script: "./server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "256M",
      watch: false,
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: 3001,
        HOST: "0.0.0.0",
        DB_HOST: "127.0.0.1",
        DB_PORT: "3306",
        DB_USER: "root",
        DB_PASSWORD: "",
        DB_NAME: "201ful"
      }
    }
  ]
};
