module.exports = {
  apps: [
    {
      name: 'web-chat-app',
      script: 'server.js',
      instances: 1,
      autorestart: true,      // 크래시 시 자동 재시작
      watch: false,           // 프로덕션에서는 파일 감시 비활성화
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        HOST: '0.0.0.0',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '0.0.0.0',
      },
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
