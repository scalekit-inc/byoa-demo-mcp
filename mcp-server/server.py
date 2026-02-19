import os

import httpx
from dotenv import load_dotenv

from fastmcp import FastMCP
from fastmcp.server.auth.providers.scalekit import ScalekitProvider
from fastmcp.server.dependencies import get_access_token

load_dotenv(dotenv_path="../.env")

# --------------------------------
# Scalekit Auth (auto-configured
# from FASTMCP_SERVER_AUTH_SCALEKITPROVIDER_* env vars)
# --------------------------------

scalekit_auth = ScalekitProvider()

# --------------------------------
# FastMCP Server
# --------------------------------

mcp = FastMCP(
    name="TodoMCPServer",
    instructions="""
        This MCP server provides tools to manage todos in a B2B todo application.
        Available tools: list_todos, create_todo, update_todo, delete_todo.
    """,
    auth=scalekit_auth,
)

# --------------------------------
# Config for calling the B2B app
# --------------------------------

TODO_APP_BASE_URL = os.getenv("TODO_APP_BASE_URL", "http://localhost:3001")
TODO_APP_API_KEY = os.getenv("TODO_APP_API_KEY", "demo-api-key-12345")


def _get_user_id() -> str:
    """Extract user identity from the Scalekit access token."""
    token = get_access_token()
    if token is None:
        raise ValueError("No access token — authentication required")
    # Use the 'sub' claim from the Scalekit JWT as the user identifier.
    # In production you'd map this to your internal user directory.
    return token.claims.get("sub", "1")


async def _call_todo_api(
    method: str,
    path: str,
    user_id: str,
    json_data: dict | None = None,
) -> dict:
    """Make an authenticated request to the B2B Todo app."""
    headers = {
        "x-api-key": TODO_APP_API_KEY,
        "x-user-id": user_id,
    }
    async with httpx.AsyncClient() as client:
        resp = await client.request(
            method=method,
            url=f"{TODO_APP_BASE_URL}{path}",
            headers=headers,
            json=json_data,
        )
        resp.raise_for_status()
        return resp.json()


# --------------------------------
# MCP Tools
# --------------------------------


@mcp.tool
async def list_todos() -> dict:
    """List all todos for the authenticated user."""
    user_id = _get_user_id()
    return await _call_todo_api("GET", "/api/todos", user_id)


@mcp.tool
async def create_todo(title: str) -> dict:
    """Create a new todo item.

    Args:
        title: The title of the todo item.
    """
    user_id = _get_user_id()
    return await _call_todo_api("POST", "/api/todos", user_id, {"title": title})


@mcp.tool
async def update_todo(
    todo_id: str,
    title: str | None = None,
    completed: bool | None = None,
) -> dict:
    """Update an existing todo item.

    Args:
        todo_id: The ID of the todo to update.
        title: New title (optional).
        completed: New completion status (optional).
    """
    user_id = _get_user_id()
    data = {}
    if title is not None:
        data["title"] = title
    if completed is not None:
        data["completed"] = completed
    return await _call_todo_api("PUT", f"/api/todos/{todo_id}", user_id, data)


@mcp.tool
async def delete_todo(todo_id: str) -> dict:
    """Delete a todo item.

    Args:
        todo_id: The ID of the todo to delete.
    """
    user_id = _get_user_id()
    return await _call_todo_api("DELETE", f"/api/todos/{todo_id}", user_id)


# --------------------------------
# Run
# --------------------------------

if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
