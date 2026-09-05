// 雅思词汇真经 · 核心前端控制系统 (支持 GitHub Pages 纯静态与本地环境)

// ----------------------------------------------------
// 💾 Universal Client-Side DataManager
// ----------------------------------------------------
const DataManager = {
  wordsData: null,
  isInitialized: false,

  async init() {
    if (this.isInitialized) return;
    try {
      const res = await fetch('./data/ielts_words.json');
      this.wordsData = await res.json();
    } catch (e) {
      console.warn('Fallback to local API if json fetch fails:', e);
      try {
        const res = await fetch('/api/words?limit=3000');
        const d = await res.json();
        this.wordsData = { chapters: [], words: d.items || [] };
      } catch (err) {
        this.wordsData = { chapters: [], words: [] };
      }
    }
    this.isInitialized = true;
  },

  getProgress() {
    try {
      return JSON.parse(localStorage.getItem('ielts_user_progress') || '{}');
    } catch (e) { return {}; }
  },

  saveProgress(data) {
    localStorage.setItem('ielts_user_progress', JSON.stringify(data));
  },

  getStarred() {
    try {
      return new Set(JSON.parse(localStorage.getItem('ielts_user_starred') || '[]'));
    } catch (e) { return new Set(); }
  },

  saveStarred(set) {
    localStorage.setItem('ielts_user_starred', JSON.stringify([...set]));
  },

  getMistakes() {
    try {
      return JSON.parse(localStorage.getItem('ielts_user_mistakes') || '{}');
    } catch (e) { return {}; }
  },

  saveMistakes(data) {
    localStorage.setItem('ielts_user_mistakes', JSON.stringify(data));
  },

  getChapters() {
    const chapters = (this.wordsData && this.wordsData.chapters) ? this.wordsData.chapters : [];
    const words = (this.wordsData && this.wordsData.words) ? this.wordsData.words : [];
    const progress = this.getProgress();
    const now = new Date();

    return chapters.map(ch => {
      const chWords = words.filter(w => w.chapter_id === ch.id);
      const total = chWords.length;
      let learned = 0, mastered = 0, due = 0;

      chWords.forEach(w => {
        const p = progress[w.id];
        if (p) {
          learned += 1;
          if (p.repetition >= 3) mastered += 1;
          if (p.next_review && new Date(p.next_review) <= now) due += 1;
        }
      });

      return {
        ...ch,
        total_words: total,
        learned_words: learned,
        mastered_words: mastered,
        due_review_words: due,
        illustration: `./assets/chapter_illustrations/chapter_${ch.id}.png`
      };
    });
  },

  getWords({ chapter_id, filter_status = 'all', page = 1, limit = 60, query = '' }) {
    let list = (this.wordsData && this.wordsData.words) ? [...this.wordsData.words] : [];
    const progress = this.getProgress();
    const starred = this.getStarred();
    const mistakes = this.getMistakes();
    const now = new Date();

    if (chapter_id) {
      list = list.filter(w => w.chapter_id === parseInt(chapter_id));
    }

    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(w => 
        (w.word && w.word.toLowerCase().includes(q)) ||
        (w.meaning && w.meaning.toLowerCase().includes(q)) ||
        (w.en_definition && w.en_definition.toLowerCase().includes(q)) ||
        (w.examples && w.examples.some(ex => ex.toLowerCase().includes(q))) ||
        (w.id && w.id.toLowerCase().includes(q))
      );
    }

    if (filter_status === 'starred') {
      list = list.filter(w => starred.has(w.id));
    } else if (filter_status === 'mistake') {
      list = list.filter(w => !!mistakes[w.id]);
    } else if (filter_status === 'mastered') {
      list = list.filter(w => progress[w.id] && progress[w.id].repetition >= 3);
    } else if (filter_status === 'learning') {
      list = list.filter(w => progress[w.id] && progress[w.id].repetition < 3);
    } else if (filter_status === 'new') {
      list = list.filter(w => !progress[w.id]);
    } else if (filter_status === 'due') {
      list = list.filter(w => progress[w.id] && progress[w.id].next_review && new Date(progress[w.id].next_review) <= now);
    }

    const total = list.length;
    const start = (page - 1) * limit;
    const items = list.slice(start, start + limit).map(w => {
      const p = progress[w.id] || null;
      const isDue = p && p.next_review && new Date(p.next_review) <= now;
      return {
        ...w,
        is_starred: starred.has(w.id),
        is_mistake: !!mistakes[w.id],
        is_due: !!isDue,
        progress: p
      };
    });

    return { total, page, limit, items };
  },

  getStudySession(chapter_id, mode, count = 20) {
    const cid = parseInt(chapter_id);
    const words = (this.wordsData && this.wordsData.words) ? this.wordsData.words.filter(w => w.chapter_id === cid) : [];
    const progress = this.getProgress();
    const starred = this.getStarred();
    const mistakes = this.getMistakes();
    const now = new Date();

    const due_words = [];
    const mistake_words = [];
    const new_words = [];
    const learned_words = [];

    words.forEach(w => {
      const p = progress[w.id] || null;
      const item = {
        ...w,
        is_starred: starred.has(w.id),
        is_mistake: !!mistakes[w.id],
        progress: p
      };
      if (p && p.next_review && new Date(p.next_review) <= now) {
        due_words.push(item);
      } else if (mistakes[w.id]) {
        mistake_words.push(item);
      } else if (!p) {
        new_words.push(item);
      } else {
        learned_words.push(item);
      }
    });

    const session_batch = [];
    session_batch.push(...due_words.slice(0, count));
    let remaining = count - session_batch.length;
    if (remaining > 0) {
      session_batch.push(...mistake_words.slice(0, remaining));
      remaining = count - session_batch.length;
    }
    if (remaining > 0) {
      session_batch.push(...new_words.slice(0, remaining));
      remaining = count - session_batch.length;
    }
    if (remaining > 0) {
      session_batch.push(...learned_words.slice(0, remaining));
    }

    if (mode === 'quiz') {
      const allWords = (this.wordsData && this.wordsData.words) ? this.wordsData.words : [];
      session_batch.forEach(item => {
        const others = allWords.filter(ow => ow.word !== item.word && ow.meaning).sort(() => 0.5 - Math.random());
        const distractors = others.slice(0, 3).map(d => d.meaning);
        const options = [item.meaning, ...distractors].sort(() => 0.5 - Math.random());
        item.quiz_options = options;
        item.correct_option = item.meaning;
      });
    }

    return {
      chapter_id: cid,
      mode,
      count: session_batch.length,
      due_count: due_words.length,
      new_count: new_words.length,
      items: session_batch
    };
  },

  calculateSM2(repetition, interval, easeFactor, rating) {
    let newRep = repetition || 0;
    let newInt = interval || 1.0;
    let newEf = easeFactor || 2.5;

    if (rating === 1) {
      newRep = 0;
      newInt = 0.05;
      newEf = Math.max(1.3, newEf - 0.2);
    } else if (rating === 2) {
      newRep = Math.max(1, newRep);
      newInt = Math.max(0.5, newInt * 1.2);
      newEf = Math.max(1.3, newEf - 0.15);
    } else if (rating === 3) {
      if (newRep === 0) newInt = 1.0;
      else if (newRep === 1) newInt = 3.0;
      else newInt = newInt * newEf;
      newRep += 1;
    } else {
      if (newRep === 0) newInt = 3.0;
      else if (newRep === 1) newInt = 6.0;
      else newInt = newInt * newEf * 1.3;
      newRep += 1;
      newEf += 0.15;
    }

    newInt = Math.min(180.0, Math.round(newInt * 100) / 100);
    newEf = Math.round(newEf * 100) / 100;
    return { repetition: newRep, interval: newInt, easeFactor: newEf };
  },

  recordProgress({ word_id, word, rating }) {
    const progress = this.getProgress();
    const mistakes = this.getMistakes();
    const now = new Date();

    const p = progress[word_id] || {
      repetition: 0,
      interval: 1.0,
      ease_factor: 2.5,
      history: []
    };

    const sm2 = this.calculateSM2(p.repetition, p.interval, p.ease_factor, rating);
    const nextReview = new Date(now.getTime() + sm2.interval * 24 * 60 * 60 * 1000);

    p.repetition = sm2.repetition;
    p.interval = sm2.interval;
    p.ease_factor = sm2.easeFactor;
    p.last_reviewed = now.toISOString();
    p.next_review = nextReview.toISOString();
    p.last_rating = rating;

    progress[word_id] = p;
    this.saveProgress(progress);

    if (rating === 1) {
      mistakes[word_id] = {
        word: word,
        mistake_count: (mistakes[word_id]?.mistake_count || 0) + 1,
        last_mistake: now.toISOString()
      };
      this.saveMistakes(mistakes);
    } else if (rating >= 3 && mistakes[word_id]) {
      delete mistakes[word_id];
      this.saveMistakes(mistakes);
    }

    return { status: 'success', word_id, repetition: sm2.repetition, interval: sm2.interval };
  },

  toggleStar(word_id) {
    const starred = this.getStarred();
    let is_starred = false;
    if (starred.has(word_id)) {
      starred.delete(word_id);
    } else {
      starred.add(word_id);
      is_starred = true;
    }
    this.saveStarred(starred);
    return { status: 'success', word_id, is_starred };
  },

  getStats() {
    const total = (this.wordsData && this.wordsData.words) ? this.wordsData.words.length : 0;
    const progress = this.getProgress();
    const mistakes = this.getMistakes();
    const starred = this.getStarred();
    const now = new Date();

    let learned = 0, mastered = 0, due = 0;
    Object.values(progress).forEach(p => {
      learned += 1;
      if (p.repetition >= 3) mastered += 1;
      if (p.next_review && new Date(p.next_review) <= now) due += 1;
    });

    return {
      total_words: total,
      learned,
      mastered,
      due_review: due,
      mistakes_count: Object.keys(mistakes).length,
      starred_count: starred.size,
      mastery_rate: total > 0 ? Math.round((mastered / total) * 1000) / 10 : 0
    };
  }
};

// Global State
const state = {
  currentTab: 'chapter',
  currentChapterId: 1,
  chapters: [],
  words: [],
  currentWordFilter: 'all',
  page: 1,
  limit: 60,
  totalWords: 0,
  
  // Voice & Audio
  voiceAccent: localStorage.getItem('voiceAccent') || 'en-GB', // 'en-GB' or 'en-US'
  autoPlayAudio: localStorage.getItem('autoPlayAudio') !== 'false',
  
  // Flashcard Session
  flashcardSession: {
    items: [],
    currentIndex: 0,
    isFlipped: false
  },
  
  // Spelling Session
  spellingSession: {
    items: [],
    currentIndex: 0,
    revealedLetters: 0
  },
  
  // Quiz Session
  quizSession: {
    items: [],
    currentIndex: 0,
    score: 0,
    combo: 0,
    timer: null,
    timeLeft: 10
  },
  
  // Notebook
  notebookType: 'starred', // 'starred' or 'mistakes'
  notebookWords: [],
  
  // Selected word for detail modal
  selectedWord: null,
  isSessionLoading: false
};

const originalViewTemplates = {};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  ['flashcard', 'spelling', 'quiz'].forEach(m => {
    const el = document.getElementById(`view-${m}`);
    if (el) originalViewTemplates[m] = el.innerHTML;
  });
  initIcons();
  setupKeyboardShortcuts();
  initVoiceSettings();
  
  // 核心：初始化本地数据源
  await DataManager.init();
  await loadChapters();
  await loadChapterWords();
  await loadGlobalStats();
});

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ----------------------------------------------------
// Navigation & Tab Switching
// ----------------------------------------------------
function switchTab(tabName) {
  state.currentTab = tabName;
  
  // Update nav tabs styling
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  const activeTabBtn = document.getElementById(`tab-${tabName}`);
  if (activeTabBtn) activeTabBtn.classList.add('active');
  
  // Update view visibility
  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.add('hidden');
    view.classList.remove('active');
  });
  const activeView = document.getElementById(`view-${tabName}`);
  if (activeView) {
    activeView.classList.remove('hidden');
    activeView.classList.add('active');
  }

  // Trigger tab-specific loaders
  if (tabName === 'chapter') {
    loadChapterWords();
  } else if (tabName === 'flashcard') {
    if (!state.flashcardSession.items.length) {
      loadStudySessionData('flashcard');
    } else {
      renderCurrentFlashcard();
    }
  } else if (tabName === 'spelling') {
    if (!state.spellingSession.items.length) {
      loadStudySessionData('spelling');
    } else {
      renderCurrentSpelling();
    }
  } else if (tabName === 'quiz') {
    if (!state.quizSession.items.length) {
      loadStudySessionData('quiz');
    } else {
      renderCurrentQuizQuestion();
    }
  } else if (tabName === 'notebook') {
    loadNotebookWords();
  } else if (tabName === 'stats') {
    loadGlobalStats();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  initIcons();
}

// ----------------------------------------------------
// Chapters & Data Loading
// ----------------------------------------------------
async function loadChapters() {
  try {
    const data = DataManager.getChapters();
    state.chapters = data;
    
    const select = document.getElementById('chapterSelect');
    select.innerHTML = '';
    
    data.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = `Chapter ${ch.id} · ${ch.name} (${ch.learned_words}/${ch.total_words})`;
      if (ch.id === state.currentChapterId) opt.selected = true;
      select.appendChild(opt);
    });

    updateChapterHeader();
  } catch (err) {
    console.error('Failed to load chapters:', err);
  }
}

function updateChapterHeader() {
  const ch = state.chapters.find(c => c.id === state.currentChapterId) || state.chapters[0];
  if (!ch) return;

  document.getElementById('chBadgeTitle').textContent = `Chapter ${ch.id} · ${ch.name}`;
  document.getElementById('chHeroName').textContent = ch.en || ch.name;
  document.getElementById('chHeroDesc').textContent = ch.desc || '刘洪波逻辑词群真经体系，串联核心雅思考试高频词汇。';
  
  const imgEl = document.getElementById('chIllustrationImg');
  imgEl.src = ch.illustration;
  imgEl.onerror = () => { imgEl.src = './assets/chapter_illustrations/chapter_1.png'; };

  // Quick stat pills
  document.getElementById('statChTotal').textContent = ch.total_words;
  document.getElementById('statChLearned').textContent = ch.learned_words;
  document.getElementById('statChMastered').textContent = ch.mastered_words;
  document.getElementById('statChDue').textContent = ch.due_review_words;
}

function changeChapter(chapterId) {
  state.currentChapterId = parseInt(chapterId);
  updateChapterHeader();
  loadChapterWords();
  state.flashcardSession.items = [];
  state.spellingSession.items = [];
  state.quizSession.items = [];
}

async function loadChapterWords() {
  try {
    const data = DataManager.getWords({
      chapter_id: state.currentChapterId,
      filter_status: state.currentWordFilter,
      page: state.page,
      limit: state.limit
    });
    state.words = data.items;
    state.totalWords = data.total;

    renderFilterCounts();
    renderWordsGrid(data.items);
  } catch (err) {
    console.error('Failed to load chapter words:', err);
  }
}

async function renderFilterCounts() {
  try {
    const ch = state.chapters.find(c => c.id === state.currentChapterId);
    if (!ch) return;
    document.getElementById('countFilterAll').textContent = ch.total_words;
    document.getElementById('countFilterNew').textContent = Math.max(0, ch.total_words - ch.learned_words);
    document.getElementById('countFilterLearning').textContent = Math.max(0, ch.learned_words - ch.mastered_words);
    document.getElementById('countFilterMastered').textContent = ch.mastered_words;
    document.getElementById('countFilterDue').textContent = ch.due_review_words;
  } catch (e) {}
}

function filterWords(filter, clickedBtn) {
  state.currentWordFilter = filter;
  document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
  if (clickedBtn) {
    clickedBtn.classList.add('active');
  } else {
    const matchedBtn = document.querySelector(`.filter-pill[onclick*="'${filter}'"]`);
    if (matchedBtn) matchedBtn.classList.add('active');
  }
  state.page = 1;
  loadChapterWords();
}

function renderWordsGrid(words) {
  const container = document.getElementById('chapterWordsGrid');
  if (!words || words.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-400">
        <i data-lucide="inbox" class="w-10 h-10 mx-auto mb-2 opacity-50"></i>
        <p class="text-sm">该分类下暂无单词</p>
      </div>
    `;
    initIcons();
    return;
  }

  container.innerHTML = words.map(w => {
    const isStarred = w.is_starred;
    const isMastered = w.progress && w.progress.repetition >= 3;
    const isDue = w.is_due;
    
    let statusBadge = '';
    if (isDue) {
      statusBadge = '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">待复习</span>';
    } else if (isMastered) {
      statusBadge = '<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">已熟记</span>';
    } else if (w.progress) {
      statusBadge = '<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">学习中</span>';
    }

    return `
      <div class="bg-white rounded-2xl p-4 border border-slate-200 hover:border-brand-500/40 hover:shadow-md transition cursor-pointer group flex flex-col justify-between" onclick="openWordDetailModal('${w.id}')">
        <div>
          <div class="flex items-start justify-between gap-2 mb-1.5">
            <div class="flex items-center gap-2">
              <h3 class="font-extrabold text-lg text-slate-900 group-hover:text-brand-600 transition">${w.display_word || w.word}</h3>
              <button onclick="event.stopPropagation(); playAudio(this.dataset.word)" data-word="${w.word.replace(/"/g, '&quot;')}" class="p-1 rounded-full text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition" title="朗读">
                <i data-lucide="volume-2" class="w-4 h-4"></i>
              </button>
            </div>
            <div class="flex items-center gap-1.5">
              ${statusBadge}
              <button onclick="event.stopPropagation(); toggleStarWordById('${w.id}', this)" class="p-1 text-slate-300 hover:text-amber-400 transition ${isStarred ? 'text-amber-400 fill-amber-400' : ''}">
                <i data-lucide="star" class="w-4 h-4 ${isStarred ? 'fill-amber-400 text-amber-400' : ''}"></i>
              </button>
            </div>
          </div>

          <div class="text-xs font-mono text-slate-400 mb-2">${w.phonetic || ''}</div>
          <div class="text-sm font-semibold text-slate-800 line-clamp-2">${w.meaning || '暂无释义'}</div>
          ${w.en_definition ? `<div class="text-xs text-slate-500 font-medium line-clamp-2 mt-1.5 italic">${w.en_definition}</div>` : ''}
        </div>

        ${w.collocations && w.collocations.length > 0 ? `
          <div class="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500 line-clamp-1">
            <span class="font-bold text-amber-700">[搭]</span> ${w.collocations[0]}
          </div>
        ` : (w.examples && w.examples.length > 0 ? `
          <div class="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500 line-clamp-1 italic">
            <span class="font-bold text-blue-600">[例]</span> ${w.examples[0]}
          </div>
        ` : '')}
      </div>
    `;
  }).join('');

  initIcons();
}

// ----------------------------------------------------
// Pronunciation (Web Speech API + Dual Accent)
// ----------------------------------------------------
function initVoiceSettings() {
  const accentBtn = document.getElementById('accentToggleBtn');
  const flagSpan = document.getElementById('accentFlag');
  const textSpan = document.getElementById('accentText');
  
  if (state.voiceAccent === 'en-GB') {
    flagSpan.textContent = '🇬🇧';
    textSpan.textContent = '英音 (UK)';
  } else {
    flagSpan.textContent = '🇺🇸';
    textSpan.textContent = '美音 (US)';
  }

  const autoIcon = document.getElementById('autoPlayIcon');
  if (!state.autoPlayAudio) {
    autoIcon.classList.remove('text-brand-600');
    autoIcon.classList.add('text-slate-400');
  }
}

function toggleVoiceAccent() {
  state.voiceAccent = state.voiceAccent === 'en-GB' ? 'en-US' : 'en-GB';
  localStorage.setItem('voiceAccent', state.voiceAccent);
  initVoiceSettings();
  playAudio('Welcome to IELTS vocabulary');
}

function toggleAutoPlay() {
  state.autoPlayAudio = !state.autoPlayAudio;
  localStorage.setItem('autoPlayAudio', state.autoPlayAudio);
  initVoiceSettings();
}

let currentSpeechUtterance = null;
function playAudio(text) {
  if (!text || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    setTimeout(() => {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        currentSpeechUtterance = utterance;
        utterance.lang = state.voiceAccent || 'en-GB';
        utterance.rate = 0.92;
        
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const targetVoice = voices.find(v => v.lang === state.voiceAccent) || 
                              voices.find(v => v.lang.startsWith('en'));
          if (targetVoice) {
            utterance.voice = targetVoice;
          }
        }
        utterance.onend = () => { currentSpeechUtterance = null; };
        utterance.onerror = () => { currentSpeechUtterance = null; };
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn('Speech synthesis speak error:', e);
      }
    }, 30);
  } catch (err) {
    console.warn('Speech synthesis cancel error:', err);
  }
}

// ----------------------------------------------------
// 🎴 艾宾浩斯智能卡片 (Flashcards)
// ----------------------------------------------------
async function startSessionWithMode(mode) {
  if (state[`${mode}Session`]) {
    state[`${mode}Session`].items = [];
    state[`${mode}Session`].currentIndex = 0;
  }
  switchTab(mode);
}

async function loadStudySessionData(mode, forceReload = false) {
  if (state.isSessionLoading) return;
  
  const currentSess = state[`${mode}Session`];
  if (!forceReload && currentSess && currentSess.items && currentSess.items.length > 0) {
    if (mode === 'flashcard') renderCurrentFlashcard();
    else if (mode === 'spelling') renderCurrentSpelling();
    else if (mode === 'quiz') renderCurrentQuizQuestion();
    return;
  }

  // 恢复原始模板结构
  if (originalViewTemplates[mode]) {
    const viewEl = document.getElementById(`view-${mode}`);
    if (viewEl && !document.getElementById(mode === 'flashcard' ? 'flashcardElement' : (mode === 'spelling' ? 'spellInput' : 'quizOptionsContainer'))) {
      viewEl.innerHTML = originalViewTemplates[mode];
      initIcons();
    }
  }

  state.isSessionLoading = true;
  try {
    const data = DataManager.getStudySession(state.currentChapterId, mode, 20);
    
    if (mode === 'flashcard') {
      state.flashcardSession.items = data.items || [];
      state.flashcardSession.currentIndex = 0;
      state.flashcardSession.isFlipped = false;
      renderCurrentFlashcard();
    } else if (mode === 'spelling') {
      state.spellingSession.items = data.items || [];
      state.spellingSession.currentIndex = 0;
      state.spellingSession.revealedLetters = 0;
      renderCurrentSpelling();
    } else if (mode === 'quiz') {
      state.quizSession.items = data.items || [];
      state.quizSession.currentIndex = 0;
      state.quizSession.score = 0;
      state.quizSession.combo = 0;
      renderCurrentQuizQuestion();
    }
  } catch (err) {
    console.error(`Failed to load ${mode} session:`, err);
  } finally {
    state.isSessionLoading = false;
  }
}

function renderCurrentFlashcard() {
  const sess = state.flashcardSession;
  if (!sess.items || sess.currentIndex >= sess.items.length) {
    showSessionFinished('flashcard');
    return;
  }

  const word = sess.items[sess.currentIndex];
  sess.isFlipped = false;
  sess.isRated = false;
  
  const cardEl = document.getElementById('flashcardElement');
  cardEl.classList.remove('is-flipped');

  // Reset rating buttons & next action bar
  const ratingBtns = document.getElementById('fcRatingButtons');
  const nextBar = document.getElementById('fcNextActionBar');
  if (ratingBtns) ratingBtns.classList.remove('hidden');
  if (nextBar) nextBar.classList.add('hidden');

  // Reset front en definition
  const frontEnEl = document.getElementById('fcFrontEnDefinition');
  const frontEnCont = document.getElementById('fcFrontEnDefContainer');
  const frontMeaning = document.getElementById('fcFrontMeaning');
  if (frontEnEl && frontEnCont) {
    if (word.en_definition) {
      frontEnEl.textContent = word.en_definition;
      if (frontMeaning) frontMeaning.textContent = word.meaning || '';
    } else {
      frontEnEl.textContent = '';
      if (frontMeaning) frontMeaning.textContent = '';
    }
    frontEnCont.classList.add('hidden');
  }

  // Update progress
  document.getElementById('fcSessionStatus').textContent = `第 ${sess.currentIndex + 1} / ${sess.items.length} 词`;
  const pct = ((sess.currentIndex) / sess.items.length) * 100;
  document.getElementById('fcProgressBar').style.width = `${pct}%`;

  // Front data
  document.getElementById('fcFrontWord').textContent = word.display_word || word.word;
  document.getElementById('fcFrontPhonetic').textContent = word.phonetic || '';
  document.getElementById('fcFrontChapter').textContent = `Chapter ${word.chapter_id || state.currentChapterId}`;

  // Star status
  const starBtn = document.getElementById('fcStarBtn');
  starBtn.innerHTML = `<i data-lucide="star" class="w-5 h-5 ${word.is_starred ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}"></i>`;

  // Back data
  document.getElementById('fcBackWord').textContent = word.display_word || word.word;
  document.getElementById('fcBackPhonetic').textContent = word.phonetic || '';
  document.getElementById('fcBackMeaning').textContent = word.meaning || '暂无释义';
  const enDefEl = document.getElementById('fcBackEnDefinition');
  const enDefCont = document.getElementById('fcBackEnDefContainer');
  if (enDefEl) {
    if (word.en_definition) {
      enDefEl.textContent = word.en_definition;
      if (enDefCont) enDefCont.classList.remove('hidden');
    } else {
      enDefEl.textContent = '';
      if (enDefCont) enDefCont.classList.add('hidden');
    }
  }
  document.getElementById('fcBackPage').textContent = word.page ? `P.${String(word.page).padStart(3, '0')}` : '';

  // Collocations
  const colEl = document.getElementById('fcBackCollocations');
  const colCont = document.getElementById('fcBackCollocContainer');
  if (word.collocations && word.collocations.length > 0) {
    colCont.classList.remove('hidden');
    colEl.textContent = word.collocations.join('; ');
  } else {
    colCont.classList.add('hidden');
  }

  // Examples
  const exEl = document.getElementById('fcBackExample');
  const exCont = document.getElementById('fcBackExContainer');
  if (word.examples && word.examples.length > 0) {
    exCont.classList.remove('hidden');
    exEl.textContent = word.examples[0];
  } else {
    exCont.classList.add('hidden');
  }

  // Memory Tips
  const memEl = document.getElementById('fcBackMemory');
  const memCont = document.getElementById('fcBackMemoryContainer');
  if (word.memory_tip) {
    memCont.classList.remove('hidden');
    memEl.textContent = word.memory_tip;
  } else {
    memCont.classList.add('hidden');
  }

  if (state.autoPlayAudio) {
    playAudio(word.word);
  }

  initIcons();
}

function flipFlashcard() {
  const sess = state.flashcardSession;
  sess.isFlipped = !sess.isFlipped;
  const cardEl = document.getElementById('flashcardElement');
  if (sess.isFlipped) {
    cardEl.classList.add('is-flipped');
  } else {
    cardEl.classList.remove('is-flipped');
  }
}

function playCurrentWordAudio() {
  const sess = state.flashcardSession;
  if (sess.items[sess.currentIndex]) {
    playAudio(sess.items[sess.currentIndex].word);
  }
}

async function rateCard(rating) {
  const sess = state.flashcardSession;
  const item = sess.items[sess.currentIndex];
  if (!item) return;

  DataManager.recordProgress({
    word_id: item.id || `${item.chapter_id}_${item.word}`,
    word: item.word,
    rating: rating,
    study_mode: 'flashcard'
  });

  sess.isRated = true;

  // 1. 强制翻转到背面并确保展开英文释义：无论认识还是不认识，均立即展示背面完整释义
  sess.isFlipped = true;
  const cardEl = document.getElementById('flashcardElement');
  if (cardEl) {
    cardEl.classList.add('is-flipped');
    const backEl = cardEl.querySelector('.flashcard-back');
    if (backEl) backEl.scrollTop = 0;
  }

  // 同时揭晓正面的英文释义区块（防翻面被手动切回时仍可见）
  const frontEnCont = document.getElementById('fcFrontEnDefContainer');
  if (frontEnCont) frontEnCont.classList.remove('hidden');

  // 2. 切换底部操作区为“下一个单词”与评级状态反馈
  const ratingBtns = document.getElementById('fcRatingButtons');
  const nextBar = document.getElementById('fcNextActionBar');
  const feedbackEl = document.getElementById('fcRatingFeedback');

  const ratingInfo = {
    1: { text: '不认识（5分钟后强化重现）', bg: 'bg-red-100', textCol: 'text-red-700', icon: 'alert-circle' },
    2: { text: '模糊（12小时后复习）', bg: 'bg-amber-100', textCol: 'text-amber-700', icon: 'help-circle' },
    3: { text: '认识（1-3天后巩固）', bg: 'bg-blue-100', textCol: 'text-blue-700', icon: 'check' },
    4: { text: '熟记已斩（1周后巩固）', bg: 'bg-emerald-100', textCol: 'text-emerald-700', icon: 'sparkles' }
  }[rating] || { text: '已记录记忆状态', bg: 'bg-slate-100', textCol: 'text-slate-700', icon: 'check' };

  if (feedbackEl) {
    feedbackEl.innerHTML = `
      <span class="px-3 py-1.5 rounded-full ${ratingInfo.bg} ${ratingInfo.textCol} text-xs font-bold flex items-center gap-1.5 shadow-xs">
        <i data-lucide="${ratingInfo.icon}" class="w-3.5 h-3.5"></i>
        <span>已记录：${ratingInfo.text}</span>
      </span>
      <span class="text-xs text-slate-500 hidden sm:inline">已自动揭晓英文释义与真题搭配</span>
    `;
  }

  if (ratingBtns) ratingBtns.classList.add('hidden');
  if (nextBar) nextBar.classList.remove('hidden');

  initIcons();
}

function nextFlashcard() {
  const sess = state.flashcardSession;
  sess.currentIndex += 1;
  renderCurrentFlashcard();
}

async function toggleStarCurrentWord() {
  const sess = state.flashcardSession;
  const item = sess.items[sess.currentIndex];
  if (!item) return;

  const data = DataManager.toggleStar(item.id);
  item.is_starred = data.is_starred;
  const starBtn = document.getElementById('fcStarBtn');
  starBtn.innerHTML = `<i data-lucide="star" class="w-5 h-5 ${item.is_starred ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}"></i>`;
  initIcons();
}

// ----------------------------------------------------
// ✍️ 听音默写与拼写 (Spelling)
// ----------------------------------------------------
function renderCurrentSpelling() {
  const sess = state.spellingSession;
  if (!sess.items || sess.currentIndex >= sess.items.length) {
    showSessionFinished('spelling');
    return;
  }

  const word = sess.items[sess.currentIndex];
  sess.revealedLetters = 0;

  document.getElementById('spellChapterTag').textContent = `Chapter ${word.chapter_id || state.currentChapterId} · 拼写闯关`;
  document.getElementById('spellProgress').textContent = `第 ${sess.currentIndex + 1} / ${sess.items.length} 词`;
  document.getElementById('spellPhoneticHint').textContent = word.phonetic || '/???/';
  document.getElementById('spellMeaning').textContent = word.meaning || '根据读音拼写单词';

  const collocHintEl = document.getElementById('spellCollocHint');
  if (word.examples && word.examples.length > 0) {
    const cleanWord = word.word.trim();
    const safeRegexWord = cleanWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${safeRegexWord}\\b`, 'gi');
    const clozeEx = word.examples[0].replace(regex, '____');
    collocHintEl.textContent = `语境线索: ${clozeEx}`;
  } else {
    collocHintEl.textContent = `总长 ${word.word.length} 个字母`;
  }

  updateSpellSlots(word.word, 0);

  const inputEl = document.getElementById('spellInput');
  inputEl.value = '';
  inputEl.disabled = false;
  inputEl.focus();

  const fbEl = document.getElementById('spellFeedback');
  fbEl.className = 'hidden';
  fbEl.innerHTML = '';

  playAudio(word.word);
}

function updateSpellSlots(targetWord, revealedCount) {
  const slotsEl = document.getElementById('spellSlots');
  let html = '';
  for (let i = 0; i < targetWord.length; i++) {
    const char = targetWord[i];
    if (i < revealedCount || char === ' ' || char === '-') {
      html += `<span class="text-brand-600 border-b-2 border-brand-500 pb-1">${char}</span>`;
    } else {
      html += `<span class="border-b-2 border-slate-300 pb-1">_</span>`;
    }
  }
  slotsEl.innerHTML = html;
}

function playSpellingAudio() {
  const sess = state.spellingSession;
  const word = sess.items[sess.currentIndex];
  if (word) playAudio(word.word);
}

function revealLetterHint() {
  const sess = state.spellingSession;
  const word = sess.items[sess.currentIndex];
  if (!word) return;
  sess.revealedLetters = Math.min(word.word.length - 1, sess.revealedLetters + 1);
  updateSpellSlots(word.word, sess.revealedLetters);
  document.getElementById('spellInput').focus();
}

function giveUpSpelling() {
  const sess = state.spellingSession;
  const word = sess.items[sess.currentIndex];
  if (!word) return;

  const fbEl = document.getElementById('spellFeedback');
  fbEl.className = 'p-4 rounded-2xl bg-amber-50 text-amber-800 border border-amber-200 text-sm';
  fbEl.innerHTML = `
    <div class="font-bold text-base mb-1">正确答案：${word.display_word || word.word}</div>
    <div class="text-xs">${word.meaning || ''}</div>
    <button onclick="nextSpellingWord(1)" class="mt-3 px-4 py-1.5 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 transition">
      记住了，下一词
    </button>
  `;
  document.getElementById('spellInput').disabled = true;
  playAudio(word.word);
}

async function handleSpellingSubmit(e) {
  e.preventDefault();
  const inputEl = document.getElementById('spellInput');
  const guess = inputEl.value.trim().toLowerCase();
  const sess = state.spellingSession;
  const word = sess.items[sess.currentIndex];
  if (!word) return;

  const correct = word.word.trim().toLowerCase();
  const fbEl = document.getElementById('spellFeedback');

  if (guess === correct) {
    inputEl.disabled = true;
    fbEl.className = 'p-3 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold flex items-center justify-center gap-2';
    fbEl.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4"></i> 拼写完全正确！`;
    initIcons();

    DataManager.recordProgress({
      word_id: word.id || `${word.chapter_id}_${word.word}`,
      word: word.word,
      rating: sess.revealedLetters > 0 ? 3 : 4,
      study_mode: 'spelling'
    });

    setTimeout(() => {
      sess.currentIndex += 1;
      renderCurrentSpelling();
    }, 1200);
  } else {
    inputEl.classList.add('shake');
    setTimeout(() => inputEl.classList.remove('shake'), 500);

    fbEl.className = 'p-3 rounded-2xl bg-red-50 text-red-700 border border-red-200 text-xs font-semibold';
    fbEl.innerHTML = `拼写有误，请仔细听发音再试一次，或点击下方提示`;

    DataManager.recordProgress({
      word_id: word.id || `${word.chapter_id}_${word.word}`,
      word: word.word,
      rating: 1,
      study_mode: 'spelling'
    });
  }
}

function nextSpellingWord(rating) {
  const sess = state.spellingSession;
  sess.currentIndex += 1;
  renderCurrentSpelling();
}

// ----------------------------------------------------
// 🎯 四选一极速闯关 (Quiz)
// ----------------------------------------------------
function renderCurrentQuizQuestion() {
  const sess = state.quizSession;
  if (!sess.items || sess.currentIndex >= sess.items.length) {
    showSessionFinished('quiz');
    return;
  }

  const word = sess.items[sess.currentIndex];
  document.getElementById('quizProgress').textContent = `题目 ${sess.currentIndex + 1} / ${sess.items.length}`;
  document.getElementById('quizScore').textContent = sess.score;
  document.getElementById('quizCombo').textContent = sess.combo;

  document.getElementById('quizQuestionWord').textContent = word.display_word || word.word;
  document.getElementById('quizQuestionPhonetic').textContent = word.phonetic || '';

  const fbBox = document.getElementById('quizFeedbackBox');
  fbBox.className = 'hidden';

  const optContainer = document.getElementById('quizOptionsContainer');
  const options = word.quiz_options || [word.meaning, '其他干扰项A', '其他干扰项B', '其他干扰项C'];

  optContainer.innerHTML = options.map((opt, idx) => `
    <button 
      onclick="handleQuizAnswerByIndex(this, ${idx})" 
      class="quiz-option-btn w-full p-4 rounded-2xl bg-slate-50 hover:bg-brand-50 hover:border-brand-300 border-2 border-slate-200 text-left font-semibold text-slate-800 text-sm transition flex items-center justify-between"
    >
      <span class="flex items-center gap-3">
        <span class="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold font-mono">${String.fromCharCode(65 + idx)}</span>
        <span>${opt}</span>
      </span>
      <span class="result-icon"></span>
    </button>
  `).join('');

  if (state.autoPlayAudio) {
    playAudio(word.word);
  }

  startQuizTimer();
}

function playQuizWordAudio() {
  const sess = state.quizSession;
  const word = sess.items[sess.currentIndex];
  if (word) playAudio(word.word);
}

function startQuizTimer() {
  if (state.quizSession.timer) clearInterval(state.quizSession.timer);
  state.quizSession.timeLeft = 10;
  const timerBar = document.getElementById('quizTimerBar');
  timerBar.style.width = '100%';

  state.quizSession.timer = setInterval(() => {
    state.quizSession.timeLeft -= 0.1;
    const pct = Math.max(0, (state.quizSession.timeLeft / 10) * 100);
    timerBar.style.width = `${pct}%`;

    if (state.quizSession.timeLeft <= 0) {
      clearInterval(state.quizSession.timer);
      handleQuizTimeout();
    }
  }, 100);
}

async function handleQuizAnswerByIndex(buttonEl, selectedIdx) {
  if (state.quizSession.timer) clearInterval(state.quizSession.timer);

  const sess = state.quizSession;
  const currentWord = sess.items[sess.currentIndex];
  if (!currentWord) return;

  const options = currentWord.quiz_options || [currentWord.meaning, '其他干扰项A', '其他干扰项B', '其他干扰项C'];
  const chosen = options[selectedIdx];
  const correct = currentWord.correct_option || currentWord.meaning;
  const isCorrect = chosen === correct;

  document.querySelectorAll('.quiz-option-btn').forEach(btn => {
    btn.disabled = true;
    btn.classList.add('cursor-not-allowed', 'opacity-70');
  });

  if (isCorrect) {
    buttonEl.classList.remove('bg-slate-50', 'hover:bg-brand-50');
    buttonEl.classList.add('bg-emerald-50', 'border-emerald-500', 'text-emerald-800', 'correct-glow');
    buttonEl.querySelector('.result-icon').innerHTML = '<i data-lucide="check" class="w-5 h-5 text-emerald-600"></i>';
    
    sess.combo += 1;
    sess.score += 10 + Math.min(20, sess.combo * 2);
    document.getElementById('quizScore').textContent = sess.score;
    document.getElementById('quizCombo').textContent = sess.combo;

    DataManager.recordProgress({
      word_id: currentWord.id || `${currentWord.chapter_id}_${currentWord.word}`,
      word: currentWord.word,
      rating: 4,
      study_mode: 'quiz'
    });
  } else {
    buttonEl.classList.remove('bg-slate-50', 'hover:bg-brand-50');
    buttonEl.classList.add('bg-red-50', 'border-red-500', 'text-red-800');
    buttonEl.querySelector('.result-icon').innerHTML = '<i data-lucide="x" class="w-5 h-5 text-red-600"></i>';

    document.querySelectorAll('.quiz-option-btn').forEach((btn, i) => {
      if (options[i] === correct) {
        btn.classList.add('bg-emerald-50', 'border-emerald-500', 'text-emerald-800');
      }
    });

    sess.combo = 0;
    document.getElementById('quizCombo').textContent = 0;

    DataManager.recordProgress({
      word_id: currentWord.id || `${currentWord.chapter_id}_${currentWord.word}`,
      word: currentWord.word,
      rating: 1,
      study_mode: 'quiz'
    });
  }

  initIcons();

  setTimeout(() => {
    sess.currentIndex += 1;
    renderCurrentQuizQuestion();
  }, 1200);
}

function handleQuizTimeout() {
  const sess = state.quizSession;
  sess.combo = 0;
  document.getElementById('quizCombo').textContent = 0;
  
  const fbBox = document.getElementById('quizFeedbackBox');
  fbBox.className = 'p-3 rounded-2xl bg-amber-50 text-amber-700 text-xs font-bold';
  fbBox.textContent = '⏰ 答题超时，自动进入下一题！';

  setTimeout(() => {
    sess.currentIndex += 1;
    renderCurrentQuizQuestion();
  }, 1000);
}

// ----------------------------------------------------
// Session Complete Screen
// ----------------------------------------------------
function showSessionFinished(mode) {
  let viewId = `view-${mode}`;
  const container = document.getElementById(viewId);
  container.innerHTML = `
    <div class="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200 shadow-xl text-center space-y-6 max-w-xl mx-auto">
      <div class="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-3xl">
        🎉
      </div>
      <div class="space-y-2">
        <h2 class="text-3xl font-black text-slate-900">恭喜！本轮记忆训练达成！</h2>
        <p class="text-slate-500 text-sm">系统已根据记忆遗忘曲线将所学词汇智能录入复习排期。</p>
      </div>

      <div class="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-around text-center">
        <div>
          <div class="text-xs text-slate-400 font-bold">完成词数</div>
          <div class="text-xl font-black text-slate-800">20 词</div>
        </div>
        <div>
          <div class="text-xs text-slate-400 font-bold">记忆模式</div>
          <div class="text-xl font-black text-brand-600">${mode === 'flashcard' ? '艾宾浩斯闪卡' : (mode === 'spelling' ? '听音拼写' : '极速闯关')}</div>
        </div>
        <div>
          <div class="text-xs text-slate-400 font-bold">当前章节</div>
          <div class="text-xl font-black text-slate-800">Ch.${state.currentChapterId}</div>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
        <button onclick="startSessionWithMode('${mode}')" class="px-6 py-3 rounded-2xl bg-brand-500 text-white font-bold text-sm shadow-lg shadow-brand-500/25 hover:bg-brand-600 transition">
          再来一组 (20词)
        </button>
        <button onclick="switchTab('chapter')" class="px-6 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition">
          返回词群全景
        </button>
      </div>
    </div>
  `;
  loadChapters();
}

// ----------------------------------------------------
// 📚 生词本与错题集 (Notebooks)
// ----------------------------------------------------
async function loadNotebookWords() {
  try {
    const data = DataManager.getWords({
      filter_status: state.notebookType === 'starred' ? 'starred' : 'mistake',
      limit: 100
    });
    state.notebookWords = data.items;
    renderNotebookWords();
  } catch (err) {
    console.error('Failed to load notebook words:', err);
  }
}

function switchNotebookType(type) {
  state.notebookType = type;
  document.getElementById('nbBtnStarred').classList.toggle('active', type === 'starred');
  document.getElementById('nbBtnMistakes').classList.toggle('active', type === 'mistakes');
  loadNotebookWords();
}

function renderNotebookWords() {
  const container = document.getElementById('notebookWordsList');
  const words = state.notebookWords;

  if (!words || words.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-16 text-center text-slate-400">
        <i data-lucide="check-circle-2" class="w-12 h-12 mx-auto mb-3 text-emerald-400"></i>
        <p class="text-base font-bold text-slate-600">暂无${state.notebookType === 'starred' ? '生词' : '顽固错题'}</p>
        <p class="text-xs text-slate-400 mt-1">在背单词或测验中标记的词汇将自动归集到此处</p>
      </div>
    `;
    initIcons();
    return;
  }

  container.innerHTML = words.map(w => `
    <div class="bg-white rounded-2xl p-4 border border-slate-200 hover:border-brand-500/40 hover:shadow-md transition flex flex-col justify-between" onclick="openWordDetailModal('${w.id}')">
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-2">
            <h3 class="font-black text-lg text-slate-900">${w.display_word || w.word}</h3>
            <button onclick="event.stopPropagation(); playAudio('${w.word}')" class="text-slate-400 hover:text-brand-600">
              <i data-lucide="volume-2" class="w-4 h-4"></i>
            </button>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-bold">Ch.${w.chapter_id}</span>
        </div>
        <div class="text-xs font-mono text-slate-400 mb-1.5">${w.phonetic || ''}</div>
        <div class="text-sm font-semibold text-slate-800 line-clamp-2">${w.meaning || ''}</div>
        ${w.en_definition ? `<div class="text-xs text-slate-500 font-medium line-clamp-2 mt-1.5 italic">${w.en_definition}</div>` : ''}
      </div>

      <div class="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
        <span class="text-slate-400">P.${w.page || ''}</span>
        <button onclick="event.stopPropagation(); removeWordFromNotebook('${w.id}', '${w.word}')" class="text-red-500 hover:underline font-bold">
          移除
        </button>
      </div>
    </div>
  `).join('');

  initIcons();
}

async function removeWordFromNotebook(wordId, word) {
  if (state.notebookType === 'starred') {
    DataManager.toggleStar(wordId);
  } else {
    DataManager.recordProgress({ word_id: wordId, word: word, rating: 4 });
  }
  loadNotebookWords();
  loadGlobalStats();
}

function startNotebookSpecialTraining() {
  if (state.notebookWords.length === 0) {
    alert('当前列表中没有单词可特训');
    return;
  }
  state.flashcardSession.items = [...state.notebookWords];
  state.flashcardSession.currentIndex = 0;
  state.flashcardSession.isFlipped = false;
  switchTab('flashcard');
}

async function clearNotebookCurrent() {
  const typeName = state.notebookType === 'starred' ? '生词本' : '错题集';
  if (!confirm(`确定要清空当前的${typeName}吗？`)) {
    return;
  }
  if (state.notebookType === 'starred') {
    DataManager.saveStarred(new Set());
  } else {
    DataManager.saveMistakes({});
  }
  loadNotebookWords();
  loadGlobalStats();
}

// ----------------------------------------------------
// 📊 记忆看板与数据分析 (Stats)
// ----------------------------------------------------
async function loadGlobalStats() {
  try {
    const data = DataManager.getStats();

    document.getElementById('statGlobalTotal').textContent = data.total_words;
    document.getElementById('statGlobalLearned').textContent = data.learned;
    document.getElementById('statGlobalMastered').textContent = data.mastered;
    document.getElementById('statGlobalDue').textContent = data.due_review;
    document.getElementById('statGlobalRate').textContent = `${data.mastery_rate}%`;

    document.getElementById('nbStarredCount').textContent = data.starred_count;
    document.getElementById('nbMistakesCount').textContent = data.mistakes_count;

    const badge = document.getElementById('notebookBadge');
    if (data.mistakes_count > 0) {
      badge.textContent = data.mistakes_count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    renderChapterProgressTable();
  } catch (err) {
    console.error('Failed to load global stats:', err);
  }
}

function renderChapterProgressTable() {
  const tbody = document.getElementById('chapterProgressTableBody');
  if (!tbody || !state.chapters) return;

  tbody.innerHTML = state.chapters.map(ch => {
    const pct = ch.total_words > 0 ? Math.round((ch.mastered_words / ch.total_words) * 100) : 0;
    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="py-3.5 font-mono font-bold text-xs text-brand-600">Chapter ${ch.id}</td>
        <td class="py-3.5 font-bold text-slate-800">
          <div>${ch.name}</div>
          <div class="text-[11px] text-slate-400 font-normal">${ch.en}</div>
        </td>
        <td class="py-3.5 text-slate-600 text-xs font-semibold">${ch.total_words} 词</td>
        <td class="py-3.5">
          <div class="flex items-center gap-3">
            <div class="w-32 bg-slate-100 rounded-full h-2 overflow-hidden">
              <div class="bg-gradient-to-r from-brand-500 to-emerald-500 h-full rounded-full" style="width: ${pct}%"></div>
            </div>
            <span class="text-xs font-mono font-bold text-slate-600">${pct}%</span>
          </div>
        </td>
        <td class="py-3.5 text-right">
          <button onclick="changeChapter(${ch.id}); switchTab('chapter');" class="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition">
            开始复习
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ----------------------------------------------------
// Global Search
// ----------------------------------------------------
let searchDebounceTimer = null;
function handleGlobalSearch(query) {
  clearTimeout(searchDebounceTimer);
  const dropdown = document.getElementById('searchDropdown');
  if (!query || query.trim().length < 2) {
    dropdown.classList.add('hidden');
    return;
  }

  searchDebounceTimer = setTimeout(() => {
    try {
      const data = DataManager.getWords({ query: query.trim(), limit: 10 });
      
      if (data.items.length === 0) {
        dropdown.innerHTML = `<div class="p-4 text-xs text-slate-400 text-center">无匹配结果</div>`;
      } else {
        dropdown.innerHTML = data.items.map(w => `
          <div class="p-3 border-b border-slate-100 hover:bg-brand-50/50 cursor-pointer transition flex items-center justify-between" onclick="selectSearchResult('${w.id}')">
            <div>
              <span class="font-bold text-slate-900 text-sm">${w.display_word || w.word}</span>
              <span class="text-xs text-slate-400 font-mono ml-2">${w.phonetic || ''}</span>
              <p class="text-xs text-slate-600 truncate mt-0.5">${w.meaning}</p>
            </div>
            <span class="text-[10px] text-slate-400 font-semibold px-2 py-0.5 rounded bg-slate-100">Ch.${w.chapter_id}</span>
          </div>
        `).join('');
      }
      dropdown.classList.remove('hidden');
    } catch (e) {}
  }, 150);
}

function selectSearchResult(wordId) {
  document.getElementById('searchDropdown').classList.add('hidden');
  document.getElementById('globalSearchInput').value = '';
  openWordDetailModal(wordId);
}

// ----------------------------------------------------
// Word Detail Modal
// ----------------------------------------------------
async function openWordDetailModal(wordId) {
  let word = (state.words && state.words.find(w => w.id === wordId)) || 
             (state.notebookWords && state.notebookWords.find(w => w.id === wordId));
  
  if (!word && DataManager.wordsData) {
    word = DataManager.wordsData.words.find(w => w.id === wordId);
  }
  if (!word) return;

  const starred = DataManager.getStarred();
  word.is_starred = starred.has(word.id);

  state.selectedWord = word;
  document.getElementById('wdChapterBadge').textContent = `Chapter ${word.chapter_id || state.currentChapterId} · ${word.chapter_name || ''}`;
  document.getElementById('wdWord').textContent = word.display_word || word.word;
  document.getElementById('wdPhonetic').textContent = word.phonetic || '';
  document.getElementById('wdMeaning').textContent = word.meaning || '暂无详细释义';

  const enDefEl = document.getElementById('wdEnDefinition');
  const enCont = document.getElementById('wdEnContainer');
  if (enDefEl && enCont) {
    if (word.en_definition) {
      enCont.classList.remove('hidden');
      enDefEl.textContent = word.en_definition;
    } else {
      enCont.classList.add('hidden');
    }
  }

  document.getElementById('wdCollocations').textContent = (word.collocations && word.collocations.length > 0) ? word.collocations.join('; ') : '暂无高频搭配';
  document.getElementById('wdExamples').textContent = (word.examples && word.examples.length > 0) ? word.examples[0] : '暂无真题例句';
  document.getElementById('wdMemory').textContent = word.memory_tip || '真经逻辑词群记忆词条';

  const starBtn = document.getElementById('wdStarBtn');
  const starText = document.getElementById('wdStarText');
  if (word.is_starred) {
    starBtn.classList.add('bg-amber-50', 'text-amber-600', 'border-amber-300');
    starText.textContent = '已在生词本中';
  } else {
    starBtn.classList.remove('bg-amber-50', 'text-amber-600', 'border-amber-300');
    starText.textContent = '加入生词本';
  }

  document.getElementById('wordDetailModal').classList.remove('hidden');
  initIcons();
  playAudio(word.word);
}

function closeWordDetailModal() {
  document.getElementById('wordDetailModal').classList.add('hidden');
}

function playWordDetailAudio() {
  if (state.selectedWord) playAudio(state.selectedWord.word);
}

async function toggleStarInDetailModal() {
  if (!state.selectedWord) return;
  const res = DataManager.toggleStar(state.selectedWord.id);
  state.selectedWord.is_starred = res.is_starred;
  openWordDetailModal(state.selectedWord.id);
}

async function toggleStarWord(wordId, wordText, buttonEl) {
  try {
    const data = DataManager.toggleStar(wordId);
    if (buttonEl) {
      const starIcon = buttonEl.querySelector('svg');
      if (starIcon) {
        starIcon.classList.toggle('fill-amber-400', data.is_starred);
        starIcon.classList.toggle('text-amber-400', data.is_starred);
      }
    }
    loadGlobalStats();
  } catch (e) {}
}

async function toggleStarWordById(wordId, buttonEl) {
  const word = (state.words && state.words.find(w => w.id === wordId)) || 
               (state.notebookWords && state.notebookWords.find(w => w.id === wordId)) || 
               (state.selectedWord && state.selectedWord.id === wordId ? state.selectedWord : null);
  const wordText = word ? word.word : wordId;
  await toggleStarWord(wordId, wordText, buttonEl);
}

// ----------------------------------------------------
// Illustration Modal
// ----------------------------------------------------
function openIllustrationModal() {
  const ch = state.chapters.find(c => c.id === state.currentChapterId);
  if (!ch) return;
  document.getElementById('modalIllustrationImg').src = ch.illustration;
  document.getElementById('illustrationModal').classList.remove('hidden');
}

function closeIllustrationModal() {
  document.getElementById('illustrationModal').classList.add('hidden');
}

// ----------------------------------------------------
// Keyboard Shortcuts
// ----------------------------------------------------
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (['input', 'textarea', 'select'].includes(document.activeElement.tagName.toLowerCase())) {
      return;
    }

    if (state.currentTab === 'flashcard') {
      const sess = state.flashcardSession;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (sess && sess.isRated) {
          nextFlashcard();
        } else {
          flipFlashcard();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (sess && sess.isRated) {
          nextFlashcard();
        }
      } else if (e.key === '1') {
        if (sess && sess.isRated) nextFlashcard();
        else rateCard(1);
      } else if (e.key === '2') {
        if (sess && sess.isRated) nextFlashcard();
        else rateCard(2);
      } else if (e.key === '3') {
        if (sess && sess.isRated) nextFlashcard();
        else rateCard(3);
      } else if (e.key === '4') {
        if (sess && sess.isRated) nextFlashcard();
        else rateCard(4);
      } else if (e.key.toLowerCase() === 'r') {
        playCurrentWordAudio();
      }
    }
  });
}

// ----------------------------------------------------
// Data Export & Reset
// ----------------------------------------------------
async function exportUserData() {
  try {
    const data = {
      stats: DataManager.getStats(),
      progress: DataManager.getProgress(),
      mistakes: DataManager.getMistakes(),
      starred: [...DataManager.getStarred()],
      export_date: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ielts_vocab_progress_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('导出失败');
  }
}

function resetUserProgress() {
  if (confirm('确定要重置所有学习记忆进度吗？此操作不可恢复。')) {
    localStorage.removeItem('ielts_user_progress');
    localStorage.removeItem('ielts_user_mistakes');
    localStorage.removeItem('ielts_user_starred');
    location.reload();
  }
}

function toggleMobileMenu() {
  const navTabs = document.getElementById('navTabs');
  if (navTabs) {
    navTabs.classList.toggle('hidden');
  }
}
