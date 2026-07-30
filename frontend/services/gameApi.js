import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function fetchDifficultyConfig() {
  const response = await axios.get(`${BASE_URL}/game/difficulty-config`);
  return response.data;
}

export async function fetchPuzzleForDifficulty(difficulty, index) {
  const response = await axios.get(`${BASE_URL}/puzzles/${difficulty}/${index}`);
  return response.data;
}
