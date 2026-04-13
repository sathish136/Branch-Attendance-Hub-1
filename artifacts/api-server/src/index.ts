import http from "http";
import app from "./app";
import admsApp from "./adms-server";

const port = Number(process.env["PORT"]) || 3000;
const admsPort = 3333;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

const admsServer = http.createServer(admsApp);
admsServer.listen(admsPort, () => {
  console.log(`ADMS (ZKTeco Push) server listening on port ${admsPort}`);
});
