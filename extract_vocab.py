import asyncio, os, re, json, sys, time
sys.stdout.reconfigure(encoding='utf-8')
import fitz
from PIL import Image
from winsdk.windows.media.ocr import OcrEngine
from winsdk.windows.graphics.imaging import BitmapDecoder
from winsdk.windows.storage import StorageFile

CHAPTER_METADATA = [
    {"id": 1, "name": "自然地理", "en": "Physical Geography", "start": 12, "end": 31, "desc": "地质地貌、气象气候、自然灾害、生态环境保护"},
    {"id": 2, "name": "植物研究", "en": "Plant Research", "start": 32, "end": 41, "desc": "植物分类、光合作用、树木花草、农业林业"},
    {"id": 3, "name": "动物保护", "en": "Animal Protection", "start": 42, "end": 55, "desc": "物种演化、栖息地保护、野生动物、濒危物种"},
    {"id": 4, "name": "太空探索", "en": "Space Exploration", "start": 56, "end": 63, "desc": "天体物理、航天科技、宇宙星系、卫星观测"},
    {"id": 5, "name": "学校教育", "en": "School & Education", "start": 64, "end": 95, "desc": "学术研究、课程考试、高等教育、教学方法"},
    {"id": 6, "name": "科技发明", "en": "Technology & Inventions", "start": 96, "end": 105, "desc": "现代科技、人工智能、机械制造、信息通讯"},
    {"id": 7, "name": "文化历史", "en": "Culture & History", "start": 106, "end": 113, "desc": "考古发现、历史遗迹、文明演进、传统民俗"},
    {"id": 8, "name": "语言演化", "en": "Language Evolution", "start": 114, "end": 119, "desc": "语言学、方言演变、文字起源、跨文化交际"},
    {"id": 9, "name": "娱乐运动", "en": "Sports & Entertainment", "start": 120, "end": 133, "desc": "竞技体育、休闲娱乐、音乐艺术、影视媒体"},
    {"id": 10, "name": "物品材料", "en": "Objects & Materials", "start": 134, "end": 145, "desc": "原材料、物理属性、金属矿物、合成材质"},
    {"id": 11, "name": "时尚潮流", "en": "Fashion & Trends", "start": 146, "end": 155, "desc": "服饰搭配、审美风尚、消费流行、设计艺术"},
    {"id": 12, "name": "饮食健康", "en": "Food & Diet", "start": 156, "end": 169, "desc": "膳食营养、餐饮烹饪、食品安全、健康生活"},
    {"id": 13, "name": "建筑场所", "en": "Architecture & Places", "start": 170, "end": 181, "desc": "城市规划、建筑风格、公共设施、室内空间"},
    {"id": 14, "name": "交通旅行", "en": "Travel & Transport", "start": 182, "end": 193, "desc": "交通工具、旅行出行、导航物流、公共交通"},
    {"id": 15, "name": "国家政府", "en": "Government & State", "start": 194, "end": 207, "desc": "政治体制、国际关系、公共政策、公民权利"},
    {"id": 16, "name": "社会经济", "en": "Society & Economy", "start": 208, "end": 223, "desc": "宏观经济、商业金融、贸易市场、就业劳动"},
    {"id": 17, "name": "法律法规", "en": "Law & Regulations", "start": 224, "end": 233, "desc": "司法审判、法律条例、犯罪防范、权利义务"},
    {"id": 18, "name": "沙场争锋", "en": "Military & War", "start": 234, "end": 251, "desc": "军事防御、战略战术、历史战事、和平协议"},
    {"id": 19, "name": "社会角色", "en": "Social Roles", "start": 252, "end": 263, "desc": "家庭关系、职业分工、社会阶层、人群性格"},
    {"id": 20, "name": "行为动作", "en": "Actions & Behaviors", "start": 264, "end": 285, "desc": "核心动词、身心动作、交往沟通、态度表达"},
    {"id": 21, "name": "身心健康", "en": "Health & Psychology", "start": 286, "end": 317, "desc": "医学医疗、生理机能、心理情绪、疾病治疗"},
    {"id": 22, "name": "时间日期", "en": "Time & Calendar", "start": 318, "end": 322, "desc": "时间概念、历法周期、发展阶段、频率顺序"}
]

POS_LIST = ['n.', 'v.', 'vi.', 'vt.', 'adj.', 'adv.', 'prep.', 'conj.', 'pron.', 'num.', 'art.', 'int.']

def clean_ocr_text(text: str) -> str:
    if not text:
        return ""
    t = text
    t = t.replace(' 0f ', ' of ').replace(' tO ', ' to ').replace(' 0n ', ' on ').replace(' 1n ', ' in ')
    t = t.replace('adi.', 'adj.').replace('ad i.', 'adj.').replace('ad v.', 'adv.')
    t = t.replace('〔', '[').replace('〕', ']').replace('【', '[').replace('】', ']')
    t = t.replace('（', '(').replace('）', ')')
    t = t.replace('：', ':').replace('；', ';').replace('，', ', ')
    t = re.sub(r'[ \t]+', ' ', t).strip()
    return t

def parse_column_lines(lines, chapter_id, chapter_name, page_num):
    entries = []
    current_entry = None
    cleaned = [clean_ocr_text(l) for l in lines if l.strip()]
    
    i = 0
    while i < len(cleaned):
        line = cleaned[i]
        
        m_word_phonetic = re.match(r'^([a-zA-Z\s\-\'/]{2,30}?)(?:\s+[/\[]([^/\]]+)[/\]])$', line)
        m_word_only = re.match(r'^([a-zA-Z\s\-\']{2,30})$', line)
        
        cand_word = None
        cand_phonetic = ""
        
        if m_word_phonetic and not any(p in line for p in ['[例]', '[搭]', '[记]']):
            w = m_word_phonetic.group(1).strip()
            if w.lower() not in ['chapter', 'ielts', 'vocabulary'] and len(w) >= 2:
                cand_word = w
                cand_phonetic = '/' + m_word_phonetic.group(2).strip() + '/'
        elif m_word_only and not any(p in line for p in ['[例]', '[搭]', '[记]']):
            w = m_word_only.group(1).strip()
            if w.lower() not in ['chapter', 'ielts', 'vocabulary', 'the', 'and', 'for', 'from'] and len(w) >= 2:
                if i + 1 < len(cleaned):
                    next_l = cleaned[i+1]
                    if any(next_l.startswith(p) for p in POS_LIST) or next_l.startswith('/') or re.match(r'^[a-z]{1,4}\.\s*[\u4e00-\u9fa5]', next_l):
                        cand_word = w
        
        if cand_word:
            if current_entry and current_entry['word'] and (current_entry['meaning'] or current_entry['examples']):
                entries.append(current_entry)
            
            clean_word = cand_word.strip()
            current_entry = {
                "id": f"{chapter_id}_{len(entries)+1}_{clean_word.lower()}",
                "word": clean_word.lower(),
                "display_word": clean_word,
                "phonetic": cand_phonetic,
                "pos": "",
                "meaning": "",
                "examples": [],
                "collocations": [],
                "memory_tip": "",
                "chapter_id": chapter_id,
                "chapter_name": chapter_name,
                "page": page_num
            }
            i += 1
            continue
            
        if current_entry:
            if not current_entry['phonetic'] and line.startswith('/') and '/' in line[1:]:
                current_entry['phonetic'] = line.strip()
                i += 1
                continue
                
            if any(line.startswith(p) for p in POS_LIST) or (not current_entry['pos'] and re.match(r'^[a-z]{1,4}\.\s*[\u4e00-\u9fa5]', line)):
                pos_m = re.match(r'^([a-z\.\,\s]+)\s*(.*)', line)
                if pos_m:
                    current_entry['pos'] = pos_m.group(1).strip()
                    current_entry['meaning'] = (current_entry['meaning'] + " " + pos_m.group(2)).strip()
                else:
                    current_entry['meaning'] = (current_entry['meaning'] + " " + line).strip()
                i += 1
                continue
            
            if '[例]' in line or line.startswith('例 ') or line.startswith('例:'):
                ex_text = re.sub(r'^\[?例\]?:?\s*', '', line)
                while i + 1 < len(cleaned):
                    next_l = cleaned[i+1]
                    if any(next_l.startswith(k) for k in ['[搭]', '[记]', '[例]']) or any(next_l.startswith(p) for p in POS_LIST):
                        break
                    if re.match(r'^[a-zA-Z\s\-\'/]{2,30}\s+/[^/]+/$', next_l):
                        break
                    ex_text += " " + next_l
                    i += 1
                current_entry['examples'].append(ex_text.strip())
                i += 1
                continue
                
            if '[搭]' in line or line.startswith('搭 ') or line.startswith('搭:'):
                col_text = re.sub(r'^\[?搭\]?:?\s*', '', line)
                while i + 1 < len(cleaned):
                    next_l = cleaned[i+1]
                    if any(next_l.startswith(k) for k in ['[搭]', '[记]', '[例]']) or any(next_l.startswith(p) for p in POS_LIST):
                        break
                    if re.match(r'^[a-zA-Z\s\-\'/]{2,30}\s+/[^/]+/$', next_l):
                        break
                    col_text += " " + next_l
                    i += 1
                current_entry['collocations'].append(col_text.strip())
                i += 1
                continue
                
            if '[记]' in line or line.startswith('记 ') or line.startswith('记:'):
                mem_text = re.sub(r'^\[?记\]?:?\s*', '', line)
                while i + 1 < len(cleaned):
                    next_l = cleaned[i+1]
                    if any(next_l.startswith(k) for k in ['[搭]', '[记]', '[例]']) or any(next_l.startswith(p) for p in POS_LIST):
                        break
                    if re.match(r'^[a-zA-Z\s\-\'/]{2,30}\s+/[^/]+/$', next_l):
                        break
                    mem_text += " " + next_l
                    i += 1
                current_entry['memory_tip'] = (current_entry['memory_tip'] + " " + mem_text).strip()
                i += 1
                continue
                
            if re.search(r'[\u4e00-\u9fa5]', line):
                if not current_entry['meaning'] or len(current_entry['meaning']) < 15:
                    current_entry['meaning'] = (current_entry['meaning'] + " " + line).strip()
                elif any(k in line for k in ['词根', '前缀', '后缀', '来自', '神话', '联想']):
                    current_entry['memory_tip'] = (current_entry['memory_tip'] + " " + line).strip()
        
        i += 1
        
    if current_entry and current_entry['word'] and (current_entry['meaning'] or current_entry['examples']):
        entries.append(current_entry)
        
    return entries

async def run_pipeline():
    pdf_path = r'D:\Users\yinj3\Desktop\FOLD2\雅思资料\雅思词汇真经\词汇真经pdf.pdf'
    doc = fitz.open(pdf_path)
    engine = OcrEngine.try_create_from_user_profile_languages()
    
    scratch_dir = r'C:\Users\yinj3\.gemini\antigravity\brain\8ee71b38-db0d-4b32-96a0-61a3abd78de5\scratch'
    os.makedirs(scratch_dir, exist_ok=True)
    
    output_file = r'D:\AntigravityProjects\ielts-vocab-master\data\ielts_words.json'
    
    all_words = []
    seen_words = set()
    total_chapters = len(CHAPTER_METADATA)
    
    for c_idx, ch in enumerate(CHAPTER_METADATA):
        cid = ch['id']
        cname = ch['name']
        start_p = ch['start']
        end_p = ch['end']
        
        ch_words = []
        print(f"[{c_idx+1}/{total_chapters}] Processing Chapter {cid}: {cname} (Pages {start_p+1} to {end_p})...")
        
        for p in range(start_p + 1, end_p + 1):
            if p >= len(doc):
                break
                
            pix = doc[p].get_pixmap(dpi=150)
            full_img_path = os.path.join(scratch_dir, f'tmp_ch_{cid}_p_{p}.png')
            pix.save(full_img_path)
            
            img = Image.open(full_img_path)
            w, h = img.size
            
            # Left column
            left_crop = img.crop((int(0.04 * w), int(0.02 * h), int(0.50 * w), int(0.88 * h)))
            left_path = os.path.join(scratch_dir, f'left_{p}.png')
            left_crop.save(left_path)
            
            # Right column
            right_crop = img.crop((int(0.50 * w), int(0.02 * h), int(0.96 * w), int(0.88 * h)))
            right_path = os.path.join(scratch_dir, f'right_{p}.png')
            right_crop.save(right_path)
            
            file_l = await StorageFile.get_file_from_path_async(left_path)
            stream_l = await file_l.open_async(0)
            decoder_l = await BitmapDecoder.create_async(stream_l)
            bitmap_l = await decoder_l.get_software_bitmap_async()
            res_l = await engine.recognize_async(bitmap_l)
            entries_l = parse_column_lines([line.text for line in res_l.lines], cid, cname, p - 11)
            
            file_r = await StorageFile.get_file_from_path_async(right_path)
            stream_r = await file_r.open_async(0)
            decoder_r = await BitmapDecoder.create_async(stream_r)
            bitmap_r = await decoder_r.get_software_bitmap_async()
            res_r = await engine.recognize_async(bitmap_r)
            entries_r = parse_column_lines([line.text for line in res_r.lines], cid, cname, p - 11)
            
            for path in [full_img_path, left_path, right_path]:
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except:
                        pass
            
            for e in entries_l + entries_r:
                key = (cid, e['word'])
                if key not in seen_words and len(e['word']) >= 2:
                    seen_words.add(key)
                    ch_words.append(e)
                    
        print(f"  -> Chapter {cid} {cname} complete: {len(ch_words)} words.")
        all_words.extend(ch_words)
        
        # Save snapshot
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump({
                "chapters": CHAPTER_METADATA,
                "total_words": len(all_words),
                "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "words": all_words
            }, f, ensure_ascii=False, indent=2)
            
    print(f"\nSUCCESS! Extracted total {len(all_words)} words across all 22 chapters!")

if __name__ == '__main__':
    asyncio.run(run_pipeline())
