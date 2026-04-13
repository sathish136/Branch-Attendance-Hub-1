import express from "express";
import admsRouter from "./routes/adms.js";

const admsApp = express();

admsApp.use(express.json());
admsApp.use(express.urlencoded({ extended: true }));
admsApp.use(express.text({ type: "*/*", limit: "10mb" }));

admsApp.use("/iclock", admsRouter);

admsApp.get("/", (_req, res) => {
  res.send("ZKTeco ADMS Server OK");
});

export default admsApp;
