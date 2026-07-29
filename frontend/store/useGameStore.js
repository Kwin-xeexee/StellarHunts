import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import axios from "axios";

/**
 * Returns a storage adapter that debounces `setItem` so that the
 * hot-path game actions (auth, score updates, NFT additions) don't
 * trigger a synchronous localStorage write on every `set()` call.
 * Bursts of mutations within `delayMs` collapse into one write.
 *
 * `removeItem` is flushed immediately so logout/reset semantics
 * aren't affected by the throttle window.
 *
 * Implementation note: the returned adapter is captured by
 * `createJSONStorage` exactly once (Zustand invokes the factory
 * function once and caches the result). The closure-scoped `timer`
 * and `pendingValue` therefore survive across `setItem` calls. Do
 * not move the factory invocation inside `setItem` or the debounce
 * will be defeated by per-call instance re-creation.
 */

const createThrottledStorage = (storage, delayMs = 150) => {
  let timer = null;
  let pendingValue = null;
  const flush = () => {
    if (pendingValue !== null) {
      try {
        storage.setItem("game-storage", pendingValue);
      } catch (e) {
        // Quota or serialization errors should not break gameplay.
      }
      pendingValue = null;
    }
    timer = null;
  };
  return {
    getItem: (name) => storage.getItem(name),
    setItem: (name, value) => {
      pendingValue = value;
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(flush, delayMs);
    },
    removeItem: (name) => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pendingValue = null;
      storage.removeItem(name);
    },
  };
};

/**
 * Returns `window.localStorage` in the browser, or a no-op storage
 * during SSR so `persist` doesn't crash during Next.js static
 * generation / server rendering.
 */
const safeLocalStorage = () => {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }
  return window.localStorage;
};

const useGameStore = create(
  persist(
    (set, get) => ({
      // User state
      user: null,

      // Game progress
      currentDifficulty: "easy",
      currentPuzzleIndex: 0,
      completedPuzzles: [],
      completedDifficulties: [],
      score: 0,

      // NFT collection
      nfts: [],

      // Auth actions
      register: async (username, password) => {
        try {
          const response = await axios.post(
            "http://localhost:3001/auth/register",
            { username, password },
            { withCredentials: true },
          );
          set({ user: response.data });
        } catch (error) {
          console.error("Registration failed:", error);
          throw error;
        }
      },

      login: async (username, password) => {
        try {
          const response = await axios.post(
            "http://localhost:3001/auth/login",
            { username, password },
            { withCredentials: true },
          );
          set({ user: response.data });
        } catch (error) {
          console.error("Login failed:", error);
          throw error;
        }
      },

      logout: async () => {
        try {
          await axios.post(
            "http://localhost:3001/auth/logout",
            {},
            { withCredentials: true },
          );
          set({
            user: null,
            currentDifficulty: "easy",
            currentPuzzleIndex: 0,
            completedPuzzles: [],
            completedDifficulties: [],
            score: 0,
            nfts: [],
          });
        } catch (error) {
          console.error("Logout failed:", error);
        }
      },

      // Game actions
      completePuzzle: async (puzzleId) => {
        const {
          user,
          currentDifficulty,
          currentPuzzleIndex,
          completedPuzzles,
          completedDifficulties,
          score,
        } = get();
        if (!user) return;

        const newCompletedPuzzles = [...completedPuzzles, puzzleId];
        const currentDifficultyPuzzles = newCompletedPuzzles.filter((id) =>
          id.startsWith(currentDifficulty),
        );

        const isLevelCompleted = currentDifficultyPuzzles.length === 5;
        const newCompletedDifficulties = isLevelCompleted
          ? [...completedDifficulties, currentDifficulty]
          : completedDifficulties;

        let nextDifficulty = currentDifficulty;
        let nextPuzzleIndex = (currentPuzzleIndex + 1) % 5;

        if (isLevelCompleted) {
          const difficultyLevels = ["easy", "medium", "difficult", "advanced"];
          const currentIndex = difficultyLevels.indexOf(currentDifficulty);
          if (currentIndex < difficultyLevels.length - 1) {
            nextDifficulty = difficultyLevels[currentIndex + 1];
            nextPuzzleIndex = 0;
          }
        }

        const newScore = score + 100;

        // Update the backend
        try {
          await axios.post(
            "http://localhost:3001/game/update",
            {
              userId: user.id,
              completedPuzzles: newCompletedPuzzles,
              completedDifficulties: newCompletedDifficulties,
              currentDifficulty: nextDifficulty,
              currentPuzzleIndex: nextPuzzleIndex,
              score: newScore,
            },
            { withCredentials: true },
          );

          set({
            completedPuzzles: newCompletedPuzzles,
            completedDifficulties: newCompletedDifficulties,
            currentDifficulty: nextDifficulty,
            currentPuzzleIndex: nextPuzzleIndex,
            score: newScore,
          });
        } catch (error) {
          console.error("Failed to update game progress:", error);
        }
      },

      addNFT: async (nft) => {
        const { user, nfts } = get();
        if (!user) return;

        try {
          await axios.post(
            "http://localhost:3001/nft/add",
            {
              userId: user.id,
              nft,
            },
            { withCredentials: true },
          );

          set({ nfts: [...nfts, nft] });
        } catch (error) {
          console.error("Failed to add NFT:", error);
        }
      },

      // Server-side paginated fetch used by the virtualized gallery.
      // Returns { items, page, limit, total, hasMore } and merges new items
      // into the in-memory store without touching localStorage (#104).
      fetchNftsPage: async ({ page = 1, limit = 20 } = {}) => {
        const { user } = get();
        if (!user) return { items: [], page, limit, total: 0, hasMore: false };

        try {
          const response = await axios.get(
            `http://localhost:3001/users/${user.id}/inventory/nfts`,
            {
              params: { page, limit },
              withCredentials: true,
            },
          );

          const data = response.data || {};
          const items = data.items || data || [];
          const total = data.total ?? items.length;
          const hasMore = data.hasMore ?? page * limit < total;

          if (page === 1) {
            set({ nfts: items });
          } else {
            const existing = get().nfts || [];
            const seen = new Set(existing.map((n) => n.id));
            const merged = existing.concat(
              items.filter((n) => n && !seen.has(n.id)),
            );
            set({ nfts: merged });
          }

          return { items, page, limit, total, hasMore };
        } catch (error) {
          console.error("Failed to fetch NFT page:", error);
          return { items: [], page, limit, total: 0, hasMore: false };
        }
      },

      // Load user data
      loadUserData: async () => {
        const { user } = get();
        if (!user) return;

        try {
          const response = await axios.get(
            `http://localhost:3001/user/${user.id}`,
            { withCredentials: true }
            `http://localhost:4001/user/${user.id}`,
            { withCredentials: true },
          );
          set(response.data);
        } catch (error) {
          console.error("Failed to load user data:", error);
        }
      },

      // Reset progress
      resetProgress: async () => {
        const { user } = get();
        if (!user) return;

        try {
          await axios.post(
            `http://localhost:3001/game/reset`,
            { userId: user.id },
            { withCredentials: true },
          );
          set({
            currentDifficulty: "easy",
            currentPuzzleIndex: 0,
            completedPuzzles: [],
            completedDifficulties: [],
            score: 0,
            nfts: [],
          });
        } catch (error) {
          console.error("Failed to reset progress:", error);
        }
      },
    }),
    {
      name: "game-storage",
      // Throttle writes so the localStorage payload is only re-serialised
      // and written once per coalescing window (see `createThrottledStorage`).
      storage: createJSONStorage(() =>
        createThrottledStorage(safeLocalStorage()),
      ),
      // Only durable progress fields are persisted. Transient state (none
      // currently, but a narrow allow-list keeps the storage size small and
      // future-proofs against accidental bloat) is excluded.
      partialize: (state) => ({
        user: state.user,
        completedPuzzles: state.completedPuzzles,
        completedDifficulties: state.completedDifficulties,
        currentDifficulty: state.currentDifficulty,
        currentPuzzleIndex: state.currentPuzzleIndex,
        score: state.score,
        nfts: state.nfts,
      }),
      version: 1,
    },
  ),
);

export default useGameStore;
