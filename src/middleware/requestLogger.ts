import pino from 'pino';
import pinoHttp from 'pino-http';
import { RequestHandler } from 'express';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export const requestLogger = pinoHttp({
  logger,
  serializers: { err: pino.stdSerializers.err },
}) as unknown as RequestHandler;

export default logger;
