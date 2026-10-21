import winston from "winston";
import { env } from "../config/env";

const transports: winston.transport[] = [new winston.transports.Console({ silent: env.NODE_ENV === "test" })];

if (env.NODE_ENV !== "test") {
  transports.push(new winston.transports.File({ filename: `logs/${new Date().toISOString().slice(0, 10)}-api.log` }));
}

export const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
  transports,
});
