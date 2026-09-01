/**
 * Daily Condition - コンディション可視化アプリケーション
 * 
 * 責務：
 * - 公開JSON（./public-data/condition.json）を取得
 * - データの検証と解析
 * - UIへの表示
 * - エラーハンドリング
 * - アクセシビリティ対応
 */

// ============================================
// 定数
// ============================================

const CONFIG = {
    JSON_URL: './public-data/condition.json',
    CACHE_BUSTER_PARAM: 'v',
    REQUIRED_FIELDS: ['updatedAt', 'overall', 'energy', 'focus', 'moodStability', 'message'],
    GAUGE_MAX: 5,
    LOAD_TIMEOUT: 5000
};

const UI_IDS = {
    loading: 'loadingContainer',
    error: 'errorContainer',
    content: 'contentContainer',
    overallScore: 'overallScore',
    overallValue: 'overallValue',
    energyGauge: 'energyGauge',
    energyValue: 'energyValue',
    focusGauge: 'focusGauge',
    focusValue: 'focusValue',
    moodGauge: 'moodGauge',
    moodValue: 'moodValue',
    messageText: 'messageText',
    updatedTime: 'updatedTime',
    mainVisualSection: 'mainVisualSection',
    copyrightYear: 'copyrightYear'
};

const GAUGE_LABELS = {
    1: '低め',
    2: 'やや低め',
    3: '通常',
    4: 'やや高め',
    5: '高め'
};

// ============================================
// ユーティリティ関数
// ============================================

/**
 * 要素を取得（存在しない場合はエラー）
 */
function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Element with ID '${id}' not found`);
    }
    return element;
}

/**
 * エラーメッセージを表示
 */
function showError(message) {
    const container = getElement(UI_IDS.loading);
    const errorContainer = getElement(UI_IDS.error);
    const contentContainer = getElement(UI_IDS.content);

    container.style.display = 'none';
    contentContainer.style.display = 'none';

    errorContainer.textContent = message;
    errorContainer.style.display = 'block';
}

/**
 * 読み込み中を表示
 */
function showLoading() {
    const container = getElement(UI_IDS.loading);
    const contentContainer = getElement(UI_IDS.content);
    const errorContainer = getElement(UI_IDS.error);

    container.style.display = 'block';
    contentContainer.style.display = 'none';
    errorContainer.style.display = 'none';
}

/**
 * コンテンツを表示
 */
function showContent() {
    const container = getElement(UI_IDS.loading);
    const contentContainer = getElement(UI_IDS.content);
    const errorContainer = getElement(UI_IDS.error);

    container.style.display = 'none';
    contentContainer.style.display = 'block';
    errorContainer.style.display = 'none';
}

/**
 * 日付をフォーマット（YYYY年MM月DD日形式）
 */
function formatDate(isoDateString) {
    try {
        const date = new Date(isoDateString);
        if (isNaN(date.getTime())) {
            throw new Error('Invalid date');
        }
        return date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).replace(/\//g, '年').replace(/年([^年]*)$/, '月$1日');
    } catch (error) {
        throw new Error('Date formatting failed');
    }
}

/**
 * ゲージを描画（5個のドット）
 */
function renderGauge(containerId, value) {
    const container = getElement(containerId);
    container.innerHTML = '';

    for (let i = 1; i <= CONFIG.GAUGE_MAX; i++) {
        const dot = document.createElement('span');
        dot.className = 'gauge-dot';
        if (i <= value) {
            dot.classList.add('active');
        }
        dot.setAttribute('aria-hidden', 'true');
        container.appendChild(dot);
    }
}

/**
 * メインビジュアルのクラスを設定
 */
function setMainVisualClass(overallLabel) {
    const section = getElement(UI_IDS.mainVisualSection);
    section.className = 'main-visual';

    if (overallLabel === '高め') {
        section.classList.add('condition-high');
    } else if (overallLabel === '通常') {
        section.classList.add('condition-normal');
    } else if (overallLabel === '低め') {
        section.classList.add('condition-low');
    } else if (overallLabel === '推定精度低下') {
        section.classList.add('condition-reduced');
    } else if (overallLabel === '推定保留') {
        section.classList.add('condition-pending');
    }
}

// ============================================
// データ検証
// ============================================

/**
 * JSONデータの形式を検証
 */
function validateConditionData(data) {
    if (typeof data !== 'object' || data === null) {
        throw new Error('Invalid JSON format: not an object');
    }

    // 必須フィールドの確認
    for (const field of CONFIG.REQUIRED_FIELDS) {
        if (!(field in data)) {
            throw new Error(`Missing required field: ${field}`);
        }
    }

    // updatedAt の検証
    if (typeof data.updatedAt !== 'string') {
        throw new Error('updatedAt must be a string');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.updatedAt)) {
        throw new Error('updatedAt must be in YYYY-MM-DD format');
    }

    // overall の検証
    if (typeof data.overall !== 'string') {
        throw new Error('overall must be a string');
    }
    const allowedOverall = ['低め', '通常', '高め', '推定精度低下', '推定保留'];
    if (!allowedOverall.includes(data.overall)) {
        throw new Error(`overall must be one of: ${allowedOverall.join(', ')}`);
    }

    // 数値フィールドの検証
    for (const field of ['energy', 'focus', 'moodStability']) {
        if (typeof data[field] !== 'number') {
            throw new Error(`${field} must be a number`);
        }
        if (!Number.isInteger(data[field]) || data[field] < 1 || data[field] > 5) {
            throw new Error(`${field} must be an integer between 1 and 5`);
        }
    }

    // message の検証
    if (typeof data.message !== 'string') {
        throw new Error('message must be a string');
    }
    if (data.message.length === 0) {
        throw new Error('message cannot be empty');
    }

    return true;
}

// ============================================
// データ取得
// ============================================

/**
 * JSONデータを取得
 */
async function fetchConditionData() {
    try {
        // キャッシュバスター付きのURLを構築
        const url = `${CONFIG.JSON_URL}?${CONFIG.CACHE_BUSTER_PARAM}=${Date.now()}`;

        const response = await fetch(url, {
            cache: 'no-store',
            headers: {
                'Accept': 'application/json'
            }
        });

        // レスポンスステータスを確認
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();

        // データを検証
        validateConditionData(data);

        return data;
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error('Invalid JSON format');
        }
        throw error;
    }
}

// ============================================
// UI更新
// ============================================

/**
 * UIにコンディションデータを反映
 */
function displayConditionData(data) {
    try {
        // updatedAt を表示
        const formattedDate = formatDate(data.updatedAt);
        getElement(UI_IDS.updatedTime).textContent = `最終更新: ${formattedDate}`;

        // overall を表示（数値表示なし、文字のみ）
        getElement(UI_IDS.overallValue).textContent = data.overall;

        // メインビジュアルのクラスを設定
        setMainVisualClass(data.overall);

        // コンディション項目を表示
        displayMetric(
            UI_IDS.energyGauge,
            UI_IDS.energyValue,
            data.energy,
            '活動しやすさ'
        );

        displayMetric(
            UI_IDS.focusGauge,
            UI_IDS.focusValue,
            data.focus,
            '集中しやすさ'
        );

        displayMetric(
            UI_IDS.moodGauge,
            UI_IDS.moodValue,
            data.moodStability,
            '気分の安定度'
        );

        // メッセージを表示
        getElement(UI_IDS.messageText).textContent = data.message;

        // 著作権年を設定
        const currentYear = new Date().getFullYear();
        getElement(UI_IDS.copyrightYear).textContent = `© ${currentYear}`;

        // コンテンツを表示
        showContent();
    } catch (error) {
        showError('データの表示に失敗しました。ページを再度読み込んでください。');
        console.error('Display error:', error.message);
    }
}

/**
 * 単一のメトリクスを表示
 */
function displayMetric(gaugeId, valueId, value, label) {
    renderGauge(gaugeId, value);
    const valueElement = getElement(valueId);
    valueElement.textContent = `${value}/5 - ${GAUGE_LABELS[value]}`;
    valueElement.setAttribute('aria-label', `${label}: ${value}、${GAUGE_LABELS[value]}`);
}

// ============================================
// アニメーション
// ============================================

/**
 * コンテンツをフェードインさせる
 */
function addAppearanceAnimation() {
    const container = getElement(UI_IDS.content);
    container.classList.add('appear');
}

// ============================================
// メイン処理
// ============================================

/**
 * アプリケーションを初期化
 */
async function initializeApp() {
    try {
        showLoading();

        // JSONデータを取得
        const data = await fetchConditionData();

        // UIに反映
        displayConditionData(data);

        // アニメーションを追加
        addAppearanceAnimation();
    } catch (error) {
        let errorMessage = '現在、コンディション情報を取得できません。';

        if (error.message.includes('HTTP error')) {
            errorMessage = '情報サーバーが応答していません。少し待ってからもう一度試してください。';
        } else if (error.message.includes('Invalid JSON')) {
            errorMessage = 'データ形式が不正です。管理者に報告してください。';
        } else if (error.message.includes('Missing required field')) {
            errorMessage = '必要なデータが不足しています。管理者に報告してください。';
        } else if (error.message.includes('Date formatting failed')) {
            errorMessage = '更新日時を確認できません。';
        } else if (error.message.includes('Fetch failed')) {
            errorMessage = 'ネットワーク接続を確認してください。';
        }

        showError(errorMessage);
        console.error('Initialization error:', error.message);
    }
}

// ============================================
// 実行
// ============================================

// DOMContentLoaded イベントでアプリを初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
