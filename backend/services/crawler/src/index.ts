import express from "express";
import { config } from "./config";
import routes from "./routes";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/", routes);

app.listen(config.port, () => {
  console.log(`crawler service listening on :${config.port}`);
});