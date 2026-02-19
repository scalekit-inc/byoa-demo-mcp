# FastMCP BYOA Demo

A demo showing how to add **Scalekit MCP Auth** to a **FastMCP** server that wraps an existing **B2B app** (Express.js + Passport.js) as MCP tools.

This demonstrates the **Bring Your Own Auth (BYOA)** pattern: your B2B app keeps its own authentication (Passport.js), while Scalekit handles OAuth 2.1 for MCP clients connecting to your tools.

## Architecture

```
MCP Client (Claude Desktop, etc.)
    |
    | 1. OAuth 2.1 /authorize
    v
Scalekit (Authorization Server)
    |
    | 2. Redirect to B2B app login with login_request_id & state
    v
B2B Todo App (Express.js, port 3001)
    |  3. User authenticates via Passport.js (HTML login form)
    |  4. POST user details to Scalekit via Node SDK
    |  5. Redirect user back to Scalekit callback with state
    v
Scalekit (completes consent + token exchange)
    |
    | 6. Access token issued to MCP client
    v
FastMCP Server (Python, port 8000)
    |  7. Validates Scalekit JWT, extracts user identity
    |  8. Calls B2B Todo App API with API key + user ID
    v
B2B Todo App (serves CRUD responses)
```

## Project Structure

```
.
├── .env                    # Configuration (you create this)
├── .gitignore
├── README.md
├── todo-app/               # B2B Todo App (Node.js/Express)
│   ├── package.json
│   └── server.js           # Passport.js auth + CRUD API + Scalekit BYOA
└── mcp-server/             # FastMCP Server (Python)
    └── server.py           # 4 MCP tools + ScalekitProvider auth
```

## Prerequisites

- **Node.js** v18+ ([nodejs.org](https://nodejs.org/))
- **Python** 3.9+ ([python.org](https://www.python.org/))
- A **Scalekit** account ([scalekit.com](https://www.scalekit.com/))

## Setup

### 1. Clone the repo

```bash
git clone <your-repo-url>
cd "FastMCP BYOA Demo"
```

### 2. Install Python dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install fastmcp httpx python-dotenv
```

### 3. Install Node.js dependencies

```bash
cd todo-app
npm install
cd ..
```

### 4. Create the `.env` file

Create a `.env` file in the project root with the following:

```env
# ── Scalekit MCP Auth (read by FastMCP's ScalekitProvider) ──
FASTMCP_SERVER_AUTH_SCALEKITPROVIDER_ENVIRONMENT_URL=https://<your-env>.scalekit.dev
FASTMCP_SERVER_AUTH_SCALEKITPROVIDER_RESOURCE_ID=<your-resource-id>
FASTMCP_SERVER_AUTH_SCALEKITPROVIDER_BASE_URL=http://localhost:8000

# ── Scalekit SDK Credentials (used by the B2B app for BYOA) ──
SCALEKIT_ENVIRONMENT_URL=https://<your-env>.scalekit.dev
SCALEKIT_CLIENT_ID=<your-client-id>
SCALEKIT_CLIENT_SECRET=<your-client-secret>
SCALEKIT_CONNECTION_ID=<your-connection-id>

# ── B2B Todo App ──
TODO_APP_PORT=3001
TODO_APP_BASE_URL=http://localhost:3001
TODO_APP_API_KEY=demo-api-key-12345
SESSION_SECRET=keyboard-cat-secret

# ── MCP Server ──
MCP_SERVER_PORT=8000
```

You'll fill in the Scalekit values in the next step.

### 5. Configure the Scalekit Dashboard

1. **Register an MCP Server**
   - Go to [app.scalekit.com](https://app.scalekit.com/) and navigate to **MCP Servers**
   - Register a new MCP Server with URL: `http://localhost:8000`
   - Note the **Resource ID** (starts with `res_...`)

2. **Create a custom auth connection**
   - In the MCP Server settings, under authentication, choose **"Use your own authentication service"**
   - Set the **Login Endpoint URL** to: `http://localhost:3001/auth/mcp-login`
   - Note the **Connection ID** from the User Info Post URL (starts with `conn_...`)

3. **Get API credentials**
   - Go to **Settings > API Credentials**
   - Note the **Client ID** (starts with `skc_...`) and **Client Secret**

4. **Update `.env`** with all the values you noted:
   - `FASTMCP_SERVER_AUTH_SCALEKITPROVIDER_ENVIRONMENT_URL` and `SCALEKIT_ENVIRONMENT_URL` = your Scalekit environment URL
   - `FASTMCP_SERVER_AUTH_SCALEKITPROVIDER_RESOURCE_ID` = Resource ID from step 1
   - `SCALEKIT_CLIENT_ID` = Client ID from step 3
   - `SCALEKIT_CLIENT_SECRET` = Client Secret from step 3
   - `SCALEKIT_CONNECTION_ID` = Connection ID from step 2

## Running the Demo

Open **two terminals**:

**Terminal 1 — B2B Todo App (port 3001):**
```bash
cd todo-app
node server.js
```
Output: `Todo App running on http://localhost:3001`

**Terminal 2 — FastMCP Server (port 8000):**
```bash
cd mcp-server
../.venv/bin/python server.py
```
Output: `Uvicorn running on http://0.0.0.0:8000`

## Connecting an MCP Client

### Claude Desktop

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "todo": {
      "url": "http://localhost:8000/mcp"
    }
  }
}
```

Restart Claude Desktop. When it connects:
1. A browser window opens for Scalekit OAuth
2. Scalekit redirects to the Todo app's login form
3. Enter credentials (see **Demo Users** below)
4. Authentication completes and tools become available
5. Ask Claude: *"List my todos"* or *"Create a todo called Review PR"*

## Demo Users

| Username | Password      | Email              |
|----------|---------------|--------------------|
| alice    | password123   | alice@example.com  |
| bob      | password456   | bob@example.com    |

Alice has 2 pre-seeded todos. Bob has 1.

## MCP Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_todos` | *(none)* | List all todos for the authenticated user |
| `create_todo` | `title` (string) | Create a new todo item |
| `update_todo` | `todo_id` (string), `title` (string, optional), `completed` (bool, optional) | Update an existing todo |
| `delete_todo` | `todo_id` (string) | Delete a todo item |

## Testing the Todo API Directly

You can test the B2B app's REST API independently using API key auth:

```bash
# List todos for Alice (user 1)
curl 'http://localhost:3001/api/todos' \
  -H 'x-api-key: demo-api-key-12345' \
  -H 'x-user-id: 1'

# Create a todo
curl -X POST 'http://localhost:3001/api/todos' \
  -H 'x-api-key: demo-api-key-12345' \
  -H 'x-user-id: 1' \
  -H 'Content-Type: application/json' \
  -d '{"title": "Test from curl"}'

# Update a todo
curl -X PUT 'http://localhost:3001/api/todos/todo-1' \
  -H 'x-api-key: demo-api-key-12345' \
  -H 'x-user-id: 1' \
  -H 'Content-Type: application/json' \
  -d '{"completed": true}'

# Delete a todo
curl -X DELETE 'http://localhost:3001/api/todos/todo-1' \
  -H 'x-api-key: demo-api-key-12345' \
  -H 'x-user-id: 1'
```

## How the Auth Flow Works

When an MCP client connects to the FastMCP server, the following happens:

1. **MCP client** discovers the server at `http://localhost:8000/mcp` and fetches `/.well-known/oauth-protected-resource` to find Scalekit as the authorization server.

2. **MCP client** initiates OAuth 2.1 with Scalekit (authorization code flow + PKCE).

3. **Scalekit** redirects the user's browser to the B2B Todo app's login endpoint: `http://localhost:3001/auth/mcp-login?login_request_id=...&state=...`

4. **Todo app** renders a login form. The user enters their username and password.

5. **Passport.js** authenticates the user using its LocalStrategy (same auth the B2B app uses for its own users).

6. **Todo app** calls `scalekit.auth.updateLoginUserDetails()` via the Scalekit Node SDK to POST the authenticated user's `sub` and `email` to Scalekit.

7. **Todo app** redirects the user back to Scalekit's callback URL with the `state` parameter.

8. **Scalekit** completes consent and token exchange, issuing a JWT access token to the MCP client.

9. **MCP client** includes the JWT as a Bearer token in all subsequent MCP requests.

10. **FastMCP server** validates the JWT using Scalekit's JWKS endpoint (handled automatically by `ScalekitProvider`), extracts the user identity from the `sub` claim, and calls the Todo app's REST API with API key auth on behalf of that user.

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| B2B Todo App | Express.js + Passport.js | REST API with session-based auth |
| MCP Server | FastMCP (Python) | Exposes Todo APIs as MCP tools |
| Auth Layer | Scalekit MCP Auth | OAuth 2.1 for MCP clients (BYOA) |
| MCP Client | Claude Desktop (or any MCP client) | Connects to tools via MCP protocol |
