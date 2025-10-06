import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { digestMessage } from "../utils/crypto";
import "../App.css";

const roomsTableName = import.meta.env.VITE_SUPABASE_CONFIG_NAME as string;

function HomePage() {
  const [isCreating, setIsCreating] = useState(false);
  const [roomName, setRoomName] = useState("");
  const navigate = useNavigate();

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      alert("部屋の名前を入力してください。");
      return;
    }

    setIsCreating(true);
    try {
      // 部屋の一意なIDとして、現在時刻と乱数を組み合わせた文字列を生成
      const uniqueString = `${Date.now()}${Math.random()}`;
      const hashedId = await digestMessage(uniqueString);

      // 新しい部屋をDBに作成
      const { data, error } = await supabase
        .from(roomsTableName)
        .insert({ hashed_id: hashedId, name: roomName })
        .select()
        .single();

      if (error) throw error;

      // 作成した部屋のURLに移動
      navigate(`/room/${data.hashed_id}`);
    } catch (error) {
      console.error("Error creating room:", error);
      alert("部屋の作成に失敗しました。");
      setIsCreating(false);
    }
  };

  return (
    <div className="home-container">
      <h1>ようこそ！</h1>
      <p>新しい掲示板の部屋を作成して、URLを友達と共有しよう。</p>
      <div className="create-room-form">
        <input
          type="text"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder="部屋の名前"
        />
        <button onClick={handleCreateRoom} disabled={isCreating}>
          {isCreating ? '作成中...' : '新しい部屋を作成する'}
        </button>
      </div>
    </div>
  );
}

export default HomePage;
