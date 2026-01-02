export default {
    async fetch(request, env) {
      // 1. CORS設定とセキュリティヘッダー
      const corsHeaders = {
        "Access-Control-Allow-Origin": "https://reddsec.com", // ★セキュリティ: 特定のドメインのみ許可
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };
  
      // プリフライトリクエストの処理
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }
  
      const url = new URL(request.url);
  
      // --- 2. セキュリティチェック: Origin（ドメイン）制限 ---
      const origin = request.headers.get("Origin");
      // ローカルテスト用など、必要に応じてドメインを追加してください
      const allowedOrigins = ["https://reddsec.com", "https://api.reddsec.com"]; 
      if (origin && !allowedOrigins.includes(origin)) {
        return new Response(JSON.stringify({ error: "Forbidden Domain" }), { 
          status: 403, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
  
      // --- パスワードハッシュ化関数（PBKDF2使用） ---
      async function hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const keyMaterial = await crypto.subtle.importKey(
          "raw",
          data,
          "PBKDF2",
          false,
          ["deriveBits"]
        );
        const hashBuffer = await crypto.subtle.deriveBits(
          {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256"
          },
          keyMaterial,
          256
        );
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
        const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
        return `${saltHex}:${hashHex}`;
      }

      // --- パスワード検証関数 ---
      async function verifyPassword(password, hash) {
        const [saltHex, hashHex] = hash.split(":");
        if (!saltHex || !hashHex) return false;
        
        const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const keyMaterial = await crypto.subtle.importKey(
          "raw",
          data,
          "PBKDF2",
          false,
          ["deriveBits"]
        );
        const hashBuffer = await crypto.subtle.deriveBits(
          {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256"
          },
          keyMaterial,
          256
        );
        const computedHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, "0")).join("");
        return computedHash === hashHex;
      }

      // --- 入力検証関数 ---
      function validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email) && email.length <= 255;
      }

      function validateUsername(username) {
        return username && username.trim().length >= 3 && username.trim().length <= 15 && /^[a-zA-Z0-9_]+$/.test(username.trim());
      }

      function validatePassword(password) {
        return password && password.length >= 8 && password.length <= 128;
      }

      // --- 3. GETリクエスト（ランキング表示・検索） ---
      if (request.method === "GET") {
        try {
          const searchName = url.searchParams.get("search");
          if (searchName) {
            // 検索文字列のサニタイズ（SQLインジェクション対策はプリペアドステートメントで対応済み）
            const result = await env.DB.prepare(
              "SELECT name, score FROM scores WHERE name = ? ORDER BY score DESC LIMIT 1"
            ).bind(searchName).first();
            return new Response(JSON.stringify(result || { error: "Not Found" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          } else {
            const { results } = await env.DB.prepare(
              "SELECT name, score FROM scores ORDER BY score DESC LIMIT 10"
            ).all();
            return new Response(JSON.stringify(results), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        } catch (e) {
          return new Response(JSON.stringify({ error: "サーバーエラーが発生しました" }), { 
            status: 500, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
        }
      }
  
      // --- 4. POSTリクエスト ---
      if (request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return new Response(JSON.stringify({ error: "無効なリクエストです" }), { 
            status: 400, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
        }
  
        try {
          // --- A. 新規登録 ---
          if (url.pathname === "/signup") {
            const { email, username, password } = body;
            
            // 入力検証
            if (!email || !username || !password) {
              return new Response(JSON.stringify({ error: "すべての項目を入力してください" }), { 
                status: 400, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
              });
            }

            if (!validateEmail(email)) {
              return new Response(JSON.stringify({ error: "有効なメールアドレスを入力してください" }), { 
                status: 400, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
              });
            }

            if (!validateUsername(username)) {
              return new Response(JSON.stringify({ error: "ユーザー名は3〜15文字の英数字・アンダースコアのみ使用可能です" }), { 
                status: 400, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
              });
            }

            if (!validatePassword(password)) {
              return new Response(JSON.stringify({ error: "パスワードは8〜128文字である必要があります" }), { 
                status: 400, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
              });
            }

            // 既存ユーザーチェック
            const existingUser = await env.DB.prepare(
              "SELECT email FROM users WHERE email = ?"
            ).bind(email).first();
            if (existingUser) {
              return new Response(JSON.stringify({ error: "このメールアドレスは既に登録されています" }), { 
                status: 400, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
              });
            }

            const code = Math.floor(100000 + Math.random() * 900000).toString();
            
            // パスワードをハッシュ化
            const passwordHash = await hashPassword(password);
  
            await env.DB.prepare(
              "INSERT OR REPLACE INTO pending_users (email, username, password, code, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
            ).bind(email, username.trim(), passwordHash, code).run();
  
            // メールの送信（環境変数 RESEND_API_KEY を使用）
            const mailRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${env.RESEND_API_KEY}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                from: "reddsec.com <noreply@reddsec.com>",
                to: email,
                subject: "【reddsec】認証コードの確認",
                html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                        <h2 style="color: #38bdf8;">reddsec へのご登録ありがとうございます</h2>
                        <p>認証コードを入力してください：</p>
                        <p style="font-size: 24px; font-weight: bold; letter-spacing: 5px; background: #f4f4f4; padding: 10px; text-align: center; border-radius: 5px;">${code}</p>
                        <p style="color: #666; font-size: 12px;">※有効期限は5分間です。</p>
                      </div>`
              })
            });
  
            if (!mailRes.ok) {
              return new Response(JSON.stringify({ error: "メール送信に失敗しました。しばらくしてから再度お試しください" }), { 
                status: 500, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
              });
            }
  
            return new Response(JSON.stringify({ success: true }), { 
              headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });
          }
  
          // --- B. コード認証 ---
          if (url.pathname === "/verify") {
            const { email, code } = body;
            
            if (!email || !code || code.length !== 6 || !/^\d+$/.test(code)) {
              return new Response(JSON.stringify({ error: "有効な6桁のコードを入力してください" }), { 
                status: 400, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
              });
            }

            const pending = await env.DB.prepare(
              "SELECT * FROM pending_users WHERE email = ? AND code = ? AND created_at > datetime('now', '-5 minutes')"
            ).bind(email, code).first();
  
            if (!pending) {
              return new Response(JSON.stringify({ error: "コードが正しくないか期限切れです" }), { 
                status: 400, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
              });
            }
  
            await env.DB.batch([
              env.DB.prepare("INSERT INTO users (email, username, password) VALUES (?, ?, ?)").bind(pending.email, pending.username, pending.password),
              env.DB.prepare("DELETE FROM pending_users WHERE email = ?").bind(email)
            ]);
  
            return new Response(JSON.stringify({ success: true, username: pending.username }), { 
              headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });
          }
  
          // --- C. ログイン ---
          if (url.pathname === "/login") {
            const { email, password } = body;
            
            if (!email || !password) {
              return new Response(JSON.stringify({ error: "メールアドレスとパスワードを入力してください" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            }

            const user = await env.DB.prepare(
              "SELECT username, password FROM users WHERE email = ?"
            ).bind(email).first();
  
            if (!user) {
              return new Response(JSON.stringify({ error: "メールアドレスまたはパスワードが正しくありません" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            }

            // パスワード検証（ハッシュ化されたパスワードと比較）
            const isValid = await verifyPassword(password, user.password);
            if (!isValid) {
              return new Response(JSON.stringify({ error: "メールアドレスまたはパスワードが正しくありません" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            }
  
            return new Response(JSON.stringify({ success: true, username: user.username }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
  
          // --- D. ユーザー名変更 ---
          if (url.pathname === "/update-username") {
            const { oldName, newName, email } = body;
            
            if (!oldName || !newName || !email) {
              return new Response(JSON.stringify({ error: "必要な情報が不足しています" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            }

            if (!validateEmail(email)) {
              return new Response(JSON.stringify({ error: "有効なメールアドレスを入力してください" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            }

            if (!validateUsername(newName)) {
              return new Response(JSON.stringify({ error: "ユーザー名は3〜15文字の英数字・アンダースコアのみ使用可能です" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            }

            // ユーザーが存在するか確認
            const user = await env.DB.prepare(
              "SELECT email FROM users WHERE email = ? AND username = ?"
            ).bind(email, oldName).first();

            if (!user) {
              return new Response(JSON.stringify({ error: "認証に失敗しました" }), {
                status: 403,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            }

            await env.DB.batch([
              env.DB.prepare("UPDATE users SET username = ? WHERE email = ?").bind(newName.trim(), email),
              env.DB.prepare("UPDATE scores SET name = ? WHERE name = ?").bind(newName.trim(), oldName)
            ]);
            return new Response(JSON.stringify({ success: true }), { 
              headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });
          }
  
          // --- E. スコア保存 ---
          const { name, score } = body;
          
          // スコア保存時の検証
          if (!name || typeof score !== 'number' || score < 0 || score > 1000000 || !Number.isInteger(score)) {
            return new Response(JSON.stringify({ error: "無効なスコアデータです" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          // ユーザー名の検証
          if (name.trim().length === 0 || name.trim().length > 15) {
            return new Response(JSON.stringify({ error: "無効なユーザー名です" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
  
          await env.DB.prepare("INSERT INTO scores (name, score) VALUES (?, ?)")
                .bind(name.trim(), score).run();
          return new Response(JSON.stringify({ success: true }), { 
            status: 200, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
  
        } catch (err) {
          // エラーメッセージを一般化（内部情報を隠す）
          return new Response(JSON.stringify({ error: "サーバーエラーが発生しました" }), { 
            status: 500, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
        }
      }
    }
  };