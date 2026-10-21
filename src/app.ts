import "./shared/http/schemas";
import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { routes } from "./routes";
import { openApiDocument } from "./shared/docs/openapi";
import { errorHandler, notFoundHandler } from "./shared/errors/error-handler";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors({ origin: env.CORS_ORIGINS.split(",").map((o) => o.trim()) }));
app.use(express.json({ limit: "1mb" }));

app.get("/api-docs.json", (_req, res) => res.json(openApiDocument));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.use("/api/v1", routes);

app.use(notFoundHandler);
app.use(errorHandler);
