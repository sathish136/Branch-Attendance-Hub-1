import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes/index.js";
import admsRouter from "./routes/adms.js";

const app: Express = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: "*/*", limit: "10mb" }));
app.use(cookieParser());

app.use("/iclock", admsRouter);
app.use("/api", router);

export default app;
