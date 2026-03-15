import axios from "axios";
import { useQuery } from "react-query";

const apiOrigin =
  import.meta.env.VITE_CONSUMET_API_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:3000";

const GOGOANIME_BASE_URL = `${apiOrigin}/anime/gogoanime`;
const KAIDO_BASE_URL = `${apiOrigin}/anime/kaido`;

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

function normalizeEpisodeId(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  try {
    if (rawValue.startsWith("http://") || rawValue.startsWith("https://")) {
      const url = new URL(rawValue);
      return url.searchParams.get("ep") || rawValue;
    }
  } catch (_error) {
    // Ignore invalid URLs and keep parsing as a plain string.
  }

  const queryIndex = rawValue.indexOf("?ep=");
  if (queryIndex >= 0) {
    return rawValue.slice(queryIndex + 4).split("&")[0];
  }

  return rawValue;
}

function handleApiResponse(baseUrl, endpoint, parameter) {
  const results = useQuery(
    `${baseUrl}${endpoint}${parameter}`,
    async () => {
      if (!parameter) {
        return undefined;
      }

      return axios.get(`${baseUrl}${endpoint}${parameter}`);
    },
    {
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );

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
  const searchResults = handleApiResponse(
    GOGOANIME_BASE_URL,
    "/",
    normalizedName
  );
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
  const results = handleApiResponse(GOGOANIME_BASE_URL, `/info/`, id);
  if (!results.isLoading && results.data) {
    return results.data;
  }
}
export function useServers({ episodeId, subOrDub }) {
  const normalizedEpisodeId = normalizeEpisodeId(episodeId);
  const results = handleApiResponse(
    KAIDO_BASE_URL,
    `/servers/`,
    normalizedEpisodeId || null
  );

  if (!results.isLoading && results.data) {
    return results.data.servers?.filter((server) => server.type === subOrDub);
  }
}

export function useEpisodeFiles({ id, subOrDub }) {
  const normalizedEpisodeId = normalizeEpisodeId(id);
  const results = handleApiResponse(
    KAIDO_BASE_URL,
    "/watch-by-episode/",
    normalizedEpisodeId ? `${normalizedEpisodeId}?type=${subOrDub}` : null
  );
  if (!results.isLoading && results.data) {
    return {
      sources: results.data.sources,
      headers: results.data.headers,
      server: results.data.server,
      isLoading: results.isLoading,
    };
  } else {
    return { isLoading: results.isLoading };
  }
}
