import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, type SubmitHandler } from "react-hook-form";
import { supabase } from "../supabaseClient";
import { digestMessage } from "../utils/crypto";
import "../App.css";

const roomsTableName = import.meta.env.VITE_SUPABASE_CONFIG_NAME as string;

type FormInputs = {
  roomName: string;
};

function HomePage() {
  const [isCreating, setIsCreating] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInputs>();
  const navigate = useNavigate();

  const onSubmit: SubmitHandler<FormInputs> = async (data) => {
    setIsCreating(true);

    // 空文字の場合は「無題の部屋」を設定
    const roomNameToSend = data.roomName.trim() || "無題の部屋";

    try {
      const uniqueString = `${Date.now()}${Math.random()}`;
      const hashedId = await digestMessage(uniqueString);

      const { data: roomData, error } = await supabase
        .from(roomsTableName)
        .insert({
          hashed_id: hashedId,
          name: roomNameToSend,
        })
        .select()
        .single();

      if (error) throw error;

      navigate(`/room/${roomData.hashed_id}`);
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
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="create-room-form form-group"
      >
        <input
          type="text"
          placeholder="部屋の名前"
          {...register("roomName", {
            maxLength: {
              value: 255,
              message: "部屋名は255文字以内で入力してください",
            },
          })}
        />
        {errors.roomName && (
          <p className="error-message">{errors.roomName.message}</p>
        )}
        <button type="submit" disabled={isCreating}>
          {isCreating ? "作成中..." : "新しい部屋を作成する"}
        </button>
      </form>
    </div>
  );
}

export default HomePage;
