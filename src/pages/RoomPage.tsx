import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useForm, type SubmitHandler } from "react-hook-form";
import {
  LuCopy,
  LuCheck,
  LuPencil,
  LuLayoutGrid,
  LuList,
  LuChevronUp,
  LuChevronDown,
} from "react-icons/lu";
import { supabase } from "../supabaseClient";
import { RealtimeChannel } from "@supabase/supabase-js";
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
type Room = {
  id: number;
  name: string;
  password_hash: string | null;
  is_open: boolean;
};
type FormInputs = { name: string; comment: string };
type PasswordFormInputs = { password: string };
type RoomNameFormInputs = { roomName: string };
type PresenceState = { is_typing: boolean };
// ランダムに色を設定
const createShuffleGenerator = () => {
  const masterColors = [
    "hsl(0, 70%, 85%)", // 赤系
    "hsl(45, 70%, 85%)", // オレンジ系
    "hsl(90, 70%, 85%)", // 黄色系
    "hsl(135, 70%, 85%)", // 黄緑系
    "hsl(180, 70%, 85%)", // シアン系
    "hsl(225, 70%, 85%)", // 青系
    "hsl(270, 70%, 85%)", // 紫系
    "hsl(315, 70%, 85%)", // マゼンタ系
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

  const [room, setRoom] = useState<Room | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isClassic, setIsClassic] = useState(false);
  const [isFormVisible, setIsFormVisible] = useState(true);

  // 書き込み中の人数をカウントするstate
  const [typingUsersCount, setTypingUsersCount] = useState(0);

  // 自分のタイピング状態をローカルで管理するstate
  const [isCurrentlyTyping, setIsCurrentlyTyping] = useState(false);

  // チャンネルのインスタンスを保持するためのref
  const channelRef = useRef<RealtimeChannel | null>(null);

  // タイピング停止を検知するタイマーのIDを保持するためのref
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isOpen = room?.is_open || false;
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

  const {
    register: registerRoomName,
    handleSubmit: handleSubmitRoomName,
    reset: resetRoomName,
    formState: { errors: roomNameErrors },
  } = useForm<RoomNameFormInputs>();

  useEffect(() => {
    if (!hashedRoomId) return;

    // 部屋の情報を取得
    const fetchRoomData = async () => {
      // ハッシュIDから部屋の内部IDとパスワードを取得
      const { data: roomData, error: roomError } = await supabase
        .from(roomsTableName)
        .select("id, name, password_hash, is_open")
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
  }, [hashedRoomId]);

  useEffect(() => {
    if (!room?.id || !hashedRoomId) return;

    // 入力ユーザーの監視準備
    const myPresenceKey = Math.random().toString(36).substring(7);
    const channel = supabase.channel(`room-channel:${hashedRoomId}`, {
      config: {
        presence: {
          key: myPresenceKey,
        },
      },
    });

    // 作成したチャンネルをrefに保存
    channelRef.current = channel;

    // リアルタイムリスナー
    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: postsTableName,
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => {
          // 既存の投稿リストに新しい投稿を追加する
          setPosts((currentPosts) => [...currentPosts, payload.new as Post]);
          console.log("新しいpostを検知");
        }
      )
      .on(
        "broadcast",
        { event: "reset" }, // 'reset' という名前のイベントを待つ
        () => {
          // 'reset' イベントを受け取ったら、投稿リストを空にする
          setPosts([]);
        }
      )
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
            r
              ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                { ...r, password_hash: (payload.new as any).password_hash }
              : null
          );
          const newRoomData = payload.new as Room;
          setRoom(newRoomData);
        }
      )
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState<PresenceState>();
        const myKey = myPresenceKey;

        let typingCount = 0;

        for (const key in presenceState) {
          // 自分自身はカウントしない
          if (key === myKey) continue;

          // presenceState[key]は配列（同じキーで複数タブを開けるため）
          // 最初の要素の状態をチェック
          if (presenceState[key][0]?.is_typing) {
            typingCount++;
          }
        }
        // カウントをstateにセット
        setTypingUsersCount(typingCount);
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;

        await channel.track({
          is_typing: false,
        });
      });

    // このコンポーネントが画面から消える時に、監視を終了する
    return () => {
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [room?.id, hashedRoomId]);

  const [isRotating, setIsRotating] = useState(false);
  const [isCommentVisible, setIsCommentVisible] = useState(false);
  useEffect(() => {
    let timerRotate: string | number | NodeJS.Timeout | undefined;
    let timerCommentVisible: string | number | NodeJS.Timeout | undefined;
    // isOpenがtrueになった時（コメントを表示する時）
    if (isOpen) {
      setIsRotating(true);
      timerRotate = setTimeout(() => {
        setIsRotating(false);
      }, 1000);
      timerCommentVisible = setTimeout(() => {
        setIsCommentVisible(true);
      }, 650);
    } else {
      // isOpenがfalseになった時（コメントを隠す時）は即座に非表示
      setIsCommentVisible(false);
    }

    // コンポーネントがアンマウントされるか、
    // isOpenが再度変更された場合にタイマーをクリアするクリーンアップ関数
    return () => {
      clearTimeout(timerRotate);
      clearTimeout(timerCommentVisible);
    };
  }, [isOpen]);

  const handleTyping = () => {
    if (!channelRef.current) return;

    // すでに入力中（isCurrentlyTypingがtrue）でなければ、
    // 状態を「タイピング中」に更新
    if (!isCurrentlyTyping) {
      channelRef.current.track({ is_typing: true });
      setIsCurrentlyTyping(true); // ローカルのstateも更新
    }

    // もし既存の「停止タイマー」があれば解除
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // 3秒後に「タイピング停止」を送信するタイマーをセット
    typingTimeoutRef.current = setTimeout(() => {
      if (channelRef.current) {
        channelRef.current.track({ is_typing: false });
      }
      setIsCurrentlyTyping(false); // ローカルのstateも更新
      typingTimeoutRef.current = null;
    }, 3000); // 3秒間入力がなければ停止とみなす
  };

  const onPostSubmit: SubmitHandler<FormInputs> = async (data) => {
    if (!room) return;
    setIsSubmitting(true);

    // ランダムな色を生成
    const randomColor = getUniqueRandomColor();

    await supabase.from(postsTableName).insert({
      room_id: room.id,
      room_id_bk: room.id,
      name: data.name || null,
      comment: data.comment,
      color: randomColor,
    });
    reset({
      name: data.name, // name は保持
      comment: "",
    });
    setIsSubmitting(false);
    if (channelRef.current) {
      channelRef.current.track({ is_typing: false });
    }
    setIsCurrentlyTyping(false);
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
    if (!room) return;

    // 現在の状態を反転させた新しい状態
    const newIsOpenState = !isOpen;

    // もしコメントを「表示する」操作で、かつパスワードが設定されている場合
    if (newIsOpenState === true && room.password_hash) {
      const input = window.prompt("合言葉を入力してください:");
      if (input === null || input === "") return;

      const inputHash = await digestMessage(input);

      if (inputHash !== room.password_hash) {
        alert("合言葉が違います。");
        return;
      }
    }

    // 合言葉のチェックを通過した、または不要な場合、DBを更新
    const { error } = await supabase
      .from(roomsTableName)
      .update({ is_open: newIsOpenState }) // DBのis_openを更新
      .eq("id", room.id);

    if (error) {
      alert("エラーが発生しました。");
      console.error(error);
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
      .update({ room_id: null })
      .eq("room_id", room.id);

    if (error) {
      alert("エラーが発生しました。");
      console.error(error);
    } else {
      const { error: roomError } = await supabase
        .from(roomsTableName)
        .update({ is_open: false }) // コメントを閉じた状態に
        .eq("id", room.id);

      if (roomError) {
        alert("部屋の状態更新に失敗しました。");
        console.error(roomError);
      }

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "reset",
        });
      } else {
        console.error("チャンネルが見つかりません。");
      }
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

  const onUpdateRoomName: SubmitHandler<RoomNameFormInputs> = async (data) => {
    if (!room) return;

    const newName = data.roomName.trim();
    if (!newName) {
      return;
    }

    const { data: updatedRoom, error } = await supabase
      .from(roomsTableName)
      .update({ name: newName })
      .eq("id", room.id)
      .select()
      .single();

    if (error) {
      alert("名前の更新に失敗しました。");
    } else {
      setRoom(updatedRoom as Room);
      setIsEditingName(false);
    }
  };

  if (loading) return <div>読み込み中...</div>;
  if (!room)
    return (
      <>
        <div>部屋が見つかりません。</div>
        <Link to="/">HOMEへ戻る</Link>
      </>
    );

  return (
    <div className={`board-container ${isFormVisible ? "board-container-margin" : ""}`}>
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
        <div className="room-name-container">
          {isEditingName ? (
            <form
              onSubmit={handleSubmitRoomName(onUpdateRoomName)}
              className="room-name-editWrap"
            >
              <div className="room-name-edit">
                <input
                  type="text"
                  {...registerRoomName("roomName", {
                    required: "部屋の名前は必須です",
                    maxLength: {
                      value: 255,
                      message: "部屋名は255文字以内で入力してください",
                    },
                  })}
                  autoFocus
                />
                <div className="room-name-edit-buttonWrap">
                  <button type="submit" className="primary-button">
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingName(false)}
                    className="secondary-button"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
              {roomNameErrors.roomName && (
                <p className="error-message">
                  {roomNameErrors.roomName.message}
                </p>
              )}
            </form>
          ) : (
            <>
              <h2 className="room-name">{room.name}</h2>
              <button
                onClick={() => {
                  setIsEditingName(true);
                  resetRoomName({ roomName: room.name });
                }}
                className="edit-name-button"
                title="部屋名を編集"
              >
                <LuPencil />
              </button>
            </>
          )}
        </div>
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
              <button
                onClick={handleResetPost}
                className="toggle-button danger-button"
              >
                コメントをリセット
              </button>
            </>
          )}
        </section>
      </div>
      <div className="view-toggle-section">
        <button
          onClick={() => setIsClassic(false)}
          className={`view-toggle-button ${
            isClassic === false ? "active" : ""
          }`}
          title="パネル表示"
        >
          <LuLayoutGrid />
        </button>
        <button
          onClick={() => setIsClassic(true)}
          className={`view-toggle-button ${isClassic === true ? "active" : ""}`}
          title="リスト表示"
        >
          <LuList />
        </button>
      </div>
      <section
        className={`${isClassic === true ? "post-list-classic" : "post-list"}`}
      >
        {posts.map((post, index) => (
          <div
            key={post.id}
            className={`${
              isClassic === true ? "post-item-classic" : "post-item"
            } ${isClassic === false && isRotating ? "rotate" : ""}`}
            style={{
              backgroundColor: isClassic === false ? post.color : "transparent",
            }}
          >
            <div className="post-header">
              <span>{index + 1}: </span>
              <span className="post-name">{post.name || "名無しさん"}</span>
              <span className="post-timestamp">
                {" "}
                [{new Date(post.created_at).toLocaleString("ja-JP")}]
              </span>
            </div>
            <div
              className={
                isCommentVisible
                  ? "post-comment"
                  : "post-comment post-comment-hidden"
              }
            >
              {post.comment.split("\n").map((line, i) => (
                <span key={i}>
                  {isCommentVisible ? line : "？？？？？"}
                  <br />
                </span>
              ))}
            </div>
          </div>
        ))}
        {Array(typingUsersCount)
          .fill(0)
          .map((_, index) => (
            <div
              key={index}
              className={`${
                isClassic === true ? "post-item-classic" : "post-item"
              }`}
              style={{
                backgroundColor: isClassic === false ? "#ccc" : "transparent",
                opacity: 0.5,
              }}
            >
              <div className="post-comment">
                <span>書き込み中...</span>
              </div>
            </div>
          ))}
      </section>

      {/* 投稿フォームエリア */}
      <section className={`form-section ${isFormVisible ? "is-visible" : ""}`}>
        <div className="form-header" onClick={() => setIsFormVisible(!isFormVisible)}>
            <h3>{isFormVisible ? "コメントを投稿" : "投稿フォームを開く"}</h3>
            <button
              className="form-toggle-button"
              title={isFormVisible ? "フォームを閉じる" : "投稿フォームを開く"}
            >
              {isFormVisible ? <LuChevronDown size={24} /> : <LuChevronUp size={24} />}
            </button>
          </div>
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
              onInput={handleTyping}
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
