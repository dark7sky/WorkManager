import json, os, sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta

DB_PATH = os.getenv("DATABASE_PATH", "./data/workmanager.db")

@contextmanager
def connection():
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally: conn.close()

def row_dict(row):
    item = dict(row)
    if "tags" in item: item["tags"] = json.loads(item["tags"] or "[]")
    if "completed" in item: item["completed"] = bool(item["completed"])
    return item

def init_db():
    with connection() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'todo',priority TEXT NOT NULL DEFAULT 'normal',progress INTEGER NOT NULL DEFAULT 0,start_date TEXT,due_date TEXT,tags TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',start_at TEXT NOT NULL,end_at TEXT NOT NULL,location TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS todos(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,todo_date TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS work_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,content TEXT NOT NULL,log_date TEXT NOT NULL,task_id INTEGER,created_at TEXT NOT NULL,FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL);
        """)
        if c.execute("SELECT COUNT(*) n FROM tasks").fetchone()["n"] == 0: seed(c)

def seed(c):
    d, now = date.today(), datetime.now().isoformat(timespec="seconds")
    tasks=[("분기 보고서 초안","핵심 성과와 다음 분기 계획을 정리합니다.","doing","high",65,d.isoformat(),(d+timedelta(days=2)).isoformat(),'["문서"]'),("거래처 미팅 자료 준비","발표 자료와 참고 문서를 준비합니다.","doing","normal",30,d.isoformat(),d.isoformat(),'["미팅","자료"]'),("배포 전 최종 점검","체크리스트에 따라 배포 준비 상태를 확인합니다.","todo","high",80,(d-timedelta(days=1)).isoformat(),d.isoformat(),'["점검"]'),("주간 업무 계획 수립","이번 주 우선순위를 정리합니다.","todo","low",0,d.isoformat(),(d+timedelta(days=4)).isoformat(),'["계획"]')]
    c.executemany("INSERT INTO tasks(title,description,status,priority,progress,start_date,due_date,tags,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",[(*x,now,now) for x in tasks])
    base=datetime.combine(d,datetime.min.time())
    c.executemany("INSERT INTO events(title,description,start_at,end_at,location,created_at) VALUES(?,?,?,?,?,?)",[("거래처 미팅","프로젝트 진행 상황 공유",base.replace(hour=11).isoformat(),base.replace(hour=12).isoformat(),"회의실 A",now),("분기 보고 리뷰","초안 검토",base.replace(hour=14).isoformat(),base.replace(hour=14,minute=30).isoformat(),"회의실 B",now)])
    c.execute("INSERT INTO todos(title,todo_date,completed,created_at) VALUES(?,?,0,?)",("오전 메일 확인 및 회신",d.isoformat(),now))
    c.execute("INSERT INTO work_logs(content,log_date,task_id,created_at) VALUES(?,?,NULL,?)",("어제 회의록을 정리하고 팀에 공유함",d.isoformat(),now))
