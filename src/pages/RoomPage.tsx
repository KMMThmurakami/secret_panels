import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LuCopy, LuCheck } from "react-icons/lu";
import { supabase } from "../supabaseClient";
import { digestMessage } from "../utils/crypto";
import "../App.css";

const postsTableName = import.meta.env.VITE_SUPABASE_TABLE_NAME as string;
const roomsTableName = import.meta.env.VITE_SUPABASE_CONFIG_NAME as string;

type Post = {
  id: number;
  name: string | null;
  comment: string;
  created_at: string;
  color: string;
};
type FormInputs = { name: string; comment: string };
type PasswordFormInputs = { password: string };

// ランダムに色を設定
const createShuffleGenerator = () => {
  const masterColors = [
    'hsl(0, 70%, 85%)',   // 赤系
    'hsl(45, 70%, 85%)',  // オレンジ系
    'hsl(90, 70%, 85%)',  // 黄色系
    'hsl(135, 70%, 85%)', // 黄緑系
    'hsl(180, 70%, 85%)', // シアン系
    'hsl(225, 70%, 85%)', // 青系
    'hsl(270, 70%, 85%)', // 紫系
    'hsl(315, 70%, 85%)'  // マゼンタ系
  ];
  
  // 「まだ使える色」のリスト。最初はマスターリストのコピー
  let remainingColors: string[] = [];

  return () => {
    // もし「まだ使える色」が1つもなければ、マスターリストからコピーしてリセットする
    if (remainingColors.length === 0) {
      remainingColors = [...masterColors];
    }
    
    // 「まだ使える色」のリストの中からランダムなインデックスを決定
    const randomIndex = Math.floor(Math.random() * remainingColors.length);
    
    // spliceを使って、ランダムな位置から色を1つ「取り出す」
    // これにより、リストから色が削除され、戻り値としてその色が返る
    const chosenColor = remainingColors.splice(randomIndex, 1)[0];
    
    return chosenColor;
  };
};
const getUniqueRandomColor = createShuffleGenerator();

function RoomPage() {
  const { hashedRoomId } = useParams<{ hashedRoomId: string }>();

  const [room, setRoom] = useState<{
    id: number;
    name: string;
    password_hash: string | null;
  } | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInputs>();

  const {
    register: registerPassword,
    handleSubmit: handleSubmitPassword,
    reset: resetPassword,
    formState: { errors: passwordErrors },
  } = useForm<PasswordFormInputs>();

  useEffect(() => {
    if (!hashedRoomId) return;

    // 部屋の情報を取得
    const fetchRoomData = async () => {
      // ハッシュIDから部屋の内部IDとパスワードを取得
      const { data: roomData, error: roomError } = await supabase
        .from(roomsTableName)
        .select("id, name, password_hash")
        .eq("hashed_id", hashedRoomId)
        .single();

      if (roomError || !roomData) {
        console.error("Room not found:", roomError);
        setLoading(false);
        return;
      }
      setRoom(roomData);

      // 部屋に紐づく投稿を取得
      const { data: postsData, error: postsError } = await supabase
        .from(postsTableName)
        .select("*")
        .eq("room_id", roomData.id)
        .order("created_at", { ascending: true });

      if (postsError) console.error("Error fetching posts:", postsError);
      else setPosts(postsData || []);

      setLoading(false);
    };

    fetchRoomData();

    // リアルタイムリスナーを設定
    const postsChannel = supabase
      .channel(`posts_${hashedRoomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: postsTableName,
          filter: `room_id=eq.${room?.id}`,
        },
        (payload) => setPosts((p) => [...p, payload.new as Post])
      )
      .subscribe();

    const roomChannel = supabase
      .channel(`room_${hashedRoomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: roomsTableName,
          filter: `hashed_id=eq.${hashedRoomId}`,
        },
        (payload) => {
          setRoom((r) =>
            r ? { ...r, password_hash: payload.new.password_hash } : null
          );
          setIsOpen(false);
          alert("合言葉が設定されました。");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(postsChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [hashedRoomId, room?.id, posts]);

  const onPostSubmit: SubmitHandler<FormInputs> = async (data) => {
    if (!room) return;
    setIsSubmitting(true);

    // ランダムな色を生成
    const randomColor = getUniqueRandomColor();

    await supabase.from(postsTableName).insert({
      room_id: room.id,
      name: data.name || null,
      comment: data.comment,
      color: randomColor,
    });
    reset();
    setIsSubmitting(false);
  };

  const onPasswordSubmit: SubmitHandler<PasswordFormInputs> = async (data) => {
    if (!room) return;
    const hash = await digestMessage(data.password);
    const { error } = await supabase
      .from(roomsTableName)
      .update({
        password_hash: hash,
        password_updated_at: new Date().toISOString(),
      })
      .eq("id", room.id);

    if (error) {
      alert("エラーが発生しました。");
      console.error(error);
    } else {
      resetPassword();
      alert("合言葉を設定しました。");
    }
  };

  const handleToggleOpen = async () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    if (!room?.password_hash) {
      // パスワードが設定されていない場合は、そのまま表示
      setIsOpen(true);
      return;
    }

    const input = window.prompt("合言葉を入力してください:");
    if (input === null || input === "") return;

    const inputHash = await digestMessage(input);

    if (inputHash === room.password_hash) {
      setIsOpen(true);
    } else {
      alert("合言葉が違います。");
    }
  };

  const handleResetPost = async () => {
    if (!room) return;
    const input = window.prompt(
      "コメントをリセットするには、合言葉を入力してください:"
    );

    if (input === null || input === "") return;

    const inputHash = await digestMessage(input);

    if (inputHash !== room.password_hash) {
      alert("合言葉が違います。");
      return;
    }

    if (
      !window.confirm(
        "この部屋のすべてのコメントをリセットします。本当によろしいですか？"
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from(postsTableName)
      .delete()
      .eq("room_id", room.id);

    if (error) {
      alert("エラーが発生しました。");
      console.error(error);
    } else {
      setPosts([]); // 画面上の投稿リストも空にする
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setIsCopied(true);

      // 2秒後にアイコンを元に戻す
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch (err) {
      console.error("URLのコピーに失敗しました。", err);
      alert("URLのコピーに失敗しました。");
    }
  };

  if (loading) return <div>読み込み中...</div>;
  if (!room) return <div>部屋が見つかりません。</div>;

  return (
    <div className="board-container">
      <header>
        <nav>
          <Link to="/" className="back-link secondary-button">
            HOMEへ戻る
          </Link>
        </nav>
        <button onClick={handleCopyUrl} className="copy-link-button">
          {isCopied ? (
            <>
              <LuCheck color="green" /> コピーしました！
            </>
          ) : (
            <>
              <LuCopy /> 部屋のURLをコピー
            </>
          )}
        </button>
      </header>
      <div className="board-head">
        <h2 className="room-name">{room.name}</h2>
        {/* 合言葉設定と表示ボタンのセクション */}
        <section className="controls-section">
          {!room.password_hash && (
            <form
              onSubmit={handleSubmitPassword(onPasswordSubmit)}
              className="form-group password-form"
            >
              <input
                type="password"
                placeholder="合言葉を設定"
                {...registerPassword("password", {
                  required: "合言葉は必須です",
                  maxLength: {
                    value: 255,
                    message: "パスワードは255文字以内で入力してください",
                  },
                })}
              />
              <button type="submit" className="primary-button">
                設定
              </button>
              {passwordErrors.password && (
                <p className="error-message">
                  {passwordErrors.password.message}
                </p>
              )}
            </form>
          )}
          {room.password_hash && (
            <>
              <button
                onClick={handleToggleOpen}
                className={`toggle-button ${
                  isOpen ? "secondary-button" : "primary-button"
                }`}
              >
                {isOpen ? "コメントを隠す" : "コメントを表示する"}
              </button>
              <button onClick={handleResetPost} className="danger-button">
                コメントをリセット
              </button>
            </>
          )}
        </section>
      </div>

      <section className="post-list">
        {posts.map((post, index) => (
          <div key={post.id} className="post-item" style={{ backgroundColor: post.color }}>
            <div className="post-header">
              <span>{index + 1}: </span>
              <span className="post-name">{post.name || "名無しさん"}</span>
              <span className="post-timestamp">
                {" "}
                [{new Date(post.created_at).toLocaleString("ja-JP")}]
              </span>
            </div>
            <div className={isOpen ? "post-comment" : "post-comment post-comment-hidden"}>
              {post.comment.split("\n").map((line, i) => (
                <span key={i}>
                  {isOpen ? line : "？？？？"}
                  <br />
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>

      <hr />

      {/* 投稿フォームエリア */}
      <section className="form-section">
        <form onSubmit={handleSubmit(onPostSubmit)}>
          <div className="form-group">
            <label htmlFor="name">名前:</label>
            <input
              id="name"
              type="text"
              placeholder="名無しさん"
              {...register("name", {
                maxLength: {
                  value: 32,
                  message: "名前は32文字以内で入力してください",
                },
              })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="comment">コメント:</label>
            <textarea
              id="comment"
              placeholder="コメントを入力"
              rows={4}
              {...register("comment", {
                required: "コメントは必須入力です",
                maxLength: {
                  value: 255,
                  message: "コメントは255文字以内で入力してください",
                },
              })}
            />
            {errors.name && (
              <p className="error-message">{errors.name.message}</p>
            )}
            {errors.comment && (
              <p className="error-message">{errors.comment.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="primary-button"
          >
            {isSubmitting ? "書き込み中..." : "書き込む"}
          </button>
        </form>
      </section>
    </div>
  );
}

export default RoomPage;
