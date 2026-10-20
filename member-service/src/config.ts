export interface ServiceConfig {
  port: number;
  env: string;
  serviceKey: string;
  loanServiceUrl: string;
}

export const config: ServiceConfig = {
  port: Number(process.env.PORT) || 3003,
  env: process.env.NODE_ENV || 'development',
  serviceKey: process.env.SERVICE_KEY || 'dev-service-key',
  loanServiceUrl: process.env.LOAN_SERVICE_URL || 'http://localhost:3004',
};
