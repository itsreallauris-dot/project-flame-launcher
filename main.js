
const {
  app,
  BrowserWindow,
  shell,
  ipcMain
} = require("electron");

const path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");

const CLIENT_ID = "1574295793932697651";
const REDIRECT_URI = "http://127.0.0.1:53682/callback";

function createWindow() {
  const imagePath = path.join(__dirname, "cover.png");
  const htmlPath = path.join(__dirname, "index.html");

  console.log("--------------------------------");
  console.log("PROJECT FLAME DIAGNOSTICS");
  console.log("Project folder:", __dirname);
  console.log("HTML exists:", fs.existsSync(htmlPath));
  console.log("Cover exists:", fs.existsSync(imagePath));
  console.log("Cover path:", imagePath);
  console.log("--------------------------------");

const win = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    title: "Project Flame",
    backgroundColor: "#06111e",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
});

  win.loadFile(htmlPath);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
}

// Discord login
ipcMain.handle("discord-login", async () => {
  const verifier = crypto.randomBytes(32).toString("base64url");

  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");

  const state = crypto.randomBytes(32).toString("hex");

  const authUrl = new URL("https://discord.com/oauth2/authorize");

  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", "identify");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return new Promise((resolve, reject) => {
    let finished = false;

    const server = http.createServer(async (req, res) => {
      if (finished) return;

      const callbackUrl = new URL(
        req.url,
        REDIRECT_URI
      );

      if (callbackUrl.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const returnedState = callbackUrl.searchParams.get("state");
      const code = callbackUrl.searchParams.get("code");
      const error = callbackUrl.searchParams.get("error");
      const issuer = callbackUrl.searchParams.get("iss");

      if (returnedState !== state) {
        res.writeHead(400);
        res.end("Invalid login state. Please try again.");
        finished = true;
        server.close();
        reject(new Error("Discord login state did not match."));
        return;
      }

      if (error || !code || issuer !== "https://discord.com") {
        res.writeHead(400);
        res.end("Discord sign-in was cancelled or failed.");
        finished = true;
        server.close();
        reject(new Error(error || "Invalid Discord response."));
        return;
      }

      try {
        const tokenResponse = await fetch(
          "https://discord.com/api/v10/oauth2/token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
              client_id: CLIENT_ID,
              grant_type: "authorization_code",
              code,
              redirect_uri: REDIRECT_URI,
              code_verifier: verifier
            })
          }
        );

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
          throw new Error(
            tokenData.error_description || "Token exchange failed."
          );
        }

        const userResponse = await fetch(
          "https://discord.com/api/v10/users/@me",
          {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`
            }
          }
        );

        const user = await userResponse.json();

        if (!userResponse.ok) {
          throw new Error("Could not retrieve Discord profile.");
        }

        finished = true;

        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8"
        });

        res.end(`
          <html>
            <body style="background:#06111e;color:white;font-family:Arial;text-align:center;padding:60px">
              <h1>PROJECT FLAME</h1>
              <h2>Discord login successful!</h2>
              <p>You can return to Project Flame.</p>
            </body>
          </html>
        `);

        server.close();

        const savedUser = {
  username: user.username,
  globalName: user.global_name || user.username,
  id: user.id
};

const sessionPath = path.join(
  app.getPath("userData"),
  "session.json"
);

fs.writeFileSync(
  sessionPath,
  JSON.stringify(savedUser, null, 2)
);

resolve(savedUser);
      } catch (err) {
        finished = true;

        res.writeHead(500, {
          "Content-Type": "text/plain"
        });

        res.end("Discord login failed. Please try again.");

        server.close();
        reject(err);
      }
    });
    server.on("error", reject);

    server.listen(53682, "127.0.0.1", async () => {
      try {
        await shell.openExternal(authUrl.toString());
      } catch (err) {
        server.close();
        reject(err);
      }
    });
  });
});
// CHECK SAVED LOGIN
ipcMain.handle("get-session", () => {
  const sessionPath = path.join(
    app.getPath("userData"),
    "session.json"
  );

  if (!fs.existsSync(sessionPath)) {
    return null;
  }

  try {
    return JSON.parse(
      fs.readFileSync(sessionPath, "utf8")
    );
  } catch {
    return null;
  }
});

// LOG OUT
ipcMain.handle("discord-logout", () => {
  const sessionPath = path.join(
    app.getPath("userData"),
    "session.json"
  );

  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
  }

  return true;
});
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
