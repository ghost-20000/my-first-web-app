// --- 1. Cloudflare Workers 設定 ---
const _u1 = "https://";
const _u2 = "api.redd";
const _u3 = "sec.com";
const WORKER_URL = _u1 + _u2 + _u3;

const _k = ["mP~x^V", "|!'8gl3Fi", "'C!mxvs", "/A{rzCN", "-wRXtvx1W", "(SH-OjL9zPcf"];
const SECRET_KEY = _k.join("");

// --- 2. ゲームの変数 ---
let score = 0;
let timeLeft = 10.00;
let timerInterval;
let playerName = "";
let isPlaying = false;

// HTMLの要素を取得
const loginArea = document.getElementById('login-area');
const gameArea = document.getElementById('game-area');
const resultArea = document.getElementById('result-area');
const usernameInput = document.getElementById('username');
const scoreDisplay = document.getElementById('current-score');
const timerDisplay = document.getElementById('timer');
const tapBtn = document.getElementById('tap-btn');
const countdownNumber = document.getElementById('countdown-number');
const rankingList = document.getElementById('ranking-list');
const finalScoreDisplay = document.getElementById('final-score');

// --- 3. ページ読み込み時の初期化 ---
window.addEventListener('DOMContentLoaded', () => {
    loadRanking();

    const savedUser = localStorage.getItem('loggedInUser');
    if (savedUser) {
        playerName = savedUser;
        loginArea.innerHTML = `
            <p style="color:#38bdf8; font-size:1.2rem; font-weight:bold; margin-bottom:15px;">
                Player: ${savedUser}
            </p>
            <button onclick="prepareGame()" class="play-button" style="width:200px; margin:0 auto;">
                ゲームスタート！
            </button>
        `;
    }
});

// --- 4. カウントダウンとゲームロジック ---

// スタートボタンを押した時の処理
window.prepareGame = () => {
    if (!playerName) {
        const name = usernameInput.value;
        if (!name) return alert("名前を入れてください！");
        playerName = name;
    }

    // 画面の切り替え
    loginArea.style.display = 'none';
    resultArea.style.display = 'none'; // リトライ時用
    gameArea.style.display = 'block';
    
    // 表示のリセット
    tapBtn.style.display = 'none';
    countdownNumber.style.display = 'flex';
    score = 0;
    timeLeft = 10.00;
    scoreDisplay.innerText = score;
    timerDisplay.innerText = `準備はいい？`;

    let count = 3;
    countdownNumber.innerText = count;

    // 3秒カウントダウン開始
    const countInterval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownNumber.innerText = count;
        } else if (count === 0) {
            // ここを「GO!」から「スタート！」に変更
            countdownNumber.innerText = "スタート！";
            // 文字が長いので、少しだけフォントサイズを調整する
            countdownNumber.style.fontSize = "4rem"; 
        } else {
            clearInterval(countInterval);
            countdownNumber.style.display = 'none';
            tapBtn.style.display = 'block';
            startGame();
        }
    }, 1000);
};

// 実際のタイマースタート
function startGame() {
    isPlaying = true;
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        timeLeft -= 0.01;
        timerDisplay.innerText = `残り時間: ${timeLeft.toFixed(2)}`;

        if (timeLeft <= 0) {
            endGame();
        }
    }, 10);
}

window.countUp = () => {
    if (!isPlaying) return;
    score++;
    scoreDisplay.innerText = score;
};

async function endGame() {
    clearInterval(timerInterval);
    isPlaying = false;
    tapBtn.style.display = 'none';
    timerDisplay.innerText = "終了！";
    
    // スコア表示
    finalScoreDisplay.innerText = score;
    resultArea.style.display = 'block';

    try {
        const response = await fetch(WORKER_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Game-Secret": SECRET_KEY
            },
            body: JSON.stringify({
                name: playerName,
                score: score
            })
        });

        if (response.ok) {
            loadRanking();
        }
    } catch (e) {
        console.error("通信エラー:", e);
    }
}

// --- 5. ランキング・検索機能 ---

async function loadRanking() {
    try {
        const response = await fetch(`${WORKER_URL}?t=${Date.now()}`);
        const data = await response.json();

        rankingList.innerHTML = "";
        data.forEach((item) => {
            const li = document.createElement("li");
            li.innerHTML = `<span>${item.name}</span> <span>${item.score}回</span>`;
            rankingList.appendChild(li);
        });
    } catch (e) {
        console.error("ランキング取得エラー:", e);
    }
}

async function searchUserScore() {
    const name = document.getElementById('search-name').value;
    const resultDiv = document.getElementById('search-result');
    if (!name) return;

    resultDiv.innerText = "検索中...";

    try {
        const response = await fetch(`${WORKER_URL}?search=${encodeURIComponent(name)}`);
        const user = await response.json();

        if (user && user.name) {
            resultDiv.innerHTML = `<p>${user.name}さんの最高記録: <strong>${user.score}回</strong></p>`;
        } else {
            resultDiv.innerText = "ユーザーが見つかりませんでした";
        }
    } catch (e) {
        resultDiv.innerText = "エラーが発生しました";
    }
}