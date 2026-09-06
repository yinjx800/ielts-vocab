import os, json, time, math
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import FastAPI, Query, HTTPException, Body, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

app = FastAPI(title="雅思词汇真经 - 智能记忆平台", version="1.0.0")

@app.middleware("http")
async def add_no_cache_header(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.endswith((".js", ".html", ".css")) or request.url.path == "/":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
STATIC_DIR = os.path.join(BASE_DIR, "static")
WORDS_FILE = os.path.join(DATA_DIR, "ielts_words.json")
PROGRESS_FILE = os.path.join(DATA_DIR, "user_progress.json")
MISTAKES_FILE = os.path.join(DATA_DIR, "user_mistakes.json")
STARRED_FILE = os.path.join(DATA_DIR, "user_starred.json")

# Ensure directories exist
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

# Helper functions for data loading
def load_words_data():
    if os.path.exists(WORDS_FILE):
        try:
            with open(WORDS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"chapters": [], "total_words": 0, "words": []}

def load_json(filepath, default):
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return default

def save_json(filepath, data):
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# SM-2 Spaced Repetition Algorithm
# rating: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
def calculate_sm2(repetition: int, interval: float, ease_factor: float, rating: int):
    if rating == 1:
        # Reset repetition, review in 5 minutes / next session
        new_repetition = 0
        new_interval = 0.05 # 0.05 days ~ 1.2 hours
        new_ef = max(1.3, ease_factor - 0.2)
    elif rating == 2:
        new_repetition = max(1, repetition)
        new_interval = max(0.5, interval * 1.2) # ~12 hours or half day
        new_ef = max(1.3, ease_factor - 0.15)
    elif rating == 3:
        if repetition == 0:
            new_interval = 1.0 # 1 day
        elif repetition == 1:
            new_interval = 3.0 # 3 days
        else:
            new_interval = interval * ease_factor
        new_repetition = repetition + 1
        new_ef = ease_factor
    else: # rating 4: Easy
        if repetition == 0:
            new_interval = 3.0
        elif repetition == 1:
            new_interval = 6.0
        else:
            new_interval = interval * ease_factor * 1.3
        new_repetition = repetition + 1
        new_ef = ease_factor + 0.15

    # Cap interval between 0.05 and 180 days
    new_interval = min(180.0, round(new_interval, 2))
    return new_repetition, new_interval, round(new_ef, 2)

# --- API Endpoints ---

@app.get("/api/chapters")
def get_chapters():
    words_data = load_words_data()
    chapters = words_data.get("chapters", [])
    progress = load_json(PROGRESS_FILE, {})
    starred = set(load_json(STARRED_FILE, []))
    mistakes = load_json(MISTAKES_FILE, {})
    
    words = words_data.get("words", [])
    now = datetime.now()
    
    # Calculate per-chapter statistics
    ch_stats = {}
    for c in chapters:
        cid = c["id"]
        ch_stats[cid] = {
            "id": cid,
            "name": c["name"],
            "en": c.get("en", ""),
            "desc": c.get("desc", ""),
            "start": c.get("start", 0),
            "end": c.get("end", 0),
            "total_words": 0,
            "learned_words": 0,
            "mastered_words": 0,
            "due_review_words": 0,
            "starred_count": 0,
            "illustration": f"/assets/chapter_illustrations/chapter_{cid}.png"
        }
    
    for w in words:
        cid = w.get("chapter_id")
        wid = w.get("id") or f"{cid}_{w['word']}"
        if cid in ch_stats:
            ch_stats[cid]["total_words"] += 1
            if wid in starred or w["word"] in starred:
                ch_stats[cid]["starred_count"] += 1
                
            p = progress.get(wid)
            if p:
                ch_stats[cid]["learned_words"] += 1
                if p.get("repetition", 0) >= 3:
                    ch_stats[cid]["mastered_words"] += 1
                next_rev = p.get("next_review")
                if next_rev and datetime.fromisoformat(next_rev) <= now:
                    ch_stats[cid]["due_review_words"] += 1
                    
    return list(ch_stats.values())

@app.get("/api/words")
def get_words(
    chapter_id: Optional[int] = None,
    query: Optional[str] = None,
    filter_status: Optional[str] = None, # 'all', 'new', 'learning', 'mastered', 'due', 'starred', 'mistake'
    page: int = 1,
    limit: int = 50
):
    words_data = load_words_data()
    words = words_data.get("words", [])
    progress = load_json(PROGRESS_FILE, {})
    starred = set(load_json(STARRED_FILE, []))
    mistakes = load_json(MISTAKES_FILE, {})
    now = datetime.now()
    
    filtered = []
    q = query.strip().lower() if query else ""
    
    for w in words:
        wid = w.get("id") or f"{w.get('chapter_id')}_{w['word']}"
        word_text = w.get("word", "").lower()
        
        # Chapter filter
        if chapter_id and w.get("chapter_id") != chapter_id:
            continue
            
        # Search query filter
        if q:
            match_word = q in word_text
            match_meaning = q in w.get("meaning", "").lower()
            match_example = any(q in ex.lower() for ex in w.get("examples", []))
            if not (match_word or match_meaning or match_example):
                continue
                
        # Status filter
        p = progress.get(wid)
        rep = p.get("repetition", 0) if p else 0
        is_starred = (wid in starred) or (word_text in starred)
        is_mistake = (wid in mistakes) or (word_text in mistakes)
        is_due = False
        if p and p.get("next_review"):
            try:
                is_due = datetime.fromisoformat(p["next_review"]) <= now
            except:
                pass
                
        if filter_status == "new" and p is not None:
            continue
        elif filter_status == "learning" and (p is None or rep >= 3):
            continue
        elif filter_status == "mastered" and rep < 3:
            continue
        elif filter_status == "due" and not is_due:
            continue
        elif filter_status == "starred" and not is_starred:
            continue
        elif filter_status == "mistake" and not is_mistake:
            continue
            
        # Attach state
        w_copy = dict(w)
        w_copy["is_starred"] = is_starred
        w_copy["is_mistake"] = is_mistake
        w_copy["progress"] = p
        w_copy["is_due"] = is_due
        filtered.append(w_copy)
        
    total_count = len(filtered)
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    page_items = filtered[start_idx:end_idx]
    
    return {
        "total": total_count,
        "page": page,
        "limit": limit,
        "total_pages": math.ceil(total_count / limit) if limit else 1,
        "items": page_items
    }

@app.get("/api/study/session")
def get_study_session(
    chapter_id: int,
    mode: str = "flashcard", # flashcard, spelling, quiz, cloze
    count: int = 50
):
    """
    Returns a balanced study batch:
    Prioritizes:
    1. Due review words (Ebbinghaus review)
    2. Mistakes needing remediation
    3. New unlearned words from the chapter
    """
    words_data = load_words_data()
    words = [w for w in words_data.get("words", []) if w.get("chapter_id") == chapter_id]
    if not words:
        # fallback to all words
        words = words_data.get("words", [])
        
    progress = load_json(PROGRESS_FILE, {})
    mistakes = load_json(MISTAKES_FILE, {})
    starred = set(load_json(STARRED_FILE, []))
    now = datetime.now()
    
    due_words = []
    mistake_words = []
    new_words = []
    learned_words = []
    
    for w in words:
        wid = w.get("id") or f"{w.get('chapter_id')}_{w['word']}"
        w_dict = dict(w)
        w_dict["is_starred"] = (wid in starred) or (w["word"] in starred)
        w_dict["is_mistake"] = (wid in mistakes) or (w["word"] in mistakes)
        
        p = progress.get(wid)
        w_dict["progress"] = p
        
        if p and p.get("next_review"):
            try:
                if datetime.fromisoformat(p["next_review"]) <= now:
                    due_words.append(w_dict)
                    continue
            except:
                pass
                
        if w_dict["is_mistake"]:
            mistake_words.append(w_dict)
        elif not p:
            new_words.append(w_dict)
        else:
            learned_words.append(w_dict)
            
    import random
    if mode in ["quiz", "cloze"]:
        # 单词测验模式：全章节词汇均匀随机抽选 50 词
        shuffled_all = list(words)
        random.shuffle(shuffled_all)
        session_batch = []
        for w in shuffled_all[:count]:
            wid = w.get("id") or f"{w.get('chapter_id')}_{w['word']}"
            w_copy = dict(w)
            w_copy["is_starred"] = (wid in starred) or (w["word"] in starred)
            w_copy["is_mistake"] = (wid in mistakes) or (w["word"] in mistakes)
            w_copy["progress"] = progress.get(wid)
            session_batch.append(w_copy)
    else:
        random.shuffle(due_words)
        random.shuffle(mistake_words)
        random.shuffle(new_words)
        random.shuffle(learned_words)
        session_batch = []
        session_batch.extend(due_words[:count])
        remaining = count - len(session_batch)
        if remaining > 0:
            session_batch.extend(mistake_words[:remaining])
            remaining = count - len(session_batch)
        if remaining > 0:
            session_batch.extend(new_words[:remaining])
            remaining = count - len(session_batch)
        if remaining > 0:
            session_batch.extend(learned_words[:remaining])
        random.shuffle(session_batch)
        
    # For Quiz mode, pre-generate distractors
    all_words_list = words_data.get("words", [])
    if mode in ["quiz", "cloze"]:
        import random
        for item in session_batch:
            # Generate 3 distractors
            other_words = [ow for ow in all_words_list if ow.get("word") != item.get("word") and ow.get("meaning")]
            distractors = random.sample(other_words, min(3, len(other_words)))
            options = [item.get("meaning")] + [d.get("meaning") for d in distractors]
            random.shuffle(options)
            item["quiz_options"] = options
            item["correct_option"] = item.get("meaning")
            
    return {
        "chapter_id": chapter_id,
        "mode": mode,
        "count": len(session_batch),
        "due_count": len(due_words),
        "new_count": len(new_words),
        "items": session_batch
    }

class ProgressUpdate(BaseModel):
    word_id: str
    word: str
    rating: int # 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
    study_mode: Optional[str] = "flashcard"

@app.post("/api/progress")
def update_progress(data: ProgressUpdate):
    progress = load_json(PROGRESS_FILE, {})
    now = datetime.now()
    
    wid = data.word_id
    p = progress.get(wid, {
        "repetition": 0,
        "interval": 1.0,
        "ease_factor": 2.5,
        "history": []
    })
    
    rep = p.get("repetition", 0)
    interval = p.get("interval", 1.0)
    ef = p.get("ease_factor", 2.5)
    
    new_rep, new_interval, new_ef = calculate_sm2(rep, interval, ef, data.rating)
    next_review_time = now + timedelta(days=new_interval)
    
    p["repetition"] = new_rep
    p["interval"] = new_interval
    p["ease_factor"] = new_ef
    p["last_reviewed"] = now.isoformat()
    p["next_review"] = next_review_time.isoformat()
    p["history"].append({
        "timestamp": now.isoformat(),
        "rating": data.rating,
        "mode": data.study_mode
    })
    
    progress[wid] = p
    save_json(PROGRESS_FILE, progress)
    
    # If rating == 1, also record in mistakes notebook
    mistakes = load_json(MISTAKES_FILE, {})
    if data.rating == 1:
        mistakes[wid] = {
            "word": data.word,
            "last_failed": now.isoformat(),
            "fail_count": mistakes.get(wid, {}).get("fail_count", 0) + 1
        }
        save_json(MISTAKES_FILE, mistakes)
    elif data.rating >= 3 and wid in mistakes:
        # If successfully answered with Good or Easy, decrement or clear mistake
        fail_c = mistakes[wid].get("fail_count", 1) - 1
        if fail_c <= 0:
            del mistakes[wid]
        else:
            mistakes[wid]["fail_count"] = fail_c
        save_json(MISTAKES_FILE, mistakes)
        
    return {
        "success": True,
        "word_id": wid,
        "next_review": p["next_review"],
        "interval_days": new_interval,
        "repetition": new_rep
    }

@app.post("/api/notebook/star")
def toggle_star(payload: dict = Body(...)):
    word_id = payload.get("word_id")
    word = payload.get("word")
    starred = load_json(STARRED_FILE, [])
    
    key = word_id or word
    if key in starred:
        starred.remove(key)
        is_starred = False
    else:
        starred.append(key)
        is_starred = True
        
    save_json(STARRED_FILE, starred)
    return {"is_starred": is_starred}

@app.post("/api/notebook/clear")
def clear_notebook(payload: dict = Body(...)):
    nb_type = payload.get("type", "starred")
    if nb_type == "starred":
        save_json(STARRED_FILE, [])
    elif nb_type == "mistakes":
        save_json(MISTAKES_FILE, {})
    return {"success": True, "type": nb_type}

@app.get("/api/progress/stats")
def get_stats():
    words_data = load_words_data()
    total_words = words_data.get("total_words", 0)
    progress = load_json(PROGRESS_FILE, {})
    mistakes = load_json(MISTAKES_FILE, {})
    starred = load_json(STARRED_FILE, [])
    now = datetime.now()
    
    learned = 0
    mastered = 0
    due = 0
    
    for wid, p in progress.items():
        learned += 1
        if p.get("repetition", 0) >= 3:
            mastered += 1
        next_rev = p.get("next_review")
        if next_rev:
            try:
                if datetime.fromisoformat(next_rev) <= now:
                    due += 1
            except:
                pass
                
    return {
        "total_words": total_words,
        "learned": learned,
        "mastered": mastered,
        "due_review": due,
        "mistakes_count": len(mistakes),
        "starred_count": len(starred),
        "mastery_rate": round((mastered / total_words * 100), 1) if total_words > 0 else 0
    }

# Mount data and static folders
app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
