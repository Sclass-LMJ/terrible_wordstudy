// Supabase 초기화
const SUPABASE_URL = 'https://vuywhvjzupkyygieafhj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1eXdodmp6dXBreXlnaWVhZmhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgwMDQ3MTksImV4cCI6MjA2MzU4MDcxOX0.YupD0Ctd87nvBfc5g8fBp_UGVAvP2P9z0rcfqE8Q0XY';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let words = [];
let allWords = []; // 전체 단어 저장 (필터링 전)
let currentSlideIndex = 0;
let autoPlayTimer = null;
let currentWordForEdit = null;
let filterSettings = {
    levels: [],
    pos: [],
    wrongRateMin: 0,
    dateFrom: null,
    dateTo: null
};
let studiedToday = new Set(); // 오늘 공부한 단어 ID 저장 (메모리에만)

// 한국 시간(KST) 유틸리티 함수
function getKSTDate(date = new Date()) {
    // UTC 시간에 9시간 추가하여 한국 시간으로 변환
    const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
    const kstDate = new Date(utc + (9 * 60 * 60 * 1000));
    return kstDate;
}

function getKSTDateString(date = new Date()) {
    const kst = getKSTDate(date);
    return kst.toISOString();
}

function getKSTDateOnly(date = new Date()) {
    const kst = getKSTDate(date);
    const year = kst.getFullYear();
    const month = String(kst.getMonth() + 1).padStart(2, '0');
    const day = String(kst.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseKSTDate(isoString) {
    if (!isoString) return null;
    // ISO 문자열을 Date 객체로 변환 후 KST로 조정
    return getKSTDate(new Date(isoString));
}

// 토스트 알림 함수
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-message">${message}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    // 3초 후 자동 제거
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 300);
    }, 3000);
}

// 초기 로드
document.addEventListener('DOMContentLoaded', () => {
    loadWords();
});

// 단어 불러오기
async function loadWords() {
    try {
        const { data, error } = await supabase
            .from('jpn_word')
            .select('*')
            .order('id');  // ID 순서로 정렬 (순서 유지)

        if (error) throw error;

        allWords = data || [];
        applyFilter(); // 필터 적용
    } catch (error) {
        console.error('Error loading words:', error);
        showToast('단어를 불러오는데 실패했습니다.', 'error');
    }
}

// 오늘 공부했는지 확인 (메모리 기반)
function isStudiedToday(wordId) {
    return studiedToday.has(wordId);
}

// 페이지 전환
function showPage(pageNum) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`page${pageNum}`).classList.add('active');
    document.querySelectorAll('.nav-btn')[pageNum - 1].classList.add('active');

    if (pageNum === 2) {
        renderSlide();
    } else if (pageNum === 3) {
        renderTable();
    }
}

// 카드 리스트 렌더링
function renderCardList() {
    const container = document.getElementById('cardList');
    
    if (words.length === 0) {
        container.innerHTML = '<div class="loading">등록된 단어가 없습니다.</div>';
        return;
    }

    container.innerHTML = words.map((word, index) => `
        <div class="word-card">
            ${isStudiedToday(word.id) ? '<div class="studied-badge">✓ 공부함</div>' : ''}
            <div class="word-header">
                <div class="word-main">
                    <div class="word-text">${index + 1}. ${word.word}</div>
                    ${word.kanji ? `<div class="word-kanji">${word.kanji}</div>` : ''}
                </div>
                <div class="word-level">${word.level || 'N/A'}</div>
            </div>
            <div class="word-info">
                <div class="info-row blind blind-meaning" onclick="toggleBlind(this)">
                    <div class="info-label">뜻</div>
                    <div class="info-value">${word.meaning_ko}</div>
                </div>
                ${word.pron_ko ? `
                <div class="info-row blind blind-pron" onclick="toggleBlind(this)">
                    <div class="info-label">한국어 발음</div>
                    <div class="info-value">${word.pron_ko}</div>
                </div>
                ` : ''}
                ${word.note ? `
                <div class="info-row">
                    <div class="info-label">비고</div>
                    <div class="info-value">${word.note}</div>
                </div>
                ` : ''}
                <div class="info-row blind blind-stats" onclick="toggleBlind(this)">
                    <div class="info-label">학습 현황</div>
                    <div class="info-value">✅ ${word.o_count || 0}회 | ❌ ${word.x_count || 0}회 | 오답률: ${((word.wrong_rate || 0) * 100).toFixed(2)}%</div>
                </div>
            </div>
            <div class="word-actions">
                <button class="btn btn-o" onclick="updateWordResult('${word.id}', true)">⭕</button>
                <button class="btn btn-x" onclick="updateWordResult('${word.id}', false)">❌</button>
                <button class="btn btn-speak" onclick="speakWord('${word.word}')">🔊 읽기</button>
                <button class="btn btn-sentence" onclick="showSentences('${word.word}', '${word.id}')">📝 문장</button>
            </div>
        </div>
    `).join('');
}

// 블라인드 토글
function toggleBlind(element) {
    element.classList.toggle('blind');
}

// 단어 읽어주기
function speakWord(text) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.rate = 0.8;
        window.speechSynthesis.speak(utterance);
    } else {
        showToast('이 브라우저는 음성 기능을 지원하지 않습니다.', 'warning');
    }
}

// 문장 모달 표시
async function showSentences(word, wordId) {
    try {
        const { data, error } = await supabase
            .from('jpn_sentence')
            .select('*')
            .ilike('sentence', `%${word}%`);

        if (error) throw error;

        const modal = document.getElementById('sentenceModal');
        const list = document.getElementById('sentenceList');

        if (!data || data.length === 0) {
            list.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">해당 단어가 포함된 문장이 없습니다.</div>';
        } else {
            list.innerHTML = data.map(sentence => `
                <div class="sentence-item">
                    <div class="sentence-text">${sentence.sentence}</div>
                    <div class="sentence-meaning">${sentence.meaning_ko}</div>
                </div>
            `).join('');
        }

        modal.classList.add('active');
    } catch (error) {
        console.error('Error loading sentences:', error);
        showToast('문장을 불러오는데 실패했습니다.', 'error');
    }
}

// 문장 모달 닫기
function closeSentenceModal() {
    document.getElementById('sentenceModal').classList.remove('active');
}

// 단어 결과 업데이트
async function updateWordResult(id, isCorrect) {
    try {
        const { data, error } = await supabase
            .from('jpn_word')
            .select('o_count, x_count')
            .eq('id', id)
            .single();

        if (error) throw error;

        let o = data.o_count || 0;
        let x = data.x_count || 0;

        if (isCorrect) o++;
        else x++;

        const total = o + x;
        const wrongRate = total > 0 ? x / total : 0;

        const { error: updateError } = await supabase
            .from('jpn_word')
            .update({
                o_count: o,
                x_count: x,
                total_count: total,
                wrong_rate: wrongRate,
                studytime: getKSTDateString(),
                updated_at: getKSTDateString()
            })
            .eq('id', id);

        if (updateError) throw updateError;

        // 메모리에 공부한 단어 ID 추가
        studiedToday.add(id);

        showToast(isCorrect ? '맞음으로 기록되었습니다!' : '틀림으로 기록되었습니다!', isCorrect ? 'success' : 'error');
        
        // 데이터만 다시 로드 (순서 유지)
        loadWords();
        
        // 문장 모달이 열려있으면 닫기
        closeSentenceModal();
    } catch (error) {
        console.error('Error updating word result:', error);
        showToast('결과 업데이트에 실패했습니다.', 'error');
    }
}

// 슬라이드 렌더링
function renderSlide() {
    const card = document.getElementById('slideCard');
    
    if (words.length === 0) {
        card.innerHTML = '<div class="loading">등록된 단어가 없습니다.</div>';
        return;
    }

    const word = words[currentSlideIndex];
    card.innerHTML = `
        <div class="slide-word">${word.word}</div>
        ${word.kanji ? `<div class="slide-kanji">${word.kanji}</div>` : ''}
        <div class="info-row blind blind-meaning" onclick="toggleBlind(this)" style="margin: 20px 0;">
            <div class="info-label">뜻</div>
            <div class="info-value">${word.meaning_ko}</div>
        </div>
        ${word.pron_ko ? `
        <div class="info-row blind blind-pron" onclick="toggleBlind(this)" style="margin: 20px 0;">
            <div class="info-label">발음</div>
            <div class="info-value">${word.pron_ko}</div>
        </div>
        ` : ''}
        <button class="btn btn-speak" onclick="speakWord('${word.word}')" style="width: 100%; margin-top: 20px;">🔊 읽기</button>
        <div style="margin-top: 15px; color: #999; font-size: 14px;">${currentSlideIndex + 1} / ${words.length}</div>
    `;
}

// 이전 슬라이드
function previousSlide() {
    if (words.length === 0) return;
    currentSlideIndex = (currentSlideIndex - 1 + words.length) % words.length;
    renderSlide();
}

// 다음 슬라이드
function nextSlide() {
    if (words.length === 0) return;
    currentSlideIndex = (currentSlideIndex + 1) % words.length;
    renderSlide();
}

// 자동 재생 토글
function toggleAutoPlay() {
    const btn = document.getElementById('autoPlayBtn');
    const interval = parseInt(document.getElementById('autoPlayInterval').value) * 1000;

    if (autoPlayTimer) {
        clearInterval(autoPlayTimer);
        autoPlayTimer = null;
        btn.textContent = '시작';
        btn.style.background = 'white';
        btn.style.color = '#667eea';
    } else {
        autoPlayTimer = setInterval(nextSlide, interval);
        btn.textContent = '정지';
        btn.style.background = '#f44336';
        btn.style.color = 'white';
    }
}

// 테이블 렌더링
function renderTable() {
    const tbody = document.getElementById('wordTable');
    
    if (words.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #999;">등록된 단어가 없습니다.</td></tr>';
        return;
    }

    tbody.innerHTML = words.map(word => `
        <tr ondblclick="editWord('${word.id}')" style="cursor: pointer;">
            <td>${word.word}</td>
            <td>${word.kanji || '-'}</td>
            <td>${word.meaning_ko}</td>
            <td>${word.level || '-'}</td>
            <td>${word.o_count || 0}</td>
            <td>${word.x_count || 0}</td>
            <td>${((word.wrong_rate || 0) * 100).toFixed(2)}%</td>
        </tr>
    `).join('');
}

// 단어 추가 모달 표시
function showAddModal() {
    document.getElementById('wordModalTitle').textContent = '단어 추가';
    document.getElementById('wordForm').reset();
    document.getElementById('wordId').value = '';
    document.getElementById('deleteBtn').style.display = 'none';
    document.getElementById('wordModal').classList.add('active');
    currentWordForEdit = null;
}

// 단어 수정
async function editWord(id) {
    try {
        const { data, error } = await supabase
            .from('jpn_word')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        currentWordForEdit = data;
        document.getElementById('wordModalTitle').textContent = '단어 수정';
        document.getElementById('wordId').value = data.id;
        document.getElementById('word').value = data.word || '';
        document.getElementById('kanji').value = data.kanji || '';
        document.getElementById('meaning_ko').value = data.meaning_ko || '';
        document.getElementById('pron_ko').value = data.pron_ko || '';
        document.getElementById('note').value = data.note || '';
        document.getElementById('level').value = data.level || '';
        document.getElementById('pos').value = data.pos || 'noun';
        document.getElementById('deleteBtn').style.display = 'block';
        document.getElementById('wordModal').classList.add('active');
    } catch (error) {
        console.error('Error loading word:', error);
        showToast('단어를 불러오는데 실패했습니다.', 'error');
    }
}

// 단어 모달 닫기
function closeWordModal() {
    document.getElementById('wordModal').classList.remove('active');
    currentWordForEdit = null;
}

// 단어 저장
document.getElementById('wordForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const wordData = {
        word: document.getElementById('word').value,
        kanji: document.getElementById('kanji').value || null,
        meaning_ko: document.getElementById('meaning_ko').value,
        pron_ko: document.getElementById('pron_ko').value || null,
        note: document.getElementById('note').value || null,
        level: document.getElementById('level').value || null,
        pos: document.getElementById('pos').value,
        updated_at: new Date().toISOString()
    };

    try {
        const wordId = document.getElementById('wordId').value;

        if (wordId) {
            // 수정
            const { error } = await supabase
                .from('jpn_word')
                .update(wordData)
                .eq('id', wordId);

            if (error) throw error;
            showToast('단어가 수정되었습니다!', 'success');
        } else {
            // 추가
            wordData.o_count = 0;
            wordData.x_count = 0;
            wordData.total_count = 0;
            wordData.wrong_rate = 0;
            wordData.created_at = new Date().toISOString();

            const { error } = await supabase
                .from('jpn_word')
                .insert([wordData]);

            if (error) throw error;
            showToast('단어가 추가되었습니다!', 'success');
        }

        closeWordModal();
        loadWords();
    } catch (error) {
        console.error('Error saving word:', error);
        showToast('단어 저장에 실패했습니다: ' + error.message, 'error');
    }
});

// 단어 삭제
async function deleteWord() {
    if (!confirm('정말로 이 단어를 삭제하시겠습니까?')) return;

    try {
        const wordId = document.getElementById('wordId').value;
        const { error } = await supabase
            .from('jpn_word')
            .delete()
            .eq('id', wordId);

        if (error) throw error;

        showToast('단어가 삭제되었습니다!', 'success');
        closeWordModal();
        loadWords();
    } catch (error) {
        console.error('Error deleting word:', error);
        showToast('단어 삭제에 실패했습니다.', 'error');
    }
}

// 모달 외부 클릭시 닫기
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// 필터 모달 열기/닫기
function toggleFilter() {
    document.getElementById('filterModal').classList.add('active');
}

function closeFilterModal() {
    document.getElementById('filterModal').classList.remove('active');
}

// 필터 적용
function applyFilter() {
    // 선택된 레벨 가져오기
    const levelCheckboxes = document.querySelectorAll('.filter-options input[type="checkbox"][value^="L"]:checked');
    filterSettings.levels = Array.from(levelCheckboxes).map(cb => cb.value);
    
    // 선택된 품사 가져오기
    const posCheckboxes = document.querySelectorAll('.filter-options input[type="checkbox"]:not([value^="L"]):checked');
    filterSettings.pos = Array.from(posCheckboxes).map(cb => cb.value);
    
    // 오답률 가져오기
    filterSettings.wrongRateMin = parseInt(document.getElementById('wrongRateMin').value) || 0;
    
    // 날짜 가져오기
    filterSettings.dateFrom = document.getElementById('studyDateFrom').value;
    filterSettings.dateTo = document.getElementById('studyDateTo').value;
    
    // 필터링
    words = allWords.filter(word => {
        // 레벨 필터
        if (filterSettings.levels.length > 0 && !filterSettings.levels.includes(word.level)) {
            return false;
        }
        
        // 품사 필터
        if (filterSettings.pos.length > 0 && !filterSettings.pos.includes(word.pos)) {
            return false;
        }
        
        // 오답률 필터
        const wrongRatePercent = (word.wrong_rate || 0) * 100;
        if (wrongRatePercent < filterSettings.wrongRateMin) {
            return false;
        }
        
        // 날짜 필터 (한국 시간 기준)
        if (filterSettings.dateFrom || filterSettings.dateTo) {
            if (!word.studytime) return false; // studytime이 없으면 제외
            
            const studyDate = getKSTDateOnly(parseKSTDate(word.studytime));
            
            if (filterSettings.dateFrom && studyDate < filterSettings.dateFrom) {
                return false;
            }
            
            if (filterSettings.dateTo && studyDate > filterSettings.dateTo) {
                return false;
            }
        }
        
        return true;
    });
    
    // 렌더링
    renderCardList();
    renderSlide();
    renderTable();
    
    // 모달 닫기
    closeFilterModal();
    
    // 필터 적용 알림
    const filterCount = (filterSettings.levels.length > 0 ? 1 : 0) + 
                       (filterSettings.pos.length > 0 ? 1 : 0) + 
                       (filterSettings.wrongRateMin > 0 ? 1 : 0) + 
                       (filterSettings.dateFrom || filterSettings.dateTo ? 1 : 0);
    if (filterCount > 0) {
        showToast(`필터 적용됨 (${words.length}개 단어)`, 'info');
    }
}

// 필터 초기화
function resetFilter() {
    // 체크박스 초기화
    document.querySelectorAll('.filter-checkbox input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    
    // 오답률 초기화
    document.getElementById('wrongRateMin').value = 0;
    
    // 날짜 초기화
    document.getElementById('studyDateFrom').value = '';
    document.getElementById('studyDateTo').value = '';
    
    // 필터 설정 초기화
    filterSettings.levels = [];
    filterSettings.pos = [];
    filterSettings.wrongRateMin = 0;
    filterSettings.dateFrom = null;
    filterSettings.dateTo = null;
    
    // 전체 단어 표시
    words = allWords;
    renderCardList();
    renderSlide();
    renderTable();
    
    // 모달 닫기
    closeFilterModal();
    
    showToast('필터가 초기화되었습니다.', 'info');
}

// 배열 섞기 함수 (Fisher-Yates 알고리즘)
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// 랜덤 재배치 및 공부함 태그 초기화
function randomizeWords() {
    if (!confirm('단어 순서를 랜덤하게 섞고, 모든 "공부함" 태그를 초기화하시겠습니까?')) {
        return;
    }
    
    // 공부함 태그 초기화 (메모리에서만)
    studiedToday.clear();
    
    // 단어 순서 랜덤하게 섞기
    allWords = shuffleArray(allWords);
    words = shuffleArray(words);
    
    // 렌더링
    renderCardList();
    renderSlide();
    renderTable();
    
    showToast('단어가 랜덤하게 섞였고, 공부 기록이 초기화되었습니다!', 'success');
}

