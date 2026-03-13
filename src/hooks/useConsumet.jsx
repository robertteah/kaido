import axios from "axios";
import { useQuery } from "react-query";

const apiOrigin =
  import.meta.env.VITE_CONSUMET_API_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:3000";

const BASE_URLS = [`${apiOrigin}/anime/gogoanime`];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function findBestMatch(results, name) {
  const normalizedName = normalizeText(name);

  return [...results].sort((left, right) => {
    const leftTitles = [
      left.title,
      left.japaneseTitle,
      left.title_english,
      left.title_romaji,
    ].map(normalizeText);
    const rightTitles = [
      right.title,
      right.japaneseTitle,
      right.title_english,
      right.title_romaji,
    ].map(normalizeText);

    const score = (titles) => {
      if (titles.some((title) => title === normalizedName)) {
        return 3;
      }
      if (
        titles.some(
          (title) =>
            title.includes(normalizedName) || normalizedName.includes(title)
        )
      ) {
        return 2;
      }
      return 1;
    };

    return score(rightTitles) - score(leftTitles);
  })[0];
}

function handleConsumetResponse(endpoint, parameter) {
  const results = useQuery(`${endpoint}${parameter}`, async () => {
    if (!parameter) {
      return undefined;
    }

    let lastError = null;
    for (const baseUrl of BASE_URLS) {
      try {
        return await axios.get(`${baseUrl}${endpoint}${parameter}`);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  });

  if (!parameter) {
    return { isLoading: true };
  }

  return {
    isLoading: results.isLoading,
    isError: results.isError,
    data: results.data?.data,
  };
}

/**
 *
 * @param  name
 * @returns an object containing loading and error states from the query and data retrieved
 */

export function useSearch(name) {
  if (!name) {
    return { isLoading: true };
  }

  const normalizedName = encodeURIComponent(name.toLowerCase());
  const searchResults = handleConsumetResponse("/", normalizedName);
  const results = searchResults.data?.results;

  if (!results) {
    return {
      isLoading: searchResults.isLoading,
      isError: searchResults.isError,
    };
  }

  if (results?.length === 0) {
    return { noAnime: true };
  }

  const bestMatch = findBestMatch(results, name);

  return {
    dub: bestMatch?.dub > 0 ? bestMatch : undefined,
    sub: bestMatch?.sub > 0 ? bestMatch : undefined,
    isLoading: searchResults.isLoading,
    isError: searchResults.isError,
  };
}

export function useAnimeInfo(id) {
  const results = handleConsumetResponse(`/info/`, id);
  if (!results.isLoading && results.data) {
    return results.data;
  }
}
export function useServers({ episodeId, subOrDub }) {
  const results = handleConsumetResponse(
    `/servers/`,
    episodeId ? `${episodeId}?subOrDub=${subOrDub}` : null
  );

  if (!results.isLoading && results.data) {
    return results.data;
  }
}

export function useEpisodeFiles({ server, id, subOrDub }) {
  const results = handleConsumetResponse(
    "/watch/",
    server && id ? `${id}?server=${encodeURIComponent(server.id)}&subOrDub=${subOrDub}` : null
  );
  if (!results.isLoading && results.data) {
    return {
      sources: results.data.sources,
      headers: results.data.headers,
      isLoading: results.isLoading,
    };
  } else {
    return { isLoading: results.isLoading };
  }
}
