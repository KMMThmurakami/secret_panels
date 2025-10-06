import { useState, useEffect } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import './App.css';
import { supabase } from './supabaseClient';

// テーブルをdevと本番で切り替える
const tableName = import.meta.env.VITE_SUPABASE_TABLE_NAME as string;
const configTableName = import.meta.env.VITE_SUPABASE_CONFIG_NAME as string;

// パスワードハッシュ関数
async function digestMessage(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message); // 文字列をUTF-8のバイト配列に変換
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8); // ハッシュを計算
  const hashArray = Array.from(new Uint8Array(hashBuffer)); // バイト配列に変換
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join(''); // 16進数文字列に変換
  return hashHex;
}

// Postの型定義を変更
type Post = {
  id: number;
  name: string | null; // 名前は空の場合があるのでnull許容
  comment: string;
  created_at: string;
};

// フォームの型定義は同じ
type FormInputs = {
  name: string;
  comment: string;
};

function App() {
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState(''); // 合言葉設定用の入力値
  const [passwordHash, setPasswordHash] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormInputs>();

  useEffect(() => {
    const fetchConfig = async () => {
      const { data, error } = await supabase
        .from(configTableName)
        .select('password_hash')
        .eq('id', 1) // id=1の行を取得
        .single(); // 常に1行だけ取得

      if (error) {
        console.error('Error fetching config:', error);
      } else if (data) {
        setPasswordHash(data.password_hash);
      }
    };

    // 最初に全データを取得
    const fetchPosts = async () => {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .order('created_at', { ascending: true });
        if (error) throw error;
        setPosts(data || []);
      } catch (error) {
        console.error('Error fetching posts:', error);
      } finally {
        setLoading(false);
      }
    };

    Promise.all([fetchPosts(), fetchConfig()]).finally(() => setLoading(false));

    const configChannel = supabase
      .channel('config_channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: configTableName, filter: 'id=eq.1' },
        (payload) => {
          // 他の誰かがパスワードを変更したら、自分のStateも更新する
          const newHash = (payload.new as { password_hash: string | null }).password_hash;
          setPasswordHash(newHash);
          setIsOpen(false); // 安全のため、パスワードが変更されたらコメントを閉じる
          alert('合言葉が変更されました。');
        }
      )
      .subscribe();

    const postsChannel = supabase.channel(`${tableName}_channel`);
    postsChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: tableName }, (payload) => {
      setPosts((currentPosts) => [...currentPosts, payload.new as Post]);
    }).subscribe();

    return () => {
      supabase.removeChannel(configChannel);
      supabase.removeChannel(postsChannel);
    };
  }, [posts]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) return alert('合言葉を入力してください。');

    const hash = await digestMessage(passwordInput);

    // upsert: id=1の行があればUPDATE、なければINSERTする便利な命令
    const { error } = await supabase.from(configTableName).upsert({
      id: 1,
      password_hash: hash,
      password_updated_at: new Date().toISOString() // 現在時刻をISO形式の文字列で設定
    });
    
    if (error) {
      alert('エラーが発生しました。');
      console.error(error);
    } else {
      setPasswordInput('');
      alert('合言葉を設定しました。');
    }
  };

  // 回答オープンボタン
  const handleToggleOpen = async () => {
    // すでに表示されている場合は、パスワードなしで非表示にする
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    // 合言葉が設定されていなければ、表示できない
    if (!passwordHash) {
      alert('先に合言葉を設定してください。');
      return;
    }

    const input = window.prompt('合言葉を入力してください:');
    if (input === null || input === '') return; // キャンセルまたは空文字の場合は何もしない

    const inputHash = await digestMessage(input);

    if (inputHash === passwordHash) {
      setIsOpen(true); // ハッシュが一致すれば表示
    } else {
      alert('合言葉が違います。');
    }
  };

  // フォーム送信時にSupabaseにデータを追加
  const onSubmit: SubmitHandler<FormInputs> = async (data) => {
    setIsSubmitting(true); // 書き込み開始
    try {
      const { error } = await supabase.from(tableName).insert({
        name: data.name || null,
        comment: data.comment,
      });

      if (error) {
        throw error;
      }
      reset();
    } catch (error) {
      console.error('Error adding post:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ローディング中
  if (loading) {
    return (
      <div className="board-container">
        <header>
          <h2>掲示板</h2>
        </header>
        <p style={{ textAlign: 'center' }}>読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="board-container">
      <header>
        <h2>掲示板</h2>
      {!passwordHash && (
        <section className="password-section">
          <form onSubmit={handleSetPassword}>
            <p>最初にコメント閲覧用の合言葉を設定してください。</p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="合言葉"
            />
            <button type="submit">設定</button>
          </form>
        </section>
      )}
      {passwordHash && (
        <button onClick={handleToggleOpen} className="toggle-button">
          {isOpen ? '回答を隠す' : '回答を表示する'}
        </button>
      )}
      </header>
      
      {/* 投稿リスト表示エリア */}
      <section className="post-list">
        {posts.map((post, index) => (
          <div key={post.id} className="post-item">
            <div className="post-header">
              <span>{index + 1}: </span>
              <span className="post-name">{post.name || '名無しさん'}</span>
              {/* created_atを日本の日付文字列に変換して表示 */}
              <span className="post-timestamp"> [{new Date(post.created_at).toLocaleString('ja-JP')}]</span>
            </div>
            <div className={isOpen ? "post-comment" : "post-comment-hidden"}>
              {post.comment.split('\n').map((line, i) => (
                <span key={i}>{isOpen ? line : "モザイクを破るの禁止！"}<br /></span>
              ))}
            </div>
          </div>
        ))}
      </section>

      <hr />

      {/* 投稿フォームエリア */}
      <section className="form-section">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="form-group">
            <label htmlFor="name">名前:</label>
            <input id="name" type="text" placeholder="名無しさん" {...register('name')} />
          </div>
          <div className="form-group">
            <label htmlFor="comment">コメント:</label>
            <textarea
              id="comment"
              placeholder="コメントを入力"
              rows={4}
              {...register('comment', { required: 'コメントは必須入力です' })}
            />
            {errors.comment && <p className="error-message">{errors.comment.message}</p>}
          </div>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? '書き込み中...' : '書き込む'}
          </button>
        </form>
      </section>
    </div>
  );
}

export default App;
