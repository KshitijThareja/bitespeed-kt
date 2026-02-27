import express from "express";
import dotenv from "dotenv";
import pool from "./db";
import routes from "./routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/", routes);

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

async function bootstrap() {
  try {
    const client = await pool.connect();
    console.log("------Database connected successfully----");
    client.release();

    app.listen(PORT, () => {
      const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
      console.log(`------Server running on port ${PORT}------`);
      console.log(`POST ${baseUrl}/identify`);
      console.log(`GET ${baseUrl}/health`);
    });
  } catch (err) {
    console.error("------Failed to connect to database------", err);
    process.exit(1);
  }
}

bootstrap();