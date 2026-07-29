import winston from 'winston';
import env from './env';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`),
);

const prodFormat = winston.format.combine(winston.format.timestamp(), winston.format.json());

const transports = [
  new winston.transports.Console({
    format: env.NODE_ENV === 'development' ? devFormat : prodFormat,
  }),
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: prodFormat,
  }),
  new winston.transports.File({
    filename: 'logs/all.log',
    format: prodFormat,
  }),
];

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  levels,
  format: env.NODE_ENV === 'development' ? devFormat : prodFormat,
  transports,
});

export default logger;
