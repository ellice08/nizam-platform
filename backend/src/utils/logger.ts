import winston from 'winston';
import { env } from '../config/env.js';

const { combine, timestamp, json, colorize, simple } = winston.format;

const isProd = env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: isProd
    ? combine(timestamp(), json())
    : combine(colorize(), timestamp(), simple()),
  transports: [new winston.transports.Console()],
});

export default logger;
