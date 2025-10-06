import { useState, useEffect } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import './App.css';
import { supabase } from './supabaseClient';

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
  const [posts, setPosts] = useState<Post[]>([]);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormInputs>();

  useEffect(() => {
    // 最初に全データを取得
    const fetchPosts = async () => {
      try {
        const { data, error } = await supabase
          .from('posts')
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

    fetchPosts();

    // postsテーブルのINSERT（追加）を監視する
    const channel = supabase.channel('posts_channel');
    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        (payload) => {
          // 新しい投稿（payload.new）を現在の投稿リストに追加
          setPosts((currentPosts) => [...currentPosts, payload.new as Post]);
        }
      )
      .subscribe();
      
    // クリーンアップ関数（コンポーネントがアンマウントされた時に監視を解除）
    return () => {
      supabase.removeChannel(channel);
    };
  }, [posts]);

  // フォーム送信時にSupabaseにデータを追加
  const onSubmit: SubmitHandler<FormInputs> = async (data) => {
    setIsSubmitting(true); // 書き込み開始
    try {
      const { error } = await supabase.from('posts').insert({
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
          <h1>掲示板</h1>
        </header>
        <p style={{ textAlign: 'center' }}>読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="board-container">
      <header>
        <h1>掲示板</h1>
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
            <div className="post-comment">
              {post.comment.split('\n').map((line, i) => (
                <span key={i}>{line}<br /></span>
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
