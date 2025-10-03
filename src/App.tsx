import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import './App.css';

// 投稿1件ごとのデータ型を定義
type Post = {
  id: number;
  name: string;
  comment: string;
  timestamp: string;
};

// フォームで入力されるデータの型を定義
type FormInputs = {
  name: string;
  comment: string;
};

function App() {
  // すべての投稿を配列として管理するState
  const [posts, setPosts] = useState<Post[]>([]);

  // react-hook-formの設定
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormInputs>();

  // フォーム送信時に実行される関数
  const onSubmit: SubmitHandler<FormInputs> = (data) => {
    // 新しい投稿オブジェクトを作成
    const newPost: Post = {
      id: Date.now(), // IDとして現在時刻のタイムスタンプを使い、一意性を担保
      name: data.name || '名無しさん', // 名前が未入力なら「名無しさん」にする
      comment: data.comment,
      timestamp: new Date().toLocaleString('ja-JP'), // 日本のロケールで現在日時を取得
    };

    // 既存の投稿リスト（posts）の末尾に新しい投稿（newPost）を追加してStateを更新
    setPosts([...posts, newPost]);

    // フォームの入力内容をリセット
    reset();
  };

  return (
    <div className="board-container">
      <header>
        <h1>掲示板</h1>
      </header>

      {/* 投稿リスト表示エリア */}
      <section className="post-list">
        {posts.length === 0 ? (
          <p>まだ投稿はありません。最初の投稿をしてみましょう！</p>
        ) : (
          posts.map((post, index) => (
            <div key={post.id} className="post-item">
              <div className="post-header">
                <span>{index + 1}: </span>
                <span className="post-name">{post.name}</span>
                <span className="post-timestamp"> [{post.timestamp}]</span>
              </div>
              <div className="post-comment">
                {/* 改行を<br />に変換して表示 */}
                {post.comment.split('\n').map((line, i) => (
                  <span key={i}>{line}<br /></span>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <hr />

      {/* 投稿フォームエリア */}
      <section className="form-section">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="form-group">
            <label htmlFor="name">名前:</label>
            <input
              id="name"
              type="text"
              placeholder="名無しさん"
              {...register('name')}
            />
          </div>
          <div className="form-group">
            <label htmlFor="comment">コメント:</label>
            <textarea
              id="comment"
              placeholder="コメントを入力"
              rows={4}
              {...register('comment', { required: 'コメントは必須入力です' })}
            />
            {/* バリデーションエラーメッセージの表示 */}
            {errors.comment && <p className="error-message">{errors.comment.message}</p>}
          </div>
          <button type="submit">書き込む</button>
        </form>
      </section>
    </div>
  );
}

export default App;
