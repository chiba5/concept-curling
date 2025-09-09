# 概念カーリング（Concept Curling）

AI が「概念同士の関連度」を採点する、新感覚の3人用ターン制ゲームです。  
プレイヤーはできるだけ孤立した概念を提出し、最も孤立度が高い概念を出したプレイヤーが勝者となります。  

👉 デモ: [https://concept-curling.onrender.com](https://concept-curling.onrender.com)

---

## 🎮 ゲームルール

1. プレイヤーは3人。各自2ターンずつ概念を提出します。
2. 概念が2つ以上揃うと、全ペアの関連度を **LLM(OpenAI)** が `0〜100` で採点。  
   - `0` = 非常に強い関連  
   - `100` = ほぼ無関係
3. 各概念について、他の概念とのスコアのうち **最も低いスコア（＝最も深い関連）** を代表値とします。
4. この代表値が最も高い（＝最も孤立している）概念を出したプレイヤーが勝利！

---

## ✨ 特徴

- **AI 採点が絶対基準**  
  人間の主観ではなく LLM が判定することで、公平かつユニークなゲーム性を実現。

- **孤立を目指す逆転の発想**  
  「関連度が低い＝勝ち」という、従来の連想ゲームとは真逆の戦略性。

- **アート性**  
  概念を点、関連度を辺の長さとみなし、最後には立体的な構造が浮かび上がる。  
  単なるゲームでなく、思考の「配置」を可視化するアート作品でもある。

---

## 🛠️ 技術スタック

- **フロントエンド**: HTML, CSS, JavaScript  
- **バックエンド**: Node.js (Express)  
- **AI 評価**: OpenAI Chat Completions API  
- **デプロイ**: Render (Free Plan)

---

## 🚀 ローカル開発

```bash
# クローン
git clone https://github.com/chiba5/concept-curling.git
cd concept-curling

# 依存インストール
npm install

# .env を作成して APIキーを設定
echo "OPENAI_API_KEY=sk-xxxxxxxx" > .env

# 開発サーバ起動
npm start
