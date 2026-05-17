#!/usr/bin/env python3
"""Tiny self-hosted mem0-compatible memory service for ClawForge Brev runtimes."""
from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DATA_DIR = Path(os.environ.get("MEM0_DATA_DIR", ".runtime/mem0"))
DB_PATH = DATA_DIR / "memories.sqlite3"
API_KEY = os.environ.get("MEM0_API_KEY", "")
NEMOTRON_MODEL = os.environ.get("NVIDIA_NEMOTRON_MODEL") or os.environ.get("CLAWFORGE_MODEL") or "nvidia/llama-3.1-nemotron-nano-8b-v1"
EMBED_MODEL = os.environ.get("NEMOTRON_EMBEDDING_MODEL", "nvidia/nv-embedqa-e5-v5")

app = FastAPI(title="ClawForge mem0", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AddMemory(BaseModel):
    text: str = Field(min_length=1)
    memory_type: str = "project_fact"
    metadata: dict[str, Any] = Field(default_factory=dict)

class SearchMemory(BaseModel):
    query: str = ""
    filters: dict[str, Any] = Field(default_factory=dict)
    memory_type: str | None = None
    limit: int = 20

class UpdateMemory(BaseModel):
    text: str | None = None
    memory_type: str | None = None
    metadata: dict[str, Any] | None = None

def require_auth(authorization: str | None) -> None:
    if not API_KEY:
        return
    if authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="invalid memory API key")

def db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        create table if not exists memories (
          id text primary key,
          text text not null,
          memory_type text not null,
          metadata text not null,
          created_at text not null,
          updated_at text not null
        )
        """
    )
    conn.execute("create index if not exists idx_memories_type on memories(memory_type)")
    return conn

def row_to_memory(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "text": row["text"],
        "memory_type": row["memory_type"],
        "metadata": json.loads(row["metadata"] or "{}"),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }

def metadata_matches(metadata: dict[str, Any], filters: dict[str, Any]) -> bool:
    for key, value in filters.items():
        if value is None or value == "":
            continue
        if str(metadata.get(key, "")) != str(value):
            return False
    return True

@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "version": "0.1.0",
        "engine": "self_hosted_mem0",
        "hosted_on": "brev",
        "reasoning_model": NEMOTRON_MODEL,
        "embedding_model": EMBED_MODEL,
        "gpu_available": Path("/proc/driver/nvidia/version").exists(),
    }

@app.get("/api/routes")
def routes() -> list[str]:
    return ["POST /api/memories", "GET /api/memories", "POST /api/search", "PATCH /api/memories/{id}", "DELETE /api/memories/{id}"]

@app.post("/api/memories", status_code=201)
def add_memory(payload: AddMemory, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_auth(authorization)
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    item = {
        "id": f"mem_{uuid.uuid4().hex[:16]}",
        "text": payload.text,
        "memory_type": payload.memory_type,
        "metadata": payload.metadata,
        "created_at": now,
        "updated_at": now,
    }
    with db() as conn:
        conn.execute(
            "insert into memories (id, text, memory_type, metadata, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
            (item["id"], item["text"], item["memory_type"], json.dumps(item["metadata"]), now, now),
        )
    return item

@app.get("/api/memories")
def list_memories(request: Request, authorization: str | None = Header(default=None), limit: int = 100) -> dict[str, Any]:
    require_auth(authorization)
    filters = dict(request.query_params)
    with db() as conn:
        rows = conn.execute("select * from memories order by created_at desc limit ?", (min(limit, 500),)).fetchall()
    items = [row_to_memory(row) for row in rows]
    if filters:
        items = [item for item in items if metadata_matches(item["metadata"], filters)]
    return {"memories": items, "data": items, "results": items}

@app.post("/api/search")
def search_memory(payload: SearchMemory, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_auth(authorization)
    query = payload.query.lower().strip()
    with db() as conn:
        rows = conn.execute("select * from memories order by created_at desc limit 1000").fetchall()
    items = [row_to_memory(row) for row in rows]
    if payload.memory_type:
        items = [item for item in items if item["memory_type"] == payload.memory_type]
    if payload.filters:
        items = [item for item in items if metadata_matches(item["metadata"], payload.filters)]
    if query:
        scored = []
        terms = [term for term in query.split() if term]
        for item in items:
            text = item["text"].lower()
            score = sum(1 for term in terms if term in text)
            if query in text:
                score += 5
            if score:
                scored.append((score, item))
        items = [item for _, item in sorted(scored, key=lambda pair: pair[0], reverse=True)]
    return {"results": items[: max(1, min(payload.limit, 100))]}

@app.patch("/api/memories/{memory_id}")
def update_memory(memory_id: str, payload: UpdateMemory, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_auth(authorization)
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with db() as conn:
        row = conn.execute("select * from memories where id = ?", (memory_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="memory not found")
        current = row_to_memory(row)
        text = payload.text if payload.text is not None else current["text"]
        memory_type = payload.memory_type if payload.memory_type is not None else current["memory_type"]
        metadata = payload.metadata if payload.metadata is not None else current["metadata"]
        conn.execute(
            "update memories set text = ?, memory_type = ?, metadata = ?, updated_at = ? where id = ?",
            (text, memory_type, json.dumps(metadata), now, memory_id),
        )
    return {"id": memory_id, "text": text, "memory_type": memory_type, "metadata": metadata, "created_at": current["created_at"], "updated_at": now}

@app.delete("/api/memories/{memory_id}")
def delete_memory(memory_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_auth(authorization)
    with db() as conn:
        conn.execute("delete from memories where id = ?", (memory_id,))
    return {"ok": True, "id": memory_id}
