// server/index.js
//
// Entrypoint for the single Render Web Service: it serves the built frontend
// (dist/) and the chat API from one process. The OpenAI key stays here on the
// server and never reaches the browser.
//
// Everything this file used to hold now lives beside it — see
// docs/RESTRUCTURE.md for the layout. What is left is the two lines that
// cannot live anywhere else: build the app, and listen.

import { createApp } from "./app/createApp.js";

const app = createApp();
const port = process.env.PORT || 3000;

app.listen(port, () => console.log(`Server listening on ${port}`));
