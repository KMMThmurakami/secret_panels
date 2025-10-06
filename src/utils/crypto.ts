// ハッシュ化関数
export async function digestMessage(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message); // 文字列をUTF-8のバイト配列に変換
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8); // ハッシュを計算
  const hashArray = Array.from(new Uint8Array(hashBuffer)); // バイト配列に変換
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join(''); // 16進数文字列に変換
  return hashHex;
}
