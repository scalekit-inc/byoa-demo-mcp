const express = require("express");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const { v4: uuidv4 } = require("uuid");
const { Scalekit } = require("@scalekit-sdk/node");
require("dotenv").config({ path: "../.env" });

const app = express();
const PORT = process.env.TODO_APP_PORT || 3001;
const API_KEY = process.env.TODO_APP_API_KEY || "demo-api-key-12345";

// -----------------------
// Scalekit SDK (for BYOA)
// -----------------------
// Initialized lazily to avoid crashing on startup with placeholder credentials.

let _scalekit = null;
function getScalekit() {
  if (!_scalekit) {
    _scalekit = new Scalekit(
      process.env.SCALEKIT_ENVIRONMENT_URL,
      process.env.SCALEKIT_CLIENT_ID,
      process.env.SCALEKIT_CLIENT_SECRET
    );
  }
  return _scalekit;
}
const SCALEKIT_CONNECTION_ID = process.env.SCALEKIT_CONNECTION_ID;
const SCALEKIT_ENVIRONMENT_URL = process.env.SCALEKIT_ENVIRONMENT_URL;

// ---------------------
// In-memory data stores
// ---------------------

const users = [
  { id: "1", username: "alice", password: "password123", name: "Alice Smith", email: "alice@example.com" },
  { id: "2", username: "bob", password: "password456", name: "Bob Jones", email: "bob@example.com" },
];

const todos = [
  { id: "todo-1", title: "Review Q4 report", completed: false, userId: "1" },
  {
    id: "todo-2",
    title: "Update deployment docs",
    completed: false,
    userId: "1",
  },
  { id: "todo-3", title: "Fix login bug", completed: true, userId: "2" },
];

// ----------
// Middleware
// ----------

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "keyboard-cat-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// -------------------
// Passport.js config
// -------------------

passport.use(
  new LocalStrategy((username, password, done) => {
    const user = users.find(
      (u) => u.username === username && u.password === password
    );
    if (!user) return done(null, false, { message: "Invalid credentials" });
    return done(null, user);
  })
);

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser((id, done) => {
  const user = users.find((u) => u.id === id);
  done(null, user || null);
});

// ---------------
// Auth middleware
// ---------------

function ensureAuth(req, res, next) {
  // Option 1: API key auth (used by the MCP server)
  const apiKey = req.headers["x-api-key"];
  if (apiKey) {
    if (apiKey !== API_KEY) {
      return res.status(401).json({ error: "Invalid API key" });
    }
    req.userId = req.headers["x-user-id"] || "1";
    return next();
  }

  // Option 2: Passport session auth (used by browsers)
  if (req.isAuthenticated()) {
    req.userId = req.user.id;
    return next();
  }

  return res.status(401).json({ error: "Authentication required" });
}

// ------------
// Auth routes
// ------------

app.post("/auth/login", passport.authenticate("local"), (req, res) => {
  res.json({ message: "Logged in", user: { id: req.user.id, name: req.user.name } });
});

app.post("/auth/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.json({ message: "Logged out" });
  });
});

// ------------------------------------------
// Scalekit BYOA: "Use your own auth" routes
// ------------------------------------------

// Scalekit redirects users here with login_request_id & state.
// We show a login form so the user can authenticate via passport.js.
app.get("/auth/mcp-login", (req, res) => {
  const { login_request_id, state } = req.query;

  if (!login_request_id || !state) {
    return res.status(400).send("Missing login_request_id or state parameter.");
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Todo App - Sign In</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .card { background: white; padding: 2.5rem; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); width: 100%; max-width: 400px; }
        h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #111; }
        p { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }
        label { display: block; font-weight: 500; margin-bottom: 0.3rem; color: #333; font-size: 0.9rem; }
        input[type="text"], input[type="password"] { width: 100%; padding: 0.65rem 0.75rem; border: 1px solid #ddd; border-radius: 6px; font-size: 1rem; margin-bottom: 1rem; }
        input:focus { outline: none; border-color: #0066ff; box-shadow: 0 0 0 3px rgba(0,102,255,0.1); }
        button { width: 100%; padding: 0.75rem; background: #0066ff; color: white; border: none; border-radius: 6px; font-size: 1rem; font-weight: 500; cursor: pointer; }
        button:hover { background: #0052cc; }
        .hint { text-align: center; margin-top: 1rem; color: #999; font-size: 0.8rem; }
        .error { background: #fef2f2; color: #dc2626; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem; display: none; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Sign in to Todo App</h1>
        <p>Authenticate to grant access to your MCP tools.</p>
        <div class="error" id="error"></div>
        <form method="POST" action="/auth/mcp-login-callback">
          <input type="hidden" name="login_request_id" value="${login_request_id}" />
          <input type="hidden" name="state" value="${state}" />
          <label for="username">Username</label>
          <input type="text" id="username" name="username" placeholder="alice" required />
          <label for="password">Password</label>
          <input type="password" id="password" name="password" placeholder="password123" required />
          <button type="submit">Sign In</button>
        </form>
        <div class="hint">Demo users: alice / password123, bob / password456</div>
      </div>
    </body>
    </html>
  `);
});

// Form POSTs here. We authenticate with passport, notify Scalekit, and redirect back.
app.post("/auth/mcp-login-callback", (req, res, next) => {
  const { login_request_id, state } = req.body;

  if (!login_request_id || !state) {
    return res.status(400).send("Missing login_request_id or state.");
  }

  // Authenticate with passport.js LocalStrategy
  passport.authenticate("local", async (err, user, info) => {
    if (err) return next(err);

    if (!user) {
      // Authentication failed — show the login form again with an error
      return res.send(`
        <!DOCTYPE html>
        <html><head><title>Login Failed</title>
        <style>
          body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5; }
          .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); text-align: center; max-width: 400px; }
          .error { color: #dc2626; margin-bottom: 1rem; }
          a { color: #0066ff; text-decoration: none; }
        </style></head>
        <body><div class="card">
          <p class="error">Invalid username or password.</p>
          <a href="/auth/mcp-login?login_request_id=${encodeURIComponent(login_request_id)}&state=${encodeURIComponent(state)}">Try again</a>
        </div></body></html>
      `);
    }

    try {
      // POST authenticated user details to Scalekit
      await getScalekit().auth.updateLoginUserDetails(
        SCALEKIT_CONNECTION_ID,
        login_request_id,
        {
          sub: user.id,
          email: user.email,
        }
      );

      // Redirect the user back to Scalekit to complete the OAuth flow
      const redirectUrl =
        `${SCALEKIT_ENVIRONMENT_URL}/sso/v1/connections/${SCALEKIT_CONNECTION_ID}/partner:callback?state=${encodeURIComponent(state)}`;
      return res.redirect(redirectUrl);
    } catch (scalekitErr) {
      console.error("Scalekit BYOA error:", scalekitErr);
      return res.status(500).send("Failed to complete authentication with Scalekit.");
    }
  })(req, res, next);
});

// ------------
// CRUD routes
// ------------

// List todos
app.get("/api/todos", ensureAuth, (req, res) => {
  const userTodos = todos.filter((t) => t.userId === req.userId);
  res.json({ todos: userTodos });
});

// Create todo
app.post("/api/todos", ensureAuth, (req, res) => {
  const { title } = req.body;
  if (!title) {
    return res.status(400).json({ error: "Title is required" });
  }
  const todo = {
    id: `todo-${uuidv4().slice(0, 8)}`,
    title,
    completed: false,
    userId: req.userId,
  };
  todos.push(todo);
  res.status(201).json({ todo });
});

// Update todo
app.put("/api/todos/:id", ensureAuth, (req, res) => {
  const todo = todos.find(
    (t) => t.id === req.params.id && t.userId === req.userId
  );
  if (!todo) {
    return res.status(404).json({ error: "Todo not found" });
  }
  if (req.body.title !== undefined) todo.title = req.body.title;
  if (req.body.completed !== undefined) todo.completed = req.body.completed;
  res.json({ todo });
});

// Delete todo
app.delete("/api/todos/:id", ensureAuth, (req, res) => {
  const index = todos.findIndex(
    (t) => t.id === req.params.id && t.userId === req.userId
  );
  if (index === -1) {
    return res.status(404).json({ error: "Todo not found" });
  }
  const [deleted] = todos.splice(index, 1);
  res.json({ deleted });
});

// ------
// Start
// ------

app.listen(PORT, () => {
  console.log(`Todo App running on http://localhost:${PORT}`);
  console.log(`Seeded users: alice/password123, bob/password456`);
});
