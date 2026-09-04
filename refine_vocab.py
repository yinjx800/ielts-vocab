import json, re, os, sys
sys.stdout.reconfigure(encoding='utf-8')

file_path = r'D:\AntigravityProjects\ielts-vocab-master\data\ielts_words.json'
with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

def clean_text(s: str) -> str:
    if not s:
        return ""
    # Remove spaces between Chinese characters and punctuation
    for _ in range(4):
        s = re.sub(r'([\u4e00-\u9fa5，。；、？！（）])\s+([\u4e00-\u9fa5，。；、？！（）])', r'\1\2', s)
    # Fix common symbols
    s = s.replace('·', '').replace('口', '').replace('0f', 'of').replace(' 0n ', ' on ')
    s = re.sub(r'[ \t]+', ' ', s).strip()
    return s

cleaned_words = []
for w in data.get('words', []):
    meaning = w.get('meaning', '')
    
    # Check [例] with any whitespace/bracket variation
    m_ex = re.search(r'[\[〔【]\s*例\s*[\]〕】]', meaning)
    if m_ex:
        parts = re.split(r'[\[〔【]\s*例\s*[\]〕】]', meaning, maxsplit=1)
        meaning = parts[0].strip()
        ex_content = parts[1].strip()
        if ex_content and ex_content not in w.get('examples', []):
            w['examples'].append(clean_text(ex_content))
            
    m_col = re.search(r'[\[〔【]\s*搭\s*[\]〕】]', meaning)
    if m_col:
        parts = re.split(r'[\[〔【]\s*搭\s*[\]〕】]', meaning, maxsplit=1)
        meaning = parts[0].strip()
        col_content = parts[1].strip()
        if col_content and col_content not in w.get('collocations', []):
            w['collocations'].append(clean_text(col_content))

    m_mem = re.search(r'[\[〔【]\s*记\s*[\]〕】]', meaning)
    if m_mem:
        parts = re.split(r'[\[〔【]\s*记\s*[\]〕】]', meaning, maxsplit=1)
        meaning = parts[0].strip()
        mem_content = parts[1].strip()
        if mem_content:
            w['memory_tip'] = clean_text((w.get('memory_tip', '') + ' ' + mem_content).strip())

    w['meaning'] = clean_text(meaning)
    w['examples'] = [clean_text(ex) for ex in w.get('examples', []) if clean_text(ex)]
    w['collocations'] = [clean_text(c) for c in w.get('collocations', []) if clean_text(c)]
    w['memory_tip'] = clean_text(w.get('memory_tip', ''))
    
    cleaned_words.append(w)

data['words'] = cleaned_words
with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"Deeply polished {len(cleaned_words)} vocabulary entries!")
