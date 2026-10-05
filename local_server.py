#!/usr/bin/env python3
"""PD Chat LAN server - Python standard library only.

Serves the frontend and keeps an append-only local event store. No SQLite/MySQL.
Run: python3 local_server.py
Open from another LAN device: http://<ubuntu-ip>:8000
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
from datetime import datetime, timezone
import hashlib, hmac, json, os, secrets, threading, uuid

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "local_data"
DATA.mkdir(exist_ok=True)
EVENTS = DATA / "events.jsonl"
STATE = DATA / "state.json"
USERS = DATA / "local_users.json"
LOCK = threading.RLock()

for path, default in [(STATE, {}), (USERS, {})]:
    if not path.exists():
        path.write_text(json.dumps(default, indent=2), encoding="utf-8")
EVENTS.touch(exist_ok=True)

def now(): return datetime.now(timezone.utc).isoformat()
def load_json(path, default):
    try: return json.loads(path.read_text(encoding="utf-8"))
    except Exception: return default

def save_json(path, value):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)

def password_hash(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 240000)
    return salt.hex(), digest.hex()

def append_event(event):
    event = dict(event)
    event.setdefault("id", str(uuid.uuid4()))
    event.setdefault("createdAt", now())
    event.setdefault("sync", "pending")
    with LOCK:
        with EVENTS.open("a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
    return event

def read_events():
    out=[]
    with LOCK:
        for line in EVENTS.read_text(encoding="utf-8").splitlines():
            try: out.append(json.loads(line))
            except Exception: pass
    return out

class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        clean = urlparse(path).path.lstrip("/") or "index.html"
        return str(ROOT / clean)

    def json_response(self, status, payload):
        body=json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status); self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Cache-Control","no-store"); self.send_header("Content-Length",str(len(body))); self.end_headers(); self.wfile.write(body)

    def body_json(self):
        length=int(self.headers.get("Content-Length","0") or 0)
        return json.loads(self.rfile.read(length).decode("utf-8") or "{}")

    def do_GET(self):
        path=urlparse(self.path).path
        if path=="/api/health": return self.json_response(200,{"ok":True,"mode":"local","time":now()})
        if path=="/api/events": return self.json_response(200,{"events":read_events()})
        if path=="/api/state": return self.json_response(200,load_json(STATE,{}))
        return super().do_GET()

    def do_POST(self):
        path=urlparse(self.path).path
        try: data=self.body_json()
        except Exception: return self.json_response(400,{"error":"Invalid JSON"})
        if path=="/api/events":
            if not data.get("type"): return self.json_response(400,{"error":"event type required"})
            return self.json_response(201,append_event(data))
        if path=="/api/state":
            with LOCK: save_json(STATE,data)
            return self.json_response(200,{"ok":True})
        if path=="/api/auth/provision":
            # Called only while the account has already been authenticated online.
            uid=str(data.get("uid","")).strip(); email=str(data.get("email","")).strip().lower(); password=str(data.get("password", ""))
            if not uid or not email or len(password)<6: return self.json_response(400,{"error":"uid, email and password required"})
            salt,digest=password_hash(password); users=load_json(USERS,{})
            users[email]={"uid":uid,"email":email,"name":data.get("name",email.split("@")[0]),"salt":salt,"hash":digest,"updatedAt":now()}
            with LOCK: save_json(USERS,users)
            return self.json_response(200,{"ok":True,"uid":uid})
        if path=="/api/auth/login":
            email=str(data.get("email","")).strip().lower(); password=str(data.get("password", "")); users=load_json(USERS,{})
            user=users.get(email)
            if not user: return self.json_response(401,{"error":"Account has not been provisioned for offline login yet."})
            _,digest=password_hash(password,bytes.fromhex(user["salt"]))
            if not hmac.compare_digest(digest,user["hash"]): return self.json_response(401,{"error":"Wrong email or password."})
            return self.json_response(200,{"ok":True,"user":{"uid":user["uid"],"email":user["email"],"name":user.get("name","")}})
        return self.json_response(404,{"error":"Not found"})

    def log_message(self, fmt, *args):
        print("[PD Chat]", fmt % args)

if __name__=="__main__":
    os.chdir(ROOT)
    host,port="0.0.0.0",8000
    print(f"PD Chat LAN server: http://{host}:{port}")
    print("On Ubuntu, run 'hostname -I' and open http://YOUR-IP:8000 on other LAN devices.")
    ThreadingHTTPServer((host,port),Handler).serve_forever()
