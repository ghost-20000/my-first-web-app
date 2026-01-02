// --- 1. Cloudflare Workers 設定 ---
const _u1 = "https://";
const _u2 = "api.redd";
const _u3 = "sec.com";
const WORKER_URL = _u1 + _u2 + _u3;

const _k = ["mP~x^V", "|!'8gl3Fi", "'C!mxvs", "/A{rzCN", "-wRXtvx1W", "(SH-OjL9zPcf"];
const SECRET_KEY = _k.join("");

// 認証中かどうかを判定するフラグ
let isVerifying = false;

// --- 2. 基本機能（モーダル・言語・パスワード表示） ---

function changeLang(lang) {
    const elements = document.querySelectorAll('.trans');
    elements.forEach(el => {
        el.textContent = el.getAttribute(lang === 'ja' ? 'data-ja' : 'data-en');
    });
    localStorage.setItem('preferred-lang', lang);
    const savedUser = localStorage.getItem('loggedInUser');
    if (savedUser) updateUI(savedUser);
}

function openAuthModal() { 
    isVerifying = false; // モーダルを開くときはリセット
    document.getElementById('auth-modal').style.display = 'block'; 
    switchTab('login');
}

function closeAuthModal() { 
    if (isVerifying) {
        if (!confirm("認証が完了していません。中断して閉じますか？")) return;
        isVerifying = false;
    }
    document.getElementById('auth-modal').style.display = 'none'; 
}

function openSettingsModal() { document.getElementById('settings-modal').style.display = 'block'; }
function closeSettingsModal() { document.getElementById('settings-modal').style.display = 'none'; }

function switchTab(tab) {
    if (isVerifying) return; // 認証中はタブ切り替え不可
    const isLogin = tab === 'login';
    document.getElementById('login-form').style.display = isLogin ? 'block' : 'none';
    document.getElementById('signup-form').style.display = isLogin ? 'none' : 'block';
    document.getElementById('verify-area').style.display = 'none';
    
    document.getElementById('tab-login').className = isLogin ? 'active' : '';
    document.getElementById('tab-signup').className = !isLogin ? 'active' : '';

    // タブを切り替えたらパスワード表示をリセット（セキュリティのため）
    resetPasswordFields();
}

// パスワード表示を「隠す」状態にリセットする関数
function resetPasswordFields() {
    const fields = ['login-pass', 'signup-pass'];
    const checks = ['login-check', 'signup-check'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.type = 'password';
    });
    checks.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
}

// HTML側から呼ばれる新しいパスワードトグル関数
function togglePassCheck(inputId, checkId) {
    const passInput = document.getElementById(inputId);
    const checkBox = document.getElementById(checkId);
    
    // チェックボックス自体のクリックと、コンテナのクリックの両方に対応
    // ※setTimeoutを使うことで、チェックボックスの元の動作と競合するのを防ぐ
    setTimeout(() => {
        if (checkBox.checked) {
            passInput.type = "text";
        } else {
            passInput.type = "password";
        }
    }, 10);
}

window.onclick = function(event) {
    if (event.target.className === 'modal') {
        if (event.target.id === 'auth-modal') closeAuthModal();
        else if (event.target.id === 'settings-modal') closeSettingsModal();
    }
};

// --- 3. 通信処理 ---

// 新規登録
document.getElementById('signup-form').onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById('signup-user').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-pass').value;

    try {
        const res = await fetch(`${WORKER_URL}/signup`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-Game-Secret": SECRET_KEY 
            },
            body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();
        
        if (data.success) {
            isVerifying = true;
            document.getElementById('signup-form').style.display = 'none';
            document.getElementById('tab-login').style.display = 'none';
            document.getElementById('tab-signup').style.display = 'none';
            document.getElementById('verify-area').style.display = 'block';
            
            localStorage.setItem('tempEmail', email);
            alert("5分以内にメール内の認証コードを入力してください。");
        } else {
            alert("エラー: " + data.error);
        }
    } catch (err) { alert("通信エラーが発生しました"); }
};

// 認証コードの確認
async function verifyCode() {
    const code = document.getElementById('verify-code').value;
    const email = localStorage.getItem('tempEmail');

    if (!code || code.length !== 6) {
        return alert("6桁のコードを入力してください");
    }

    try {
        const res = await fetch(`${WORKER_URL}/verify`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-Game-Secret": SECRET_KEY 
            },
            body: JSON.stringify({ email, code })
        });
        const data = await res.json();

        if (data.success) {
            isVerifying = false;
            localStorage.removeItem('tempEmail');
            localStorage.setItem('loggedInUser', data.username);
            localStorage.setItem('userEmail', email);
            alert("認証成功！reddsecへようこそ！");
            location.reload(); 
        } else {
            alert(data.error); // サーバー側で設定した「期限切れ」などの詳細メッセージを表示
        }
    } catch (err) { alert("通信エラーが発生しました"); }
}

// ログイン
document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-pass').value;

    try {
        const res = await fetch(`${WORKER_URL}/login`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-Game-Secret": SECRET_KEY 
            },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('loggedInUser', data.username);
            localStorage.setItem('userEmail', email);
            updateUI(data.username);
            closeAuthModal();
            alert("ログインしました！");
        } else {
            // 認証忘れの場合のサーバーからの詳細メッセージを表示
            alert(data.error || "ログインに失敗しました");
        }
    } catch (err) { alert("通信エラーが発生しました"); }
};

// ユーザー名変更・ログアウト・UI更新
async function updateUsername() {
    const newName = document.getElementById('new-username').value;
    const oldName = localStorage.getItem('loggedInUser');
    const email = localStorage.getItem('userEmail');
    if (!newName || newName === oldName) return alert("新しい名前を入力してください");
    try {
        const res = await fetch(`${WORKER_URL}/update-username`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Game-Secret": SECRET_KEY },
            body: JSON.stringify({ oldName, newName, email })
        });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('loggedInUser', newName);
            alert("ユーザー名を変更しました！");
            location.reload();
        } else {
            alert("変更失敗: " + (data.error || "不明なエラー"));
        }
    } catch (err) { alert("通信エラーが発生しました"); }
}

function logout() {
    localStorage.removeItem('loggedInUser');
    localStorage.removeItem('userEmail');
    location.reload();
}

function updateUI(username) {
    if (username) {
        const authBtn = document.getElementById('auth-btn');
        if (authBtn) authBtn.style.display = 'none';
        const userArea = document.getElementById('user-logged-in');
        if (userArea) {
            userArea.style.display = 'flex';
            const lang = localStorage.getItem('preferred-lang') || 'ja';
            const prefix = lang === 'ja' ? 'プレイヤー: ' : 'Player: ';
            document.getElementById('display-username').innerText = prefix + username;
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const savedLang = localStorage.getItem('preferred-lang') || 'ja';
    changeLang(savedLang);
    const savedUser = localStorage.getItem('loggedInUser');
    if (savedUser) updateUI(savedUser);
});
