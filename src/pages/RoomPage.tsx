import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useForm, type SubmitHandler } from "react-hook-form";
import { supabase } from "../supabaseClient";
import { digestMessage } from "../utils/crypto";
import "../App.css";

const tableName = import.meta.env.VITE_SUPABASE_TABLE_NAME as string;
const roomsTableName = import.meta.env.VITE_SUPABASE_CONFIG_NAME as string;

type Post = {
  id: number;
  name: string | null;
  comment: string;
  created_at: string;
};
type FormInputs = { name: string; comment: string };

function RoomPage() {
  const { hashedRoomId } = useParams<{ hashedRoomId: string }>();

  const [room, setRoom] = useState<{
    id: number;
    password_hash: string | null;
  } | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInputs>();

  useEffect(() => {
    if (!hashedRoomId) return;

    // 部屋の情報を取得
    const fetchRoomData = async () => {
      // ハッシュIDから部屋の内部IDとパスワードを取得
      const { data: roomData, error: roomError } = await supabase
        .from(roomsTableName)
        .select("id, password_hash")
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
        .from(tableName)
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
          table: tableName,
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
          alert("合言葉が変更されました。");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(postsChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [hashedRoomId, room?.id, posts]);

  const onSubmit: SubmitHandler<FormInputs> = async (data) => {
    if (!room) return;
    setIsSubmitting(true);
    await supabase.from(tableName).insert({
      room_id: room.id,
      name: data.name || null,
      comment: data.comment,
    });
    reset();
    setIsSubmitting(false);
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room) return;
    if (!passwordInput) return alert("合言葉を入力してください。");

    const hash = await digestMessage(passwordInput);

    const { error } = await supabase
      .from(roomsTableName)
      .update({
        password_hash: hash,
        password_updated_at: new Date().toISOString(),
      })
      .eq("id", room.id); // 現在の部屋のIDを指定

    if (error) {
      alert("エラーが発生しました。");
      console.error(error);
    } else {
      setPasswordInput("");
      alert("合言葉を設定・変更しました。");
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

  if (loading) return <div>読み込み中...</div>;
  if (!room) return <div>部屋が見つかりません。</div>;

  return (
    <div className="board-container">
      <p>
        この部屋のURL: <code>{window.location.href}</code>
      </p>
      <header>
        <h2>掲示板</h2>
        {/* 合言葉設定と表示ボタンのセクション */}
        <section className="controls-section">
          {!room.password_hash && (
            <form
              onSubmit={handleSetPassword}
              className="form-group password-form"
            >
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="合言葉を設定・変更"
              />
              <button type="submit">設定</button>
            </form>
          )}
          {room.password_hash && (
            <button onClick={handleToggleOpen} className="toggle-button">
              {isOpen ? "コメントを隠す" : "コメントを表示する"}
            </button>
          )}
        </section>
      </header>

      <section className="post-list">
        {posts.map((post, index) => (
          <div key={post.id} className="post-item">
            <div className="post-header">
              <span>{index + 1}: </span>
              <span className="post-name">{post.name || "名無しさん"}</span>
              <span className="post-timestamp">
                {" "}
                [{new Date(post.created_at).toLocaleString("ja-JP")}]
              </span>
            </div>
            <div className={isOpen ? "post-comment" : "post-comment-hidden"}>
              {post.comment.split("\n").map((line, i) => (
                <span key={i}>
                  {isOpen ? line : "モザイクを破るの禁止！"}
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
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="form-group">
            <label htmlFor="name">名前:</label>
            <input
              id="name"
              type="text"
              placeholder="名無しさん"
              {...register("name")}
            />
          </div>
          <div className="form-group">
            <label htmlFor="comment">コメント:</label>
            <textarea
              id="comment"
              placeholder="コメントを入力"
              rows={4}
              {...register("comment", { required: "コメントは必須入力です" })}
            />
            {errors.comment && (
              <p className="error-message">{errors.comment.message}</p>
            )}
          </div>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "書き込み中..." : "書き込む"}
          </button>
        </form>
      </section>
    </div>
  );
}

export default RoomPage;
