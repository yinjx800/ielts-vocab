// 雅思词汇真经 · 核心前端控制系统

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

  // Trigger tab-specific loaders (decoupled from switchTab to prevent recursion)
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
    const res = await fetch('/api/chapters');
    const data = await res.json();
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
  imgEl.onerror = () => { imgEl.src = '/assets/chapter_illustrations/chapter_1.png'; };

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
  // Reset study sessions so user studies selected chapter
  state.flashcardSession.items = [];
  state.spellingSession.items = [];
  state.quizSession.items = [];
}

async function loadChapterWords() {
  try {
    const res = await fetch(`/api/words?chapter_id=${state.currentChapterId}&filter_status=${state.currentWordFilter}&page=${state.page}&limit=${state.limit}`);
    const data = await res.json();
    state.words = data.items;
    state.totalWords = data.total;

    // Update filter counts
    renderFilterCounts();
    renderWordsGrid(data.items);
  } catch (err) {
    console.error('Failed to load chapter words:', err);
  }
}

async function renderFilterCounts() {
  // Fetch all counts for the current chapter
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
        utterance.rate = 0.92; // Slightly slower for clarity
        
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
  // 重置该模式下的会话，确保拉取当前章节全新词条
  if (state[`${mode}Session`]) {
    state[`${mode}Session`].items = [];
    state[`${mode}Session`].currentIndex = 0;
  }
  switchTab(mode);
}


async function loadStudySessionData(mode, forceReload = false) {
  if (state.isSessionLoading) return;
  
  // 如果不是强制刷新，且已经有加载好的词条，直接渲染
  const currentSess = state[`${mode}Session`];
  if (!forceReload && currentSess && currentSess.items && currentSess.items.length > 0) {
    if (mode === 'flashcard') renderCurrentFlashcard();
    else if (mode === 'spelling') renderCurrentSpelling();
    else if (mode === 'quiz') renderCurrentQuizQuestion();
    return;
  }

  // 恢复原始模板结构（防止被完成结算页破坏）
  if (originalViewTemplates[mode]) {
    const viewEl = document.getElementById(`view-${mode}`);
    if (viewEl && !document.getElementById(mode === 'flashcard' ? 'flashcardElement' : (mode === 'spelling' ? 'spellInput' : 'quizOptionsContainer'))) {
      viewEl.innerHTML = originalViewTemplates[mode];
      initIcons();
    }
  }

  state.isSessionLoading = true;
  try {
    const res = await fetch(`/api/study/session?chapter_id=${state.currentChapterId}&mode=${mode}&count=20`);
    const data = await res.json();
    
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
  
  const cardEl = document.getElementById('flashcardElement');
  cardEl.classList.remove('is-flipped');

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

  try {
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word_id: item.id || `${item.chapter_id}_${item.word}`,
        word: item.word,
        rating: rating,
        study_mode: 'flashcard'
      })
    });
  } catch (err) {
    console.error('Failed to submit progress:', err);
  }

  sess.currentIndex += 1;
  renderCurrentFlashcard();
}

async function toggleStarCurrentWord() {
  const sess = state.flashcardSession;
  const item = sess.items[sess.currentIndex];
  if (!item) return;

  try {
    const res = await fetch('/api/notebook/star', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word_id: item.id, word: item.word })
    });
    const data = await res.json();
    item.is_starred = data.is_starred;
    const starBtn = document.getElementById('fcStarBtn');
    starBtn.innerHTML = `<i data-lucide="star" class="w-5 h-5 ${item.is_starred ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}"></i>`;
    initIcons();
  } catch (err) {}
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

  const target = word.word.trim().toLowerCase();
  const fbEl = document.getElementById('spellFeedback');

  if (guess === target) {
    // Correct!
    fbEl.className = 'p-4 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-sm correct-glow';
    fbEl.innerHTML = `
      <div class="font-black text-base flex items-center justify-center gap-2">
        <i data-lucide="check-circle" class="w-5 h-5 text-emerald-500"></i>
        <span>拼写完全正确！Perfect!</span>
      </div>
      <div class="text-xs text-emerald-700 mt-1">${word.display_word || word.word} - ${word.meaning}</div>
    `;
    initIcons();
    playAudio(word.word);

    // Record progress
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word_id: word.id || `${word.chapter_id}_${word.word}`,
        word: word.word,
        rating: sess.revealedLetters > 0 ? 3 : 4,
        study_mode: 'spelling'
      })
    });

    setTimeout(() => {
      sess.currentIndex += 1;
      renderCurrentSpelling();
    }, 1200);
  } else {
    // Incorrect
    inputEl.classList.add('shake');
    setTimeout(() => inputEl.classList.remove('shake'), 500);

    fbEl.className = 'p-3 rounded-2xl bg-red-50 text-red-700 border border-red-200 text-xs font-semibold';
    fbEl.innerHTML = `拼写有误，请仔细听发音再试一次，或点击下方提示`;

    // Record mistake
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word_id: word.id || `${word.chapter_id}_${word.word}`,
        word: word.word,
        rating: 1,
        study_mode: 'spelling'
      })
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

  // Render 4 options
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

  // Disable all option buttons
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

    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word_id: currentWord.id || `${currentWord.chapter_id}_${currentWord.word}`,
        word: currentWord.word,
        rating: 4,
        study_mode: 'quiz'
      })
    });
  } else {
    buttonEl.classList.remove('bg-slate-50', 'hover:bg-brand-50');
    buttonEl.classList.add('bg-red-50', 'border-red-500', 'text-red-800');
    buttonEl.querySelector('.result-icon').innerHTML = '<i data-lucide="x" class="w-5 h-5 text-red-600"></i>';

    // Highlight correct option
    document.querySelectorAll('.quiz-option-btn').forEach((btn, i) => {
      if (options[i] === correct) {
        btn.classList.add('bg-emerald-50', 'border-emerald-500', 'text-emerald-800');
      }
    });

    sess.combo = 0;
    document.getElementById('quizCombo').textContent = 0;

    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word_id: currentWord.id || `${currentWord.chapter_id}_${currentWord.word}`,
        word: currentWord.word,
        rating: 1,
        study_mode: 'quiz'
      })
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
    const res = await fetch(`/api/words?filter_status=${state.notebookType === 'starred' ? 'starred' : 'mistake'}&limit=100`);
    const data = await res.json();
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
    await fetch('/api/notebook/star', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word_id: wordId, word: word })
    });
  } else {
    // Mistake resolution
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word_id: wordId, word: word, rating: 4 })
    });
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
  try {
    await fetch('/api/notebook/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: state.notebookType })
    });
    await loadNotebookWords();
    await loadGlobalStats();
  } catch (err) {
    console.error('Failed to clear notebook:', err);
  }
}

// ----------------------------------------------------
// 📊 学习统计与看板 (Stats)
// ----------------------------------------------------
async function loadGlobalStats() {
  try {
    const res = await fetch('/api/progress/stats');
    const data = await res.json();

    document.getElementById('statTotalWords').textContent = data.total_words;
    document.getElementById('statLearnedWords').textContent = data.learned;
    document.getElementById('statMasteredWords').textContent = data.mastered;
    document.getElementById('statDueReview').textContent = data.due_review;

    // Update notebook counts
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

  searchDebounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/words?query=${encodeURIComponent(query)}&limit=10`);
      const data = await res.json();
      
      if (data.items.length === 0) {
        dropdown.innerHTML = `<div class="p-4 text-xs text-slate-400 text-center">无匹配结果</div>`;
      } else {
        dropdown.innerHTML = data.items.map(w => `
          <div class="p-3 border-b border-slate-100 hover:bg-brand-50/50 cursor-pointer transition flex items-center justify-between" onclick="selectSearchResult('${w.id}')">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-sm text-slate-900">${w.display_word || w.word}</span>
                <span class="text-xs text-slate-400 font-mono">${w.phonetic || ''}</span>
              </div>
              <div class="text-xs text-slate-600 line-clamp-1">${w.meaning}</div>
            </div>
            <span class="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-bold">Ch.${w.chapter_id}</span>
          </div>
        `).join('');
      }
      dropdown.classList.remove('hidden');
    } catch (e) {}
  }, 250);
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
  // Find in loaded words or fetch
  let word = state.words.find(w => w.id === wordId) || 
             state.notebookWords.find(w => w.id === wordId);
  
  if (!word) {
    try {
      const res = await fetch(`/api/words?query=${wordId}&limit=1`);
      const data = await res.json();
      word = data.items[0];
    } catch (e) {}
  }
  if (!word) return;

  state.selectedWord = word;
  document.getElementById('wdChapterBadge').textContent = `Chapter ${word.chapter_id || state.currentChapterId} · ${word.chapter_name || ''}`;
  document.getElementById('wdWord').textContent = word.display_word || word.word;
  document.getElementById('wdPhonetic').textContent = word.phonetic || '';
  document.getElementById('wdMeaning').textContent = word.meaning || '暂无详细释义';

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
  await toggleStarWord(state.selectedWord.id, state.selectedWord.word);
  state.selectedWord.is_starred = !state.selectedWord.is_starred;
  openWordDetailModal(state.selectedWord.id);
}

async function toggleStarWord(wordId, wordText, buttonEl) {
  try {
    const res = await fetch('/api/notebook/star', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word_id: wordId, word: wordText })
    });
    const data = await res.json();
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
    // If typing in an input box or modal open, ignore global hotkeys
    if (['input', 'textarea', 'select'].includes(document.activeElement.tagName.toLowerCase())) {
      return;
    }

    if (state.currentTab === 'flashcard') {
      if (e.code === 'Space') {
        e.preventDefault();
        flipFlashcard();
      } else if (e.key === '1') {
        rateCard(1);
      } else if (e.key === '2') {
        rateCard(2);
      } else if (e.key === '3') {
        rateCard(3);
      } else if (e.key === '4') {
        rateCard(4);
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
    const res = await fetch('/api/progress/stats');
    const data = await res.json();
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
    localStorage.clear();
    location.reload();
  }
}

function toggleMobileMenu() {
  const navTabs = document.getElementById('navTabs');
  if (navTabs) {
    navTabs.classList.toggle('hidden');
  }
}
